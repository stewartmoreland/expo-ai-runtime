import { describe, expect, it } from 'vitest';

import { type GradleProperty, applyMinSdkVersion } from '../build-properties.js';
import { DEFAULT_MIN_SDK_VERSION } from '../index.js';

const KEY = 'android.minSdkVersion';

function minSdk(items: GradleProperty[]): string | undefined {
  const entry = items.find((i) => i.type === 'property' && i.key === KEY);
  return entry && entry.type === 'property' ? entry.value : undefined;
}

describe('applyMinSdkVersion', () => {
  it('adds the key when gradle.properties has no minSdkVersion', () => {
    const items: GradleProperty[] = [];
    applyMinSdkVersion(items, DEFAULT_MIN_SDK_VERSION);
    expect(minSdk(items)).toBe('26');
  });

  it('raises a lower existing value', () => {
    const items: GradleProperty[] = [{ type: 'property', key: KEY, value: '24' }];
    applyMinSdkVersion(items, DEFAULT_MIN_SDK_VERSION);
    expect(minSdk(items)).toBe('26');
  });

  it('does not lower a higher existing value', () => {
    const items: GradleProperty[] = [{ type: 'property', key: KEY, value: '30' }];
    applyMinSdkVersion(items, DEFAULT_MIN_SDK_VERSION);
    expect(minSdk(items)).toBe('30');
  });

  it('replaces a non-numeric value with the floor', () => {
    const items: GradleProperty[] = [{ type: 'property', key: KEY, value: 'oops' }];
    applyMinSdkVersion(items, DEFAULT_MIN_SDK_VERSION);
    expect(minSdk(items)).toBe('26');
  });

  it('preserves other entries (comments, empties, unrelated keys)', () => {
    const items: GradleProperty[] = [
      { type: 'comment', value: 'Project-wide Gradle settings' },
      { type: 'empty' },
      { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2g' },
    ];
    applyMinSdkVersion(items, DEFAULT_MIN_SDK_VERSION);
    expect(items).toHaveLength(4);
    expect(minSdk(items)).toBe('26');
    expect(items.find((i) => i.type === 'property' && i.key === 'org.gradle.jvmargs')).toBeDefined();
  });

  it('honors a custom minimum', () => {
    const items: GradleProperty[] = [];
    applyMinSdkVersion(items, 31);
    expect(minSdk(items)).toBe('31');
  });
});
