import type { ColorExtractionData, ColorIntelligence, ColorAnalysis, ColorContrastDetails } from './types';

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

function hexToRgb(hexStr: string): { r: number; g: number; b: number } {
  let hex = hexStr.trim().toLowerCase();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  return { r, g, b };
}

export function hexToHsl(hexStr: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hexStr);
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function inferColorToken(
  hex: string,
  usage: 'text' | 'background' | 'border' | 'shadow'
): { tokenName: string; description: string; confidence: number } {
  const cleanHex = hex.split(/[?#]/)[0]; // strip query tags if any
  if (cleanHex === '#00000000' || cleanHex === 'transparent' || cleanHex === '#ffffff00') {
    return { tokenName: 'Transparent', description: 'Transparent color', confidence: 100 };
  }

  const { h, s, l } = hexToHsl(hex);

  // Neutral scale check (Grays, Slates, Whites, Blacks)
  if (s < 12) {
    if (l >= 96) {
      return { 
        tokenName: usage === 'background' ? 'Surface' : 'Neutral Lightest', 
        description: 'Very light gray / pure white surface color', 
        confidence: 90 
      };
    }
    if (l >= 88) {
      return { 
        tokenName: usage === 'border' ? 'Border' : 'Neutral Border', 
        description: 'Soft gray suitable for borders or dividers', 
        confidence: 85 
      };
    }
    if (l >= 65) {
      return { 
        tokenName: usage === 'text' ? 'Text Muted' : 'Neutral Secondary', 
        description: 'Muted gray suitable for subheadings or secondary icons', 
        confidence: 85 
      };
    }
    if (l <= 16) {
      return { 
        tokenName: usage === 'text' ? 'Text Primary' : 'Neutral Darkest', 
        description: 'Dark slate gray / black for high readability', 
        confidence: 95 
      };
    }
    if (l <= 45) {
      return { 
        tokenName: usage === 'text' ? 'Text Secondary' : 'Neutral Medium', 
        description: 'Medium gray for supporting body text or labels', 
        confidence: 80 
      };
    }
    return { 
      tokenName: 'Neutral', 
      description: 'Balanced middle-gray shade', 
      confidence: 70 
    };
  }

  // Chromatic classification based on Hue angles
  let colorCategory = 'Primary';
  let desc = '';
  
  if (h <= 15 || h > 345) {
    colorCategory = 'Danger';
    desc = 'Vibrant red shade associated with errors, danger, or destructive actions';
  } else if (h > 15 && h <= 45) {
    colorCategory = 'Warning';
    desc = 'Warm orange or amber shade representing alerts, warnings, or caution indicators';
  } else if (h > 45 && h <= 65) {
    colorCategory = 'Warning';
    desc = 'Bright yellow shade indicating warning states or focal highlights';
  } else if (h > 65 && h <= 150) {
    colorCategory = 'Success';
    desc = 'Refreshing green shade indicating success, validation, or completed states';
  } else if (h > 150 && h <= 195) {
    colorCategory = 'Info';
    desc = 'Cyan or teal shade representing information, highlights, or secondary actions';
  } else if (h > 195 && h <= 250) {
    colorCategory = 'Primary';
    desc = 'Core brand blue or indigo shade used for primary interactive UI elements';
  } else if (h > 250 && h <= 325) {
    colorCategory = 'Accent';
    desc = 'Purple or violet accent color for creative highlights and brand flair';
  } else {
    colorCategory = 'Accent';
    desc = 'Pink or rose accent color for focal highlights and interactive elements';
  }

  // Refine tokenName based on usage context
  let finalToken = colorCategory;
  if (usage === 'background') {
    if (l >= 90) {
      finalToken = `${colorCategory} Light / Background`;
      desc = `Subtle tinted backdrop: ${desc.toLowerCase()}`;
    } else if (l <= 20) {
      finalToken = `${colorCategory} Dark / Background`;
      desc = `Deep dark backdrop: ${desc.toLowerCase()}`;
    } else {
      finalToken = `${colorCategory} Solid`;
      desc = `Solid visual block: ${desc.toLowerCase()}`;
    }
  } else if (usage === 'text') {
    if (l <= 45) {
      finalToken = `${colorCategory} Text`;
      desc = `High contrast text color: ${desc.toLowerCase()}`;
    } else {
      finalToken = `${colorCategory} Text Light`;
      desc = `Light text color: ${desc.toLowerCase()}`;
    }
  } else if (usage === 'border') {
    finalToken = `${colorCategory} Border`;
    desc = `Border accent: ${desc.toLowerCase()}`;
  } else if (usage === 'shadow') {
    finalToken = `${colorCategory} Shadow`;
    desc = `Colored shadow glow: ${desc.toLowerCase()}`;
  }

  // Compute confidence based on saturation and typicality
  const confidence = Math.min(100, Math.round(50 + (s / 2)));

  return {
    tokenName: finalToken,
    description: desc,
    confidence
  };
}

function getLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function calculateColorContrast(textColor: string, bgColor: string): ColorContrastDetails | null {
  const textRgb = parseRgba(textColor);
  const bgRgb = parseRgba(bgColor);
  if (!textRgb || !bgRgb) return null;

  const l1 = getLuminance(textRgb.r, textRgb.g, textRgb.b);
  const l2 = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
  
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  const ratio = (brightest + 0.05) / (darkest + 0.05);

  const normalTextCompliant = {
    aa: ratio >= 4.5,
    aaa: ratio >= 7.0
  };

  const largeTextCompliant = {
    aa: ratio >= 3.0,
    aaa: ratio >= 4.5
  };

  let feedback = '';
  if (ratio >= 7.0) {
    feedback = `Contrast ratio is ${ratio.toFixed(2)}:1 (Passes AAA). Excellent readability.`;
  } else if (ratio >= 4.5) {
    feedback = `Contrast ratio is ${ratio.toFixed(2)}:1 (Passes AA). Good legibility for standard text.`;
  } else if (ratio >= 3.0) {
    feedback = `Contrast ratio is ${ratio.toFixed(2)}:1 (Passes AA for large text only). Poor for body text.`;
  } else {
    feedback = `Contrast ratio is ${ratio.toFixed(2)}:1 (Fails WCAG). Extremely low legibility.`;
  }

  return {
    ratio: `${ratio.toFixed(2)}:1`,
    ratioNum: ratio,
    normalTextCompliant,
    largeTextCompliant,
    feedback
  };
}

export function extractColorIntelligence(colors: ColorExtractionData): ColorIntelligence {
  const list: ColorAnalysis[] = [];

  if (colors.text && !colors.text.isTransparent) {
    const inferred = inferColorToken(colors.text.hex, 'text');
    list.push({
      color: colors.text,
      usage: 'text',
      ...inferred
    });
  }

  if (colors.background && !colors.background.isTransparent) {
    const inferred = inferColorToken(colors.background.hex, 'background');
    list.push({
      color: colors.background,
      usage: 'background',
      ...inferred
    });
  }

  if (colors.border && !colors.border.isTransparent) {
    const inferred = inferColorToken(colors.border.hex, 'border');
    list.push({
      color: colors.border,
      usage: 'border',
      ...inferred
    });
  }

  if (colors.shadows && colors.shadows.length > 0) {
    colors.shadows.forEach((shadowColor) => {
      if (!shadowColor.isTransparent) {
        const inferred = inferColorToken(shadowColor.hex, 'shadow');
        list.push({
          color: shadowColor,
          usage: 'shadow',
          ...inferred
        });
      }
    });
  }

  let contrast: ColorContrastDetails | null = null;
  if (colors.text && colors.background) {
    contrast = calculateColorContrast(colors.text.raw, colors.background.raw);
  }

  return {
    colors: list,
    contrast
  };
}
