/**
 * Shared runtime setup for the example apps.
 *
 * Importing this module registers the on-device providers (side-effect imports)
 * and configures the cloud fallback to point at the local reference server.
 */
import { configureCloud } from '@stewmore/expo-ai-cloud';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import '@stewmore/expo-ai-apple-foundation-models';
import '@stewmore/expo-ai-android-aicore';

/**
 * The reference server. On the Android emulator `localhost` is the emulator
 * itself, so use the host loopback alias. On a physical device, replace this
 * with your machine's LAN IP.
 */
export const CLOUD_ENDPOINT =
  Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787';

let configuredEndpoint: string | null = null;

/** (Re)configure the cloud adapter. Safe to call multiple times. */
export function configureRuntime(endpoint: string = CLOUD_ENDPOINT): void {
  if (configuredEndpoint === endpoint) return;
  configuredEndpoint = endpoint;
  configureCloud({ endpoint, fetch: expoFetch as unknown as typeof fetch });
}

configureRuntime();
