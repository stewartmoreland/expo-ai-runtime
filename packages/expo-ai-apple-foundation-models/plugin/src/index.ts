/**
 * Expo config plugin for @stewmore/expo-ai-apple-foundation-models.
 *
 * The native module already autolinks via expo-module.config.json; this plugin
 * sets the one build setting autolinking does not — the iOS deployment target —
 * so `expo prebuild` produces a project whose pod installs cleanly without the
 * app author hand-editing `expo-build-properties`.
 *
 * FoundationModels usage is gated to iOS 26 at runtime (`if #available`), so no
 * entitlement is required and the pod weak-links the framework; the floor below
 * only guards against a deployment target lower than the pod itself supports.
 */
import { type ConfigPlugin, createRunOncePlugin, withPodfileProperties } from 'expo/config-plugins';

import { applyIosDeploymentTarget } from './build-properties';

const PACKAGE_NAME = '@stewmore/expo-ai-apple-foundation-models';
const PACKAGE_VERSION = '0.1.0';

/** The pod's deployment-target floor (see ExpoAIApple.podspec). */
export const DEFAULT_IOS_DEPLOYMENT_TARGET = '15.1';

export type AppleFoundationModelsPluginProps = {
  /** Minimum iOS deployment target to enforce. Defaults to the pod floor (15.1). */
  iosDeploymentTarget?: string;
};

const withAppleFoundationModels: ConfigPlugin<AppleFoundationModelsPluginProps | void> = (
  config,
  props,
) => {
  const minimum = props?.iosDeploymentTarget ?? DEFAULT_IOS_DEPLOYMENT_TARGET;
  return withPodfileProperties(config, (cfg) => {
    cfg.modResults = applyIosDeploymentTarget(cfg.modResults, minimum);
    return cfg;
  });
};

export { applyIosDeploymentTarget, atLeastVersion, compareVersions } from './build-properties';

export default createRunOncePlugin(withAppleFoundationModels, PACKAGE_NAME, PACKAGE_VERSION);
