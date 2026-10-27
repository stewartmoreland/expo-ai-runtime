import { describe, expect, it } from 'vitest';

import pkg from '../../../package.json';
import {
  PCC_ENTITLEMENT,
  PCC_INFO_PLIST_KEY,
  applyIosDeploymentTarget,
  applyPCCInfoPlist,
  applyPrivateCloudCompute,
  atLeastVersion,
  compareVersions,
} from '../build-properties.js';
import withAppleFoundationModels, {
  DEFAULT_IOS_DEPLOYMENT_TARGET,
  PACKAGE_VERSION,
} from '../index.js';

describe('PACKAGE_VERSION', () => {
  it('matches package.json', () => {
    expect(PACKAGE_VERSION).toBe(pkg.version);
  });
});

describe('Private Cloud Compute', () => {
  it('sets the entitlement and keeps other keys', () => {
    const entitlements: Record<string, unknown> = { 'aps-environment': 'production' };
    applyPrivateCloudCompute(entitlements);
    applyPrivateCloudCompute(entitlements);
    expect(entitlements).toEqual({ 'aps-environment': 'production', [PCC_ENTITLEMENT]: true });
  });

  it('sets the Info.plist marker', () => {
    const plist: Record<string, unknown> = {};
    applyPCCInfoPlist(applyPCCInfoPlist(plist));
    expect(plist).toEqual({ [PCC_INFO_PLIST_KEY]: true });
  });

  it('registers the entitlement and Info.plist mods only on opt-in', () => {
    const base = () => ({ name: 'app', slug: 'app' });
    const off = withAppleFoundationModels(base(), { privateCloudCompute: false });
    expect(off.mods?.ios?.entitlements).toBeUndefined();
    expect(off.mods?.ios?.infoPlist).toBeUndefined();
    const on = withAppleFoundationModels(base(), { privateCloudCompute: true });
    expect(on.mods?.ios?.entitlements).toBeTypeOf('function');
    expect(on.mods?.ios?.infoPlist).toBeTypeOf('function');
  });
});

describe('compareVersions', () => {
  it('orders by major then minor', () => {
    expect(compareVersions('16.4', '15.1')).toBe(1);
    expect(compareVersions('15.1', '16.4')).toBe(-1);
    expect(compareVersions('15.1', '15.1')).toBe(0);
    expect(compareVersions('15.10', '15.2')).toBe(1);
  });

  it('treats missing/non-numeric parts as zero', () => {
    expect(compareVersions('16', '16.0')).toBe(0);
    expect(compareVersions('16.0.0', '16')).toBe(0);
  });
});

describe('atLeastVersion', () => {
  it('returns the minimum when current is unset', () => {
    expect(atLeastVersion(undefined, '15.1')).toBe('15.1');
  });

  it('keeps a higher current target', () => {
    expect(atLeastVersion('16.4', '15.1')).toBe('16.4');
  });

  it('raises a lower current target to the minimum', () => {
    expect(atLeastVersion('14.0', '15.1')).toBe('15.1');
  });
});

describe('applyIosDeploymentTarget', () => {
  it('sets the floor when no deployment target is present', () => {
    const props: Record<string, string> = {};
    applyIosDeploymentTarget(props, DEFAULT_IOS_DEPLOYMENT_TARGET);
    expect(props['ios.deploymentTarget']).toBe('15.1');
  });

  it('does not lower an app that already targets a newer iOS', () => {
    const props = { 'ios.deploymentTarget': '17.0' };
    applyIosDeploymentTarget(props, DEFAULT_IOS_DEPLOYMENT_TARGET);
    expect(props['ios.deploymentTarget']).toBe('17.0');
  });

  it('raises an app below the pod floor', () => {
    const props = { 'ios.deploymentTarget': '13.0' };
    applyIosDeploymentTarget(props, DEFAULT_IOS_DEPLOYMENT_TARGET);
    expect(props['ios.deploymentTarget']).toBe('15.1');
  });

  it('honors a custom minimum', () => {
    const props: Record<string, string> = {};
    applyIosDeploymentTarget(props, '26.0');
    expect(props['ios.deploymentTarget']).toBe('26.0');
  });
});
