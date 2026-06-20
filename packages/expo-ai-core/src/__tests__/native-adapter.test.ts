import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdapterStreamHandlers } from "../adapter.js";
import {
  createNativeAdapter,
  createUnavailableNativeAdapter,
  type NativeCapabilityProfile,
  type NativeStreamEvent,
  type NativeStreamingModule,
} from "../native-adapter.js";

const PROFILE: NativeCapabilityProfile = {
  isOnDevice: true,
  isSystemManagedModel: true,
  sendsPromptOffDevice: false,
  supportsTextGeneration: true,
  supportsStreaming: true,
  supportsSessions: true,
  supportsStructuredOutput: true,
  supportsTools: false,
  supportsImageInput: false,
  supportsSpeechInput: false,
  supportsSummarization: true,
  supportsRewrite: true,
  supportsProofreading: true,
  supportsBringYourOwnModel: false,
  supportsModelDownload: false,
  contextWindow: 4096,
};

class MockNative implements NativeStreamingModule {
  available = true;
  reasonUnavailable: string | undefined;
  throwOnAvailability = false;
  sessionDisposeThrows = false;
  private listeners: Array<(event: NativeStreamEvent) => void> = [];
  startStreaming = vi.fn(async () => {});
  cancelStreaming = vi.fn(async () => {});

  async getAvailability() {
    if (this.throwOnAvailability) throw new Error("probe failed");
    const availability: { available: boolean; provider: string; reasonUnavailable?: string } = {
      available: this.available,
      provider: "x",
    };
    if (this.reasonUnavailable) availability.reasonUnavailable = this.reasonUnavailable;
    return availability;
  }
  async generate() {
    return { text: "gen", finishReason: "stop" };
  }
  async createSession() {
    return { sessionId: "s1" };
  }
  async generateInSession() {
    return { text: "sgen" };
  }
  async resetSession() {}
  async disposeSession() {
    if (this.sessionDisposeThrows) throw new Error("session gone");
  }
  addListener(_event: "onExpoAIStream", listener: (event: NativeStreamEvent) => void) {
    this.listeners.push(listener);
    return {
      remove: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  }
  emit(event: NativeStreamEvent) {
    for (const listener of [...this.listeners]) listener(event);
  }
  get listenerCount() {
    return this.listeners.length;
  }
}

function collectHandlers() {
  const events: Array<[string, unknown]> = [];
  const handlers: AdapterStreamHandlers = {
    onStart: () => events.push(["start", undefined]),
    onDelta: (text) => events.push(["delta", text]),
    onDone: (result) => events.push(["done", result]),
    onError: (error) => events.push(["error", error]),
  };
  return { handlers, events };
}

const PROVIDER = "apple-foundation-models" as const;

describe("createNativeAdapter — capabilities", () => {
  it("zeroes capabilities when the device is unavailable", async () => {
    const native = new MockNative();
    native.available = false;
    native.reasonUnavailable = "model_initializing";
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });

    const caps = await adapter.getCapabilities();
    expect(caps.available).toBe(false);
    expect(caps.isOnDevice).toBe(false);
    expect(caps.supportsStreaming).toBe(false);
    expect(caps.supportsSummarization).toBe(false);
    expect(caps.reasonUnavailable).toBe("model_initializing");
  });

  it("returns the capability profile when available", async () => {
    const native = new MockNative();
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    const caps = await adapter.getCapabilities();
    expect(caps.available).toBe(true);
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.contextWindow).toBe(4096);
  });

  it("reports unavailable (does not throw) when the native probe rejects", async () => {
    const native = new MockNative();
    native.throwOnAvailability = true;
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    const availability = await adapter.getAvailability();
    expect(availability.available).toBe(false);
    expect(availability.reasonUnavailable).toBe("unknown");
  });
});

describe("createNativeAdapter — streaming bridge", () => {
  let native: MockNative;
  let adapter: ReturnType<typeof createNativeAdapter>;

  beforeEach(() => {
    native = new MockNative();
    adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
  });

  function startStream() {
    const { handlers, events } = collectHandlers();
    adapter.stream!({ prompt: "hi" }, handlers);
    const requestId = native.startStreaming.mock.calls.at(-1)![0] as string;
    return { events, requestId };
  }

  it("bridges start/token/done and uses accumulated text when done has no result", () => {
    const { events, requestId } = startStream();
    native.emit({ requestId, type: "start" });
    native.emit({ requestId, type: "token", text: "Hello " });
    native.emit({ requestId, type: "token", text: "" }); // suppressed
    native.emit({ requestId, type: "token", text: "world" });
    native.emit({ requestId, type: "done" }); // no result

    expect(events.filter((e) => e[0] === "delta").map((e) => e[1])).toEqual(["Hello ", "world"]);
    expect((events.find((e) => e[0] === "done")![1] as { text: string }).text).toBe("Hello world");
    expect(native.listenerCount).toBe(0);
  });

  it("ignores an unknown event type without hanging, then completes on done", () => {
    const { events, requestId } = startStream();
    native.emit({ requestId, type: "weird" as never });
    native.emit({ requestId, type: "done", result: { text: "ok" } });
    expect((events.find((e) => e[0] === "done")![1] as { text: string }).text).toBe("ok");
  });

  it("normalizes an error event to ExpoAIError and removes the subscription", () => {
    const { events, requestId } = startStream();
    native.emit({ requestId, type: "error", error: { code: "RATE_LIMITED", message: "x" } });
    expect((events.find((e) => e[0] === "error")![1] as { code: string }).code).toBe("RATE_LIMITED");
    expect(native.listenerCount).toBe(0);
  });

  it("stops emitting and removes the subscription after cancel", () => {
    const { handlers, events } = collectHandlers();
    const handle = adapter.stream!({ prompt: "hi" }, handlers);
    const requestId = native.startStreaming.mock.calls.at(-1)![0] as string;
    native.emit({ requestId, type: "start" });
    handle.cancel();
    native.emit({ requestId, type: "token", text: "late" });
    expect(events.filter((e) => e[0] === "delta")).toHaveLength(0);
    expect(native.cancelStreaming).toHaveBeenCalledWith(requestId);
    expect(native.listenerCount).toBe(0);
  });

  it("ignores events for a different requestId", () => {
    const { events, requestId } = startStream();
    native.emit({ requestId: "other", type: "token", text: "nope" });
    native.emit({ requestId, type: "token", text: "yes" });
    expect(events.filter((e) => e[0] === "delta").map((e) => e[1])).toEqual(["yes"]);
  });
});

describe("createNativeAdapter — sessions & unavailable", () => {
  it("normalizes native session lifecycle errors to ExpoAIError", async () => {
    const native = new MockNative();
    native.sessionDisposeThrows = true;
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    const session = await adapter.createSession!({});
    await expect(session.dispose()).rejects.toMatchObject({ code: "NATIVE_PROVIDER_ERROR" });
  });

  it("createUnavailableNativeAdapter reports unavailable and throws UNAVAILABLE", async () => {
    const adapter = createUnavailableNativeAdapter(PROVIDER, "unsupported_device");
    expect((await adapter.getAvailability()).available).toBe(false);
    expect((await adapter.getCapabilities()).supportsStreaming).toBe(false);
    await expect(adapter.generate({ prompt: "hi" })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
