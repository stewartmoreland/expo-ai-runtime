/**
 * Pure helpers for the config plugin — no Expo imports, so they unit-test in
 * plain Node. The plugin entry ({@link ./index}) wires these into Expo mods.
 */

/** Compare dotted numeric versions ("15.1" vs "16.4"): -1 | 0 | 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((part) => parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

/** Whichever of `current`/`minimum` is higher; `minimum` when `current` is unset. */
export function atLeastVersion(current: string | undefined, minimum: string): string {
  if (!current) return minimum;
  return compareVersions(current, minimum) >= 0 ? current : minimum;
}

/**
 * Ensure `ios.deploymentTarget` in the Podfile properties is at least `minimum`.
 * Mutates and returns the properties map (the shape `withPodfileProperties`
 * hands the mod). A target already at or above `minimum` is left untouched.
 */
export function applyIosDeploymentTarget(
  properties: Record<string, string>,
  minimum: string,
): Record<string, string> {
  properties['ios.deploymentTarget'] = atLeastVersion(properties['ios.deploymentTarget'], minimum);
  return properties;
}
