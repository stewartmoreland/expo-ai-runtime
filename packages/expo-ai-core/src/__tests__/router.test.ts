import { beforeEach, describe, expect, it } from "vitest";

import { ExpoAI, clearAdapters, registerAdapter } from "../index.js";
import { createMockAdapter } from "../testing.js";

beforeEach(() => clearAdapters());

describe("provider router — selection & priority", () => {
  it("uses the highest-priority available provider", async () => {
    registerAdapter(createMockAdapter({ provider: "apple-foundation-models", respondWith: "apple" }));
    registerAdapter(createMockAdapter({ provider: "android-aicore-gemini-nano", respondWith: "android" }));

    const result = await ExpoAI.generate({ prompt: "hi" });

    expect(result.provider).toBe("apple-foundation-models");
    expect(result.text).toBe("apple");
    expect(result.usedFallback).toBe(false);
    expect(result.privacy.privacyMode).toBe("on-device");
    expect(result.privacy.sendsPromptOffDevice).toBe(false);
  });

  it("honors an explicitly requested provider", async () => {
    registerAdapter(createMockAdapter({ provider: "apple-foundation-models", respondWith: "apple" }));
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: "cloud" }));

    const result = await ExpoAI.generate({ prompt: "hi", provider: "cloud" });
    expect(result.provider).toBe("cloud");
    expect(result.text).toBe("cloud");
  });

  it("rejects an empty prompt with INVALID_PROMPT", async () => {
    registerAdapter(createMockAdapter({ provider: "apple-foundation-models" }));
    await expect(ExpoAI.generate({ prompt: "   " })).rejects.toMatchObject({ code: "INVALID_PROMPT" });
  });

  it("throws UNAVAILABLE(none) when no providers are registered", async () => {
    await expect(ExpoAI.generate({ prompt: "hi" })).rejects.toMatchObject({
      code: "UNAVAILABLE",
      provider: "none",
    });
  });
});

describe("provider router — fallback", () => {
  it("falls back to cloud when the system provider is unavailable and fallback is cloud", async () => {
    registerAdapter(
      createMockAdapter({
        provider: "apple-foundation-models",
        available: false,
        reasonUnavailable: "apple_intelligence_disabled",
      }),
    );
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: "cloud!" }));

    const result = await ExpoAI.generate({ prompt: "hi", fallback: "cloud" });

    expect(result.provider).toBe("cloud");
    expect(result.usedFallback).toBe(true);
    expect(result.privacy.privacyMode).toBe("third-party-cloud");
    expect(result.privacy.sendsPromptOffDevice).toBe(true);
  });

  it("does not use cloud when fallback is none", async () => {
    registerAdapter(createMockAdapter({ provider: "apple-foundation-models", available: false }));
    registerAdapter(createMockAdapter({ provider: "cloud" }));

    await expect(ExpoAI.generate({ prompt: "hi", fallback: "none" })).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("retries the next candidate on a fallback-recommended error", async () => {
    registerAdapter(
      createMockAdapter({ provider: "apple-foundation-models", throwError: { code: "MODEL_NOT_READY" } }),
    );
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: "rescued" }));

    const result = await ExpoAI.generate({ prompt: "hi", fallback: "cloud" });

    expect(result.provider).toBe("cloud");
    expect(result.text).toBe("rescued");
    expect(result.usedFallback).toBe(true);
  });

  it("does NOT fall back on a non-fallback error (safety)", async () => {
    registerAdapter(
      createMockAdapter({ provider: "apple-foundation-models", throwError: { code: "SAFETY_BLOCKED" } }),
    );
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: "should-not-be-used" }));

    await expect(ExpoAI.generate({ prompt: "hi", fallback: "cloud" })).rejects.toMatchObject({
      code: "SAFETY_BLOCKED",
    });
  });
});

describe("provider router — privacy / sensitivity gating", () => {
  it("blocks a sensitive prompt from third-party cloud even when fallback is 'any'", async () => {
    registerAdapter(createMockAdapter({ provider: "apple-foundation-models", available: false }));
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: "leak" }));

    await expect(
      ExpoAI.generate({ prompt: "secret", sensitive: true, fallback: "any" }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("allows a sensitive prompt to cloud only when fallback is explicitly 'cloud'", async () => {
    registerAdapter(createMockAdapter({ provider: "apple-foundation-models", available: false }));
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: "ok" }));

    const result = await ExpoAI.generate({ prompt: "secret", sensitive: true, fallback: "cloud" });
    expect(result.provider).toBe("cloud");
  });

  it("allows a non-sensitive prompt to cloud with fallback 'any'", async () => {
    registerAdapter(createMockAdapter({ provider: "apple-foundation-models", available: false }));
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: "ok" }));

    const result = await ExpoAI.generate({ prompt: "weather?", fallback: "any" });
    expect(result.provider).toBe("cloud");
  });
});

describe("provider router — usedFallback accuracy & task routing", () => {
  it("reports usedFallback when the explicitly-requested provider is not registered", async () => {
    registerAdapter(createMockAdapter({ provider: "android-aicore-gemini-nano", respondWith: "android" }));

    const result = await ExpoAI.generate({
      prompt: "hi",
      provider: "apple-foundation-models",
      fallback: "any",
    });
    expect(result.provider).toBe("android-aicore-gemini-nano");
    expect(result.usedFallback).toBe(true);
  });

  it("reports usedFallback=false when the requested provider serves the request", async () => {
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: "c" }));
    const result = await ExpoAI.generate({ prompt: "hi", provider: "cloud" });
    expect(result.usedFallback).toBe(false);
  });

  it("forwards the summarize length hint to a native summarize handler", async () => {
    let received: { text?: string; length?: string } = {};
    const adapter = {
      provider: "apple-foundation-models",
      async getAvailability() {
        return { available: true, provider: "apple-foundation-models" };
      },
      async getCapabilities() {
        return { available: true, provider: "apple-foundation-models" };
      },
      async generate() {
        return { text: "generated" };
      },
      async summarize(req: { text?: string; length?: string }) {
        received = req;
        return { text: "summary" };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    registerAdapter(adapter);

    await ExpoAI.summarize({ text: "a long note to compress", length: "short" });
    expect(received.text).toBe("a long note to compress");
    expect(received.length).toBe("short");
  });
});

describe("provider router — abort signal", () => {
  it("rejects generate when the signal is already aborted", async () => {
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: "x" }));
    const controller = new AbortController();
    controller.abort();
    await expect(
      ExpoAI.generate({ prompt: "hi", provider: "cloud", signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("rejects generate when aborted mid-flight", async () => {
    const adapter = {
      provider: "cloud",
      async getAvailability() {
        return { available: true, provider: "cloud" };
      },
      async getCapabilities() {
        return { available: true, provider: "cloud" };
      },
      async generate() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { text: "late" };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    registerAdapter(adapter);

    const controller = new AbortController();
    const promise = ExpoAI.generate({ prompt: "hi", provider: "cloud", signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toMatchObject({ code: "CANCELLED" });
  });
});
