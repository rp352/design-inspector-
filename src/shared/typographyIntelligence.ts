import type { TypographyIntelligence } from './types';

function parsePx(val: string): number {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

function parseRgba(colorStr: string): { r: number; g: number; b: number; a: number } | null {
  if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') {
    return null;
  }
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1
    };
  }
  return null;
}

function getEffectiveBgColor(el: HTMLElement): string {
  let cur: HTMLElement | null = el;
  while (cur) {
    const computed = window.getComputedStyle(cur);
    const bg = computed.backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
      const parsed = parseRgba(bg);
      if (parsed && parsed.a > 0.05) {
        return bg;
      }
    }
    cur = cur.parentElement;
  }
  return 'rgb(255, 255, 255)'; // Fallback to white surface
}

function getLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(color1: string, color2: string): number {
  const c1 = parseRgba(color1);
  const c2 = parseRgba(color2);
  if (!c1 || !c2) return 1;
  const l1 = getLuminance(c1.r, c1.g, c1.b);
  const l2 = getLuminance(c2.r, c2.g, c2.b);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

export function inferClassification(
  fontSize: string,
  fontWeight: string,
  _lineHeight: string,
  letterSpacing: string,
  fontFamily: string,
  tagName: string,
  textTransform: string
): TypographyIntelligence['classification'] {
  const fs = parseFloat(fontSize) || 16;
  const tag = tagName.toLowerCase();
  const fontFam = fontFamily.toLowerCase();
  const tt = textTransform.toLowerCase();
  
  if (tag === 'code' || tag === 'pre' || fontFam.includes('mono') || fontFam.includes('consolas') || fontFam.includes('courier')) {
    return 'Code';
  }

  if (tag === 'button' || (tag === 'a' && (fontWeight === 'bold' || fontWeight === '500' || fontWeight === '600') && fs <= 15)) {
    return 'Button';
  }

  if (tt === 'uppercase' && fs <= 12 && letterSpacing !== 'normal' && letterSpacing !== '0px') {
    return 'Overline';
  }

  if (fs <= 11) return 'Caption';
  
  if (fs <= 13) {
    return (fontWeight === 'bold' || parseInt(fontWeight) >= 500) ? 'Label' : 'Body Small';
  }

  if (fs <= 15) {
    return (fontWeight === 'bold' || parseInt(fontWeight) >= 600) ? 'Label' : 'Body';
  }

  if (fs <= 18) {
    return (fontWeight === 'bold' || parseInt(fontWeight) >= 600) ? 'Heading Medium' : 'Body Large';
  }

  if (fs <= 24) return 'Heading Large';
  if (fs <= 36) return 'Heading XL';
  if (fs <= 48) return 'Hero';
  
  return 'Display';
}

export function calculateReadingComfort(
  fontSize: string,
  lineHeight: string,
  letterSpacing: string,
  classification: string
): TypographyIntelligence['readingComfort'] {
  const fs = parseFloat(fontSize) || 16;
  let lh = parseFloat(lineHeight);
  if (lineHeight === 'normal' || isNaN(lh)) {
    lh = ['Display', 'Hero', 'Heading XL', 'Heading Large', 'Heading Medium'].includes(classification)
      ? fs * 1.2
      : fs * 1.4;
  } else if (lineHeight.endsWith('%')) {
    lh = (parseFloat(lineHeight) / 100) * fs;
  } else if (!lineHeight.endsWith('px')) {
    lh = parseFloat(lineHeight) * fs;
  }

  const ratio = lh / fs;
  const ls = parsePx(letterSpacing);

  let score = 100;
  let feedback = '';

  const isHeading = ['Display', 'Hero', 'Heading XL', 'Heading Large', 'Heading Medium'].includes(classification);

  if (isHeading) {
    if (ratio < 1.1) {
      score -= 30;
      feedback += 'Line height is too tight for a heading, risking character overlap.';
    } else if (ratio > 1.5) {
      score -= 20;
      feedback += 'Line height is loose for heading text, reducing hierarchy block cohesion.';
    } else {
      feedback += 'Optimal line height for heading readability.';
    }
  } else {
    if (ratio < 1.35) {
      score -= 45;
      feedback += 'Line height is tight for body legibility; recommend increasing to 1.5.';
    } else if (ratio > 1.8) {
      score -= 15;
      feedback += 'Line height is loose; paragraph continuity may feel disconnected.';
    } else {
      feedback += 'Optimal line-height for body reading comfort.';
    }
  }

  if (ls < -0.3) {
    score -= 15;
    feedback += ' Character spacing is tightly negative, impacting letter recognition.';
  } else if (ls > 2.5) {
    score -= 10;
    feedback += ' Letter spacing is loose, lowering reading speed.';
  }

  let level: TypographyIntelligence['readingComfort']['level'] = 'Excellent';
  if (score < 50) level = 'Poor';
  else if (score < 75) level = 'Moderate';
  else if (score < 90) level = 'Good';

  return {
    score: Math.max(0, score),
    level,
    feedback: feedback.trim()
  };
}

export function calculateAccessibility(
  fontSize: string,
  textColor: string,
  bgColor: string
): TypographyIntelligence['accessibility'] {
  const fs = parseFloat(fontSize) || 16;
  const sizeCompliant = fs >= 12;

  const cText = parseRgba(textColor);
  const cBg = parseRgba(bgColor);
  if (!cText || !cBg) {
    return {
      sizeCompliant,
      contrastRatio: '—',
      contrastLevel: 'N/A',
      feedback: sizeCompliant ? 'Optimal font size. Contrast check skipped due to non-solid surface background.' : 'Contrast check skipped. Font size is below 12px legibility standards.'
    };
  }

  const ratio = getContrastRatio(textColor, bgColor);
  const ratioStr = `${ratio.toFixed(2)}:1`;
  const isLargeText = fs >= 18;

  let level: TypographyIntelligence['accessibility']['contrastLevel'] = 'Failed';
  
  if (isLargeText) {
    if (ratio >= 4.5) level = 'AAA Passed';
    else if (ratio >= 3.0) level = 'AA Passed';
  } else {
    if (ratio >= 7.0) level = 'AAA Passed';
    else if (ratio >= 4.5) level = 'AA Passed';
  }

  let feedback = '';
  if (level === 'AAA Passed') {
    feedback = `Excellent contrast ratio (${ratioStr}). Meets WCAG AAA high contrast criteria.`;
  } else if (level === 'AA Passed') {
    feedback = `Good contrast ratio (${ratioStr}). Meets WCAG AA minimum guidelines.`;
  } else {
    feedback = `Poor contrast ratio (${ratioStr}). Fails WCAG AA minimum guidelines; enhance color differences.`;
  }

  if (!sizeCompliant) {
    feedback += ' Note: Sizing is below the recommended 12px accessibility standard.';
  }

  return {
    sizeCompliant,
    contrastRatio: ratioStr,
    contrastLevel: level,
    feedback
  };
}

export function determineHierarchy(_fontSize: string, fontWeight: string, classification: string): number {
  const fw = parseInt(fontWeight) || 400;

  let score = 1;

  if (classification === 'Display') score = 10;
  else if (classification === 'Hero') score = 9;
  else if (classification === 'Heading XL') score = 8;
  else if (classification === 'Heading Large') score = 7;
  else if (classification === 'Heading Medium') score = 6;
  else if (classification === 'Body Large') score = 5;
  else if (classification === 'Body') score = 4;
  else if (classification === 'Body Small' || classification === 'Label') score = 3;
  else if (classification === 'Caption' || classification === 'Button' || classification === 'Overline') score = 2;
  else if (classification === 'Code') score = 3;

  if (fw >= 600 && score < 10) score += 0.5;

  return Math.min(10, Math.max(1, score));
}

export function extractTypographyIntelligence(el: HTMLElement): TypographyIntelligence {
  const computed = window.getComputedStyle(el);
  const fontSize = computed.fontSize || '16px';
  const fontWeight = computed.fontWeight || '400';
  const lineHeight = computed.lineHeight || 'normal';
  const letterSpacing = computed.letterSpacing || 'normal';
  const fontFamily = computed.fontFamily || 'sans-serif';
  const textTransform = computed.textTransform || 'none';
  const tagName = el.tagName;

  const textColor = computed.color || 'rgb(0,0,0)';
  const bgColor = getEffectiveBgColor(el);

  const classification = inferClassification(
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    fontFamily,
    tagName,
    textTransform
  );

  return {
    classification,
    readingComfort: calculateReadingComfort(fontSize, lineHeight, letterSpacing, classification),
    accessibility: calculateAccessibility(fontSize, textColor, bgColor),
    hierarchyLevel: determineHierarchy(fontSize, fontWeight, classification)
  };
}
