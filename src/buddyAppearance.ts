export const SPROUT_ORIGINAL_ASSET = '/buddy/sprout-v005.glb';
export const SPROUT_DAYLIGHT_ASSET = '/buddy/sprout-v006.glb';
export const SPROUT_CURRENT_ASSET = '/buddy/sprout-v007.glb';
export const SPROUT_SOFT_ASSET = '/buddy/sprout-v008.glb';

/** Appearance belongs to the successfully loaded asset, including an older fallback. */
export function isSproutDaylightAsset(assetUrl: string) {
  return [SPROUT_DAYLIGHT_ASSET, SPROUT_CURRENT_ASSET].includes(assetUrl);
}

/** Explicit local review assets only; the original stays available for comparison. */
export function sproutReviewAsset(search: string) {
  const name = new URLSearchParams(search).get('asset');
  return name &&
    [
      'sprout-v003',
      'sprout-v004',
      'sprout-v005',
      'sprout-v006',
      'sprout-v007',
      'sprout-v008',
    ].includes(name)
    ? `/buddy/${name}.glb`
    : SPROUT_CURRENT_ASSET;
}
