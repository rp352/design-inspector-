import type { BorderRadiusIntelligence, CornerClassification } from './types';

function parseRadiusPx(val: string): number {
  if (!val) return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

export function inferCornerToken(
  val: string,
  widthPx: number,
  heightPx: number
): CornerClassification['topLeft'] {
  const trimmed = val.trim().toLowerCase();
  if (!trimmed || trimmed === '0px' || trimmed === '0') {
    return 'Sharp';
  }

  if (trimmed.endsWith('%')) {
    const pct = parseFloat(trimmed) || 0;
    if (pct >= 45) return 'Circle';
    if (pct >= 25) return 'Pill';
    if (pct > 12) return 'Large';
    if (pct > 6) return 'Medium';
    return 'Small';
  }

  const px = parseRadiusPx(trimmed);
  const minDim = Math.min(widthPx, heightPx);

  if (minDim > 0 && px >= minDim / 2 - 2) {
    const ratio = Math.max(widthPx, heightPx) / Math.min(widthPx, heightPx);
    if (ratio <= 1.15) {
      return 'Circle';
    }
    return 'Pill';
  }

  if (px <= 4) return 'Small';
  if (px <= 8) return 'Medium';
  if (px <= 16) return 'Large';
  
  if (minDim > 0 && px >= minDim / 2.5) {
    return 'Pill';
  }
  return 'Large';
}

export function extractBorderRadiusIntelligence(el: HTMLElement): BorderRadiusIntelligence {
  const computed = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const topLeft = computed.borderTopLeftRadius || '0px';
  const topRight = computed.borderTopRightRadius || '0px';
  const bottomRight = computed.borderBottomRightRadius || '0px';
  const bottomLeft = computed.borderBottomLeftRadius || '0px';

  const tlToken = inferCornerToken(topLeft, width, height);
  const trToken = inferCornerToken(topRight, width, height);
  const brToken = inferCornerToken(bottomRight, width, height);
  const blToken = inferCornerToken(bottomLeft, width, height);

  const isUniform = topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft;

  let classification: BorderRadiusIntelligence['classification'] = 'Medium';
  if (tlToken === trToken && trToken === brToken && brToken === blToken) {
    classification = tlToken;
  } else {
    const allSharp = tlToken === 'Sharp' && trToken === 'Sharp' && brToken === 'Sharp' && blToken === 'Sharp';
    if (allSharp) {
      classification = 'Sharp';
    } else {
      classification = 'Mixed';
    }
  }

  const tlPx = parseRadiusPx(topLeft);
  const trPx = parseRadiusPx(topRight);
  const brPx = parseRadiusPx(bottomRight);
  const blPx = parseRadiusPx(bottomLeft);

  const isPercentCircle = 
    topLeft.endsWith('%') || topRight.endsWith('%') || 
    bottomRight.endsWith('%') || bottomLeft.endsWith('%');

  const isGridCompliant = isPercentCircle || (
    (tlPx % 2 === 0) &&
    (trPx % 2 === 0) &&
    (brPx % 2 === 0) &&
    (blPx % 2 === 0)
  );

  return {
    classification,
    corners: {
      topLeft: tlToken,
      topRight: trToken,
      bottomRight: brToken,
      bottomLeft: blToken
    },
    raw: {
      topLeft,
      topRight,
      bottomRight,
      bottomLeft
    },
    uniform: isUniform,
    gridCompliance: isGridCompliant
  };
}
