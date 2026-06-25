import type { BackgroundDetails, SingleBackgroundInfo, GradientDetails, ColorStop } from './types';

/**
 * Paren-aware tokenizer to split CSS strings by commas or spaces.
 */
export function splitCSSTokens(str: string, separator: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    
    if (char === separator && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

/**
 * Parses gradient string to extract its type, direction/angle, and stops breakdown.
 */
function parseGradient(gradientStr: string): GradientDetails | undefined {
  const normalized = gradientStr.trim();
  const match = normalized.match(/^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/i);
  if (!match) return undefined;
  
  const typeStr = match[2].toLowerCase() as 'linear' | 'radial' | 'conic';
  const innerContent = match[3];
  
  const tokens = splitCSSTokens(innerContent, ',');
  if (tokens.length === 0) return undefined;
  
  let direction: string | undefined = undefined;
  let startIdx = 0;
  
  // Check if first token is direction/angle
  const firstToken = tokens[0].trim();
  const isDir = (
    firstToken.includes('deg') ||
    firstToken.startsWith('to ') ||
    firstToken.startsWith('at ') ||
    firstToken.includes('circle') ||
    firstToken.includes('ellipse') ||
    firstToken.startsWith('from ') ||
    ['top', 'right', 'bottom', 'left', 'center'].includes(firstToken.toLowerCase())
  );
  
  if (isDir) {
    direction = firstToken;
    startIdx = 1;
  }
  
  const stops: ColorStop[] = [];
  const positionRegex = /(\s+[\d.-]+(?:%|px|deg)?)$/i;
  
  for (let i = startIdx; i < tokens.length; i++) {
    const token = tokens[i].trim();
    const posMatch = token.match(positionRegex);
    
    let color = token;
    let position: string | undefined = undefined;
    
    if (posMatch) {
      position = posMatch[1].trim();
      color = token.substring(0, token.length - posMatch[1].length).trim();
    }
    
    stops.push({ color, position });
  }
  
  // Interpolate missing stop percentages
  const populatedStops = stops.map((stop, idx) => {
    if (stop.position) return stop;
    if (idx === 0) return { ...stop, position: '0%' };
    if (idx === stops.length - 1) return { ...stop, position: '100%' };
    const pct = Math.round((idx / (stops.length - 1)) * 100);
    return { ...stop, position: `${pct}%` };
  });
  
  return {
    type: typeStr,
    direction,
    stops: populatedStops,
    raw: normalized
  };
}

/**
 * Extracts comprehensive background styling properties from an inspected element.
 */
export function extractBackgroundDetails(el: HTMLElement): BackgroundDetails {
  const computed = window.getComputedStyle(el);
  
  const bgColor = computed.backgroundColor;
  const bgImage = computed.backgroundImage;
  const bgBlendMode = computed.backgroundBlendMode;
  const bgAttachment = computed.backgroundAttachment;
  const bgPosition = computed.backgroundPosition;
  const bgSize = computed.backgroundSize;
  const bgRepeat = computed.backgroundRepeat;
  const shorthand = computed.background || '';
  
  const images = splitCSSTokens(bgImage, ',');
  const blendModes = splitCSSTokens(bgBlendMode, ',');
  const attachments = splitCSSTokens(bgAttachment, ',');
  const positions = splitCSSTokens(bgPosition, ',');
  const sizes = splitCSSTokens(bgSize, ',');
  const repeats = splitCSSTokens(bgRepeat, ',');
  
  const getLayerVal = (arr: string[], idx: number, fallback: string) => {
    if (arr.length === 0) return fallback;
    return arr[idx % arr.length] || fallback;
  };
  
  const backgrounds: SingleBackgroundInfo[] = [];
  
  for (let i = 0; i < images.length; i++) {
    const imgStr = images[i].trim();
    let type: 'solid' | 'gradient' | 'image' | 'none' = 'none';
    let color: string | undefined = undefined;
    let gradient: GradientDetails | undefined = undefined;
    let imageUrl: string | undefined = undefined;
    
    if (imgStr.includes('gradient')) {
      type = 'gradient';
      gradient = parseGradient(imgStr);
    } else if (imgStr.startsWith('url(')) {
      type = 'image';
      const match = imgStr.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
      imageUrl = match ? match[1] : undefined;
    } else if (i === images.length - 1 && bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      type = 'solid';
      color = bgColor;
    }
    
    backgrounds.push({
      type,
      color,
      gradient,
      imageUrl,
      blendMode: getLayerVal(blendModes, i, 'normal'),
      attachment: getLayerVal(attachments, i, 'scroll'),
      position: getLayerVal(positions, i, '0% 0%'),
      size: getLayerVal(sizes, i, 'auto'),
      repeat: getLayerVal(repeats, i, 'repeat')
    });
  }
  
  // Solid color fallback if no layered images are computed
  if (backgrounds.length === 0 || (backgrounds.length === 1 && backgrounds[0].type === 'none')) {
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      backgrounds[0] = {
        type: 'solid',
        color: bgColor,
        blendMode: 'normal',
        attachment: 'scroll',
        position: '0% 0%',
        size: 'auto',
        repeat: 'repeat'
      };
    }
  }
  
  return {
    color: bgColor,
    shorthand,
    backgrounds,
    multiple: images.length > 1
  };
}
