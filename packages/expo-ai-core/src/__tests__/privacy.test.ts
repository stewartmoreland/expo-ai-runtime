import { describe, expect, it } from "vitest";

import {
  PRIVACY_COPY,
  privacyInfoForProvider,
  privacyModeForProvider,
  providerSendsPromptOffDevice,
} from "../index.js";

describe("privacy", () => {
  it("maps providers to privacy modes", () => {
    expect(privacyModeForProvider("apple-foundation-models")).toBe("on-device");
    expect(privacyModeForProvider("android-aicore-gemini-nano")).toBe("on-device");
    expect(privacyModeForProvider("litert-lm")).toBe("on-device");
    expect(privacyModeForProvider("apple-private-cloud-compute")).toBe("apple-private-cloud-compute");
    expect(privacyModeForProvider("cloud")).toBe("third-party-cloud");
    expect(privacyModeForProvider("none")).toBe("unknown");
  });

  it("derives on-device / off-device flags", () => {
    expect(privacyInfoForProvider("apple-foundation-models")).toMatchObject({
      isOnDevice: true,
      sendsPromptOffDevice: false,
    });
    expect(privacyInfoForProvider("cloud")).toMatchObject({
      isOnDevice: false,
      sendsPromptOffDevice: true,
    });
    expect(privacyInfoForProvider("apple-private-cloud-compute")).toMatchObject({
      isOnDevice: false,
      sendsPromptOffDevice: true,
    });
    expect(providerSendsPromptOffDevice("cloud")).toBe(true);
    expect(providerSendsPromptOffDevice("apple-foundation-models")).toBe(false);
  });

  it("provides human-facing UI copy for each mode", () => {
    expect(PRIVACY_COPY["on-device"]).toMatch(/on this device/i);
    expect(PRIVACY_COPY["apple-private-cloud-compute"]).toMatch(/private cloud compute/i);
    expect(PRIVACY_COPY["third-party-cloud"]).toMatch(/cloud/i);
  });
});
