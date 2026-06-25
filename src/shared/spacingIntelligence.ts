import type { LayoutExtractionData, SpacingIntelligence, SpacingItem } from './types';

function parsePx(val: string): number {
  if (!val || val === 'normal' || val === 'auto') return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

export function inferSpacingToken(px: number): string {
  if (px === 0) return 'Space 0';
  const units = px / 4;
  if (Number.isInteger(units)) {
    return `Space ${units}`;
  }
  if (Number.isInteger(units * 2)) {
    return `Space ${units}`;
  }
  return `Custom (${px}px)`;
}

export function extractSpacingIntelligence(layout: LayoutExtractionData): SpacingIntelligence {
  const items: SpacingItem[] = [];

  const bm = layout.boxModel;
  
  // Padding Items
  const pTop = parsePx(bm.padding.top);
  const pRight = parsePx(bm.padding.right);
  const pBottom = parsePx(bm.padding.bottom);
  const pLeft = parsePx(bm.padding.left);

  if (pTop > 0) items.push({ type: 'padding', direction: 'top', valuePx: pTop, tokenName: inferSpacingToken(pTop), isGridCompliant: pTop % 8 === 0 });
  if (pRight > 0) items.push({ type: 'padding', direction: 'right', valuePx: pRight, tokenName: inferSpacingToken(pRight), isGridCompliant: pRight % 8 === 0 });
  if (pBottom > 0) items.push({ type: 'padding', direction: 'bottom', valuePx: pBottom, tokenName: inferSpacingToken(pBottom), isGridCompliant: pBottom % 8 === 0 });
  if (pLeft > 0) items.push({ type: 'padding', direction: 'left', valuePx: pLeft, tokenName: inferSpacingToken(pLeft), isGridCompliant: pLeft % 8 === 0 });

  // Margin Items
  const mTop = parsePx(bm.margin.top);
  const mRight = parsePx(bm.margin.right);
  const mBottom = parsePx(bm.margin.bottom);
  const mLeft = parsePx(bm.margin.left);

  if (mTop > 0) items.push({ type: 'margin', direction: 'top', valuePx: mTop, tokenName: inferSpacingToken(mTop), isGridCompliant: mTop % 8 === 0 });
  if (mRight > 0) items.push({ type: 'margin', direction: 'right', valuePx: mRight, tokenName: inferSpacingToken(mRight), isGridCompliant: mRight % 8 === 0 });
  if (mBottom > 0) items.push({ type: 'margin', direction: 'bottom', valuePx: mBottom, tokenName: inferSpacingToken(mBottom), isGridCompliant: mBottom % 8 === 0 });
  if (mLeft > 0) items.push({ type: 'margin', direction: 'left', valuePx: mLeft, tokenName: inferSpacingToken(mLeft), isGridCompliant: mLeft % 8 === 0 });

  // Gap Items
  const gapStr = layout.flexGrid.gap;
  if (gapStr && gapStr !== 'normal') {
    const parts = gapStr.trim().split(/\s+/);
    if (parts.length === 1) {
      const gVal = parsePx(parts[0]);
      if (gVal > 0) {
        items.push({ type: 'gap', direction: 'all', valuePx: gVal, tokenName: inferSpacingToken(gVal), isGridCompliant: gVal % 8 === 0 });
      }
    } else if (parts.length >= 2) {
      const rGap = parsePx(parts[0]);
      const cGap = parsePx(parts[1]);
      if (rGap > 0) {
        items.push({ type: 'gap', direction: 'row', valuePx: rGap, tokenName: inferSpacingToken(rGap), isGridCompliant: rGap % 8 === 0 });
      }
      if (cGap > 0) {
        items.push({ type: 'gap', direction: 'column', valuePx: cGap, tokenName: inferSpacingToken(cGap), isGridCompliant: cGap % 8 === 0 });
      }
    }
  }

  // Calculate 8pt Grid Compliance
  let nonZeroCount = 0;
  let compliantCount = 0;

  items.forEach((item) => {
    nonZeroCount++;
    if (item.valuePx % 8 === 0) {
      compliantCount += 1.0;
    } else if (item.valuePx % 4 === 0) {
      compliantCount += 0.5; // Partial points for 4pt grid compliance
    }
  });

  const gridComplianceScore = nonZeroCount === 0 
    ? 100 
    : Math.round((compliantCount / nonZeroCount) * 100);

  let gridFeedback = '';
  if (gridComplianceScore === 100) {
    gridFeedback = 'Excellent! All spacing values align perfectly with the standard 8pt grid.';
  } else if (gridComplianceScore >= 80) {
    gridFeedback = 'Great consistency. Most layout elements follow the 8pt grid pattern.';
  } else if (gridComplianceScore >= 50) {
    gridFeedback = 'Moderate alignment. Spacing values use a mix of 4pt and 8pt rules; suggest auditing custom offsets.';
  } else {
    gridFeedback = 'Custom spacing detected. Layout spacing is arbitrary and does not follow a strict 8pt grid system.';
  }

  return {
    spacingItems: items,
    gridComplianceScore,
    gridFeedback
  };
}
