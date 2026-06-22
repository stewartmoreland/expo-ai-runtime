/**
 * Pure helpers for the config plugin — no Expo imports, so they unit-test in
 * plain Node. The plugin entry ({@link ./index}) wires these into Expo mods.
 */

/** A parsed `gradle.properties` entry, matching withGradleProperties' modResults. */
export type GradleProperty =
  | { type: 'property'; key: string; value: string }
  | { type: 'comment'; value: string }
  | { type: 'empty' };

const MIN_SDK_KEY = 'android.minSdkVersion';

/**
 * Ensure `gradle.properties` declares `android.minSdkVersion` >= `minimum`
 * (the Expo Android template reads this key, defaulting to 24). Mutates and
 * returns the property list. An entry already at or above `minimum`, or a
 * non-numeric value, is raised to `minimum`; a higher value is left untouched.
 */
export function applyMinSdkVersion(items: GradleProperty[], minimum: number): GradleProperty[] {
  const existing = items.find(
    (item): item is { type: 'property'; key: string; value: string } =>
      item.type === 'property' && item.key === MIN_SDK_KEY,
  );
  if (existing) {
    const current = parseInt(existing.value, 10);
    if (!Number.isFinite(current) || current < minimum) existing.value = String(minimum);
  } else {
    items.push({ type: 'property', key: MIN_SDK_KEY, value: String(minimum) });
  }
  return items;
}
