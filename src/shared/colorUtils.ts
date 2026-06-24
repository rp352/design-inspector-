import type { ColorInfo, ColorExtractionData } from './types';

/**
 * Parses any computed CSS color string (rgb, rgba, or transparent) into a structured ColorInfo object.
 */
export function parseColor(colorStr: string): ColorInfo | null {
  if (!colorStr) return null;
  
  const trimmed = colorStr.trim().toLowerCase();
  
  if (trimmed === 'transparent' || trimmed === 'rgba(0, 0, 0, 0)') {
    return {
      raw: colorStr,
      hex: '#00000000',
      rgb: 'rgba(0, 0, 0, 0)',
      isTransparent: true
    };
  }
  
  // Regex to match rgb/rgba formats
  // Supports comma-separated: rgb(r, g, b) / rgba(r, g, b, a)
  // And modern space-separated: rgb(r g b) / rgb(r g b / a)
  const rgbRegex = /rgba?\(\s*(\d+)(?:\s*,\s*|\s+)(\d+)(?:\s*,\s*|\s+)(\d+)(?:\s*,\s*|\s*\/|)\s*([\d.]+)?\s*\)/i;
  const match = trimmed.match(rgbRegex);
  
  if (match) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const aVal = match[4] !== undefined ? parseFloat(match[4]) : 1;
    
    const isTransparent = aVal === 0;
    
    // Construct standard rgb/rgba string
    const rgb = aVal === 1 
      ? `rgb(${r}, ${g}, ${b})` 
      : `rgba(${r}, ${g}, ${b}, ${aVal})`;
      
    // Construct hex string (6-digit if opaque, 8-digit if semi-transparent)
    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');
    const aHex = aVal === 1 
      ? '' 
      : Math.round(aVal * 255).toString(16).padStart(2, '0');
    const hex = `#${rHex}${gHex}${bHex}${aHex}`;
    
    return {
      raw: colorStr,
      hex,
      rgb,
      isTransparent
    };
  }
  
  // Fallback for hex values (in case computed style contains them, e.g. for custom tests)
  if (trimmed.startsWith('#')) {
    let hex = trimmed;
    if (hex.length === 4) {
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    
    let r = 0, g = 0, b = 0, aVal = 1;
    if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    } else if (hex.length === 9) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
      aVal = parseFloat((parseInt(hex.slice(7, 9), 16) / 255).toFixed(3));
    }
    
    const rgb = aVal === 1 
      ? `rgb(${r}, ${g}, ${b})` 
      : `rgba(${r}, ${g}, ${b}, ${aVal})`;
      
    return {
      raw: colorStr,
      hex,
      rgb,
      isTransparent: aVal === 0
    };
  }
  
  return null;
}

/**
 * Scans shadow property strings (box-shadow or text-shadow) and extracts all unique color instances.
 */
export function extractShadowColors(shadowStr: string): ColorInfo[] {
  if (!shadowStr || shadowStr === 'none') return [];
  
  // Regular expression to match rgb() and rgba() strings
  const colorRegex = /rgba?\(\s*\d+(?:\s*,\s*|\s+)\d+(?:\s*,\s*|\s+)\d+(?:\s*,\s*|\s*\/|)\s*[\d.]*?\s*\)/gi;
  const matches = shadowStr.match(colorRegex) || [];
  
  const colors: ColorInfo[] = [];
  for (const match of matches) {
    const parsed = parseColor(match);
    if (parsed) {
      // Prevent duplicate colors
      if (!colors.some(c => c.hex === parsed.hex)) {
        colors.push(parsed);
      }
    }
  }
  return colors;
}

/**
 * Extracts and maps color definitions (text, background, borders, and shadows) from a DOM node.
 */
export function extractElementColors(el: HTMLElement): ColorExtractionData {
  const computed = window.getComputedStyle(el);
  
  // Text Color
  const text = parseColor(computed.color);
  
  // Background Color
  const background = parseColor(computed.backgroundColor);
  
  // Border Color
  // Since computed.borderColor is shorthand and often returns empty string,
  // we check if border is actually rendered, then use borderTopColor as representative
  const hasBorder = computed.borderStyle !== 'none' && computed.borderWidth !== '0px';
  const borderRaw = hasBorder ? computed.borderTopColor : 'transparent';
  const border = parseColor(borderRaw);
  
  // Shadow Colors (box-shadow and text-shadow)
  const boxShadowColors = extractShadowColors(computed.boxShadow);
  const textShadowColors = extractShadowColors(computed.textShadow);
  
  // Combine all shadows, filtering duplicates
  const shadows = [...boxShadowColors];
  for (const tsColor of textShadowColors) {
    if (!shadows.some(s => s.hex === tsColor.hex)) {
      shadows.push(tsColor);
    }
  }
  
  return {
    text,
    background,
    border,
    shadows
  };
}
