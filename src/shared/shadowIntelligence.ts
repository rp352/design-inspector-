import type { EffectDetails, ShadowIntelligence } from './types';

function parsePx(val: string): number {
  if (!val || val === 'none') return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

export function extractShadowIntelligence(effects: EffectDetails): ShadowIntelligence {
  const boxLayers = effects.boxShadows || [];
  const dropLayers = effects.dropShadows || [];
  const allLayers = [...boxLayers, ...dropLayers];

  // Detect glass effect: backdrop-filter containing blur
  const bFilter = (effects.backdropFilter || '').toLowerCase();
  const filter = (effects.filter || '').toLowerCase();
  const hasGlassEffect = bFilter.includes('blur') || (filter.includes('blur') && parsePx(effects.opacity) < 1);

  // Filter out inset shadows since inset shadows don't project outwards for elevation
  const nonInset = allLayers.filter((s) => !s.inset);

  // Find max blur radius of outward projecting shadows
  let maxBlur = 0;
  nonInset.forEach((s) => {
    const b = parsePx(s.blurRadius);
    if (b > maxBlur) {
      maxBlur = b;
    }
  });

  // Calculate elevation level index (0 to 5)
  let elevationLevel = 0;
  if (maxBlur > 0) {
    if (maxBlur <= 3) {
      elevationLevel = 1; // Small
    } else if (maxBlur <= 8) {
      elevationLevel = 2; // Medium
    } else if (maxBlur <= 16) {
      elevationLevel = 3; // Large / Floating Card
    } else if (maxBlur <= 28) {
      elevationLevel = 4; // Elevated Modal
    } else {
      elevationLevel = 5; // Popover / Modal overlay
    }
  }

  // Determine semantic classification
  let classification: ShadowIntelligence['classification'] = 'None';
  if (hasGlassEffect) {
    classification = 'Glass Effect';
  } else if (elevationLevel === 0) {
    classification = 'None';
  } else if (elevationLevel === 1) {
    classification = 'Small';
  } else if (elevationLevel === 2) {
    classification = 'Medium';
  } else if (elevationLevel === 3) {
    classification = 'Floating Card';
  } else {
    classification = 'Elevated Modal';
  }

  return {
    classification,
    elevationLevel,
    hasGlassEffect,
    shadowsCount: allLayers.length,
    layers: allLayers
  };
}
