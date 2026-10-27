/**
 * Expo config plugin for @stewmore/expo-ai-apple-foundation-models.
 *
 * The native module already autolinks via expo-module.config.json; this plugin
 * sets the one build setting autolinking does not — the iOS deployment target —
 * so `expo prebuild` produces a project whose pod installs cleanly without the
 * app author hand-editing `expo-build-properties`.
 *
 * FoundationModels usage is gated to iOS 26 at runtime (`if #available`) and the
 * pod weak-links the framework; the floor below only guards against a deployment
 * target lower than the pod itself supports. On-device generation needs no
 * entitlement; the Private Cloud Compute entitlement and Info.plist marker are
 * added only when `privateCloudCompute: true`.
 */
import {
  type ConfigPlugin,
  createRunOncePlugin,
  withEntitlementsPlist,
  withInfoPlist,
  withPodfileProperties,
} from 'expo/config-plugins';

import {
  applyIosDeploymentTarget,
  applyPCCInfoPlist,
  applyPrivateCloudCompute,
} from './build-properties';

const PACKAGE_NAME = '@stewmore/expo-ai-apple-foundation-models';
// CommonJS at runtime (plugin/package.json); declared here so the plugin needs no @types/node.
declare const require: (id: string) => { version: string };
export const PACKAGE_VERSION: string = require('../../package.json').version;

/** The pod's deployment-target floor (see ExpoAIApple.podspec). */
export const DEFAULT_IOS_DEPLOYMENT_TARGET = '15.1';

export type AppleFoundationModelsPluginProps = {
  /** Minimum iOS deployment target to enforce. Defaults to the pod floor (15.1). */
  iosDeploymentTarget?: string;
  /** Opt in to Apple Private Cloud Compute: adds its entitlement and Info.plist marker. */
  privateCloudCompute?: boolean;
};

const withAppleFoundationModels: ConfigPlugin<AppleFoundationModelsPluginProps | void> = (
  config,
  props,
) => {
  const minimum = props?.iosDeploymentTarget ?? DEFAULT_IOS_DEPLOYMENT_TARGET;
  config = withPodfileProperties(config, (cfg) => {
    cfg.modResults = applyIosDeploymentTarget(cfg.modResults, minimum);
    return cfg;
  });
  if (!props?.privateCloudCompute) return config;
  config = withEntitlementsPlist(config, (cfg) => {
    applyPrivateCloudCompute(cfg.modResults);
    return cfg;
  });
  return withInfoPlist(config, (cfg) => {
    applyPCCInfoPlist(cfg.modResults);
    return cfg;
  });
};

export {
  PCC_ENTITLEMENT,
  PCC_INFO_PLIST_KEY,
  applyIosDeploymentTarget,
  applyPCCInfoPlist,
  applyPrivateCloudCompute,
  atLeastVersion,
  compareVersions,
} from './build-properties';

export default createRunOncePlugin(withAppleFoundationModels, PACKAGE_NAME, PACKAGE_VERSION);
