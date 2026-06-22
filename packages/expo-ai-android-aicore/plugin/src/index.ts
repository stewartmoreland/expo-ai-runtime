/**
 * Expo config plugin for @stewmore/expo-ai-android-aicore.
 *
 * The native module already autolinks via expo-module.config.json; this plugin
 * sets the one build setting autolinking does not — the Android minSdkVersion —
 * so `expo prebuild` produces a project that builds without the app author
 * hand-editing `expo-build-properties`.
 *
 * ML Kit GenAI / AICore (Gemini Nano) requires API 26+, above the Expo default
 * (24); the module's own android/build.gradle also pins minSdk 26, and this
 * raises the host project's floor to match so the merged manifest is consistent.
 */
import { type ConfigPlugin, createRunOncePlugin, withGradleProperties } from 'expo/config-plugins';

import { type GradleProperty, applyMinSdkVersion } from './build-properties';

const PACKAGE_NAME = '@stewmore/expo-ai-android-aicore';
const PACKAGE_VERSION = '0.1.0';

/** ML Kit GenAI / AICore (Gemini Nano) floor. */
export const DEFAULT_MIN_SDK_VERSION = 26;

export type AndroidAiCorePluginProps = {
  /** Minimum Android SDK version to enforce. Defaults to 26 (the AICore floor). */
  minSdkVersion?: number;
};

const withAndroidAiCore: ConfigPlugin<AndroidAiCorePluginProps | void> = (config, props) => {
  const minimum = props?.minSdkVersion ?? DEFAULT_MIN_SDK_VERSION;
  return withGradleProperties(config, (cfg) => {
    applyMinSdkVersion(cfg.modResults as GradleProperty[], minimum);
    return cfg;
  });
};

export { applyMinSdkVersion } from './build-properties';

export default createRunOncePlugin(withAndroidAiCore, PACKAGE_NAME, PACKAGE_VERSION);
