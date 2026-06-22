import { describe, expect, it } from 'vitest';

import {
  applyIosDeploymentTarget,
  atLeastVersion,
  compareVersions,
} from '../build-properties.js';
import { DEFAULT_IOS_DEPLOYMENT_TARGET } from '../index.js';

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
