/**
 * @stewmore/expo-ai-cloud
 *
 * Cloud fallback for the Expo AI Runtime. Call {@link configureCloud} once with
 * your backend config to register the cloud adapter; the core router will use it
 * when an app opts into fallback (`fallback: "cloud"`).
 */

import { registerAdapter } from "@stewmore/expo-ai-core";

import { CloudAdapter, type CloudProviderConfig } from "./cloud-provider.js";

export {
  CloudAdapter,
  type CloudProviderConfig,
  type CloudProviderKind,
} from "./cloud-provider.js";

let current: CloudAdapter | undefined;

/** Create a cloud adapter without registering it. */
export function createCloudAdapter(config: CloudProviderConfig): CloudAdapter {
  return new CloudAdapter(config);
}

/** Create the cloud adapter and register it with the core runtime. */
export function configureCloud(config: CloudProviderConfig): CloudAdapter {
  current = new CloudAdapter(config);
  registerAdapter(current);
  return current;
}

/** The most recently configured cloud adapter, if any. */
export function getCloudAdapter(): CloudAdapter | undefined {
  return current;
}
