import type { EffectDetails, ParsedShadow, ParsedBorderRadius, FilterValues } from './types';

function splitCSSTokens(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(') parenDepth++;
    else if (char === ')') parenDepth--;

    if (char === ',' && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function extractColorAndShadowText(shadowStr: string): { color: string; rest: string } {
  // Match rgb, rgba, hsl, hsla
  const colorRegex = /(rgba?|hsla?)\([^)]+\)/i;
  const match = shadowStr.match(colorRegex);
  if (match) {
    const color = match[0];
    const rest = shadowStr.replace(color, '').replace(/\s+/g, ' ').trim();
    return { color, rest };
  }

  const hexOrNamedRegex = /(#[0-9a-fA-F]{3,8}\b|transparent|currentColor)/i;
  const matchHex = shadowStr.match(hexOrNamedRegex);
  if (matchHex) {
    const color = matchHex[0];
    const rest = shadowStr.replace(color, '').replace(/\s+/g, ' ').trim();
    return { color, rest };
  }

  return { color: 'currentColor', rest: shadowStr };
}

export function parseBoxShadows(shadowString: string): ParsedShadow[] {
  if (!shadowString || shadowString === 'none') return [];
  
  const tokens = splitCSSTokens(shadowString);
  const shadows: ParsedShadow[] = [];

  for (const token of tokens) {
    const { color, rest } = extractColorAndShadowText(token);
    let restClean = rest;
    const inset = restClean.toLowerCase().includes('inset');
    if (inset) {
      restClean = restClean.replace(/inset/i, '').replace(/\s+/g, ' ').trim();
    }

    const parts = restClean.split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue; // Must at least have X and Y

    const offsetX = parts[0];
    const offsetY = parts[1];
    const blurRadius = parts[2] || '0px';
    const spreadRadius = parts[3] || '0px';

    shadows.push({
      type: 'box-shadow',
      inset,
      offsetX,
      offsetY,
      blurRadius,
      spreadRadius,
      color,
      raw: token
    });
  }

  return shadows;
}

export function parseDropShadows(filterString: string): ParsedShadow[] {
  if (!filterString || filterString === 'none') return [];
  
  const shadows: ParsedShadow[] = [];
  // Match drop-shadow( ... ) allowing nested parentheses
  const dropShadowRegex = /drop-shadow\(([^)]+(?:\([^)]+\)[^)]*)*)\)/gi;
  let match;
  
  while ((match = dropShadowRegex.exec(filterString)) !== null) {
    const content = match[1].trim();
    const { color, rest } = extractColorAndShadowText(content);
    const parts = rest.split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;

    const offsetX = parts[0];
    const offsetY = parts[1];
    const blurRadius = parts[2] || '0px';

    shadows.push({
      type: 'drop-shadow',
      inset: false,
      offsetX,
      offsetY,
      blurRadius,
      spreadRadius: '0px',
      color,
      raw: match[0]
    });
  }

  return shadows;
}

export function parseFilterFunctions(filterString: string): FilterValues {
  const result: FilterValues = {};
  if (!filterString || filterString === 'none') return result;

  const fnRegex = /(blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia)\(([^)]+)\)/gi;
  let match;
  while ((match = fnRegex.exec(filterString)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2].trim();
    
    let key = name;
    if (name === 'hue-rotate') key = 'hueRotate';
    
    result[key as keyof FilterValues] = value;
  }
  return result;
}

export function parseBorderRadius(el: HTMLElement): ParsedBorderRadius {
  const computed = window.getComputedStyle(el);
  const topLeft = computed.borderTopLeftRadius || '0px';
  const topRight = computed.borderTopRightRadius || '0px';
  const bottomRight = computed.borderBottomRightRadius || '0px';
  const bottomLeft = computed.borderBottomLeftRadius || '0px';
  const raw = computed.borderRadius || `${topLeft} ${topRight} ${bottomRight} ${bottomLeft}`;
  return {
    topLeft,
    topRight,
    bottomRight,
    bottomLeft,
    raw
  };
}

export function extractEffectDetails(el: HTMLElement): EffectDetails {
  const computed = window.getComputedStyle(el);
  
  const boxShadow = computed.boxShadow || 'none';
  const filter = computed.filter || 'none';
  const backdropFilter = computed.backdropFilter || 'none';
  const opacity = computed.opacity || '1';
  const mixBlendMode = computed.mixBlendMode || 'normal';
  const isolation = computed.isolation || 'auto';

  return {
    boxShadows: parseBoxShadows(boxShadow),
    dropShadows: parseDropShadows(filter),
    filter,
    backdropFilter,
    opacity,
    mixBlendMode,
    isolation,
    borderRadius: parseBorderRadius(el),
    filters: parseFilterFunctions(filter),
    backdropFilters: parseFilterFunctions(backdropFilter)
  };
}
