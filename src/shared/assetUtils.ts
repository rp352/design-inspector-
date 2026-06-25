import type { AssetData } from './types';
import { detectImageSource } from './imageSourceUtils';

/**
 * Normalizes and extracts mime type from a URL or data URL.
 */
function getMimeType(url: string, tagName: string): string | undefined {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);/);
    return match ? match[1] : undefined;
  }
  
  const ext = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  if (!ext) {
    if (tagName === 'img') return 'image/png'; // default fallback for img
    if (tagName === 'video') return 'video/mp4';
    return undefined;
  }
  
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg'
  };
  
  return mimeTypes[ext];
}

/**
 * Scans an HTMLElement and classifies it into one of the supported asset types.
 */
export function detectElementAsset(el: HTMLElement): AssetData {
  const tagName = el.tagName.toLowerCase();
  const rect = el.getBoundingClientRect();
  const dimensions = {
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
  
  // 1. Check for Video
  if (tagName === 'video') {
    const videoEl = el as HTMLVideoElement;
    let url = videoEl.src;
    if (!url) {
      const source = videoEl.querySelector('source');
      url = source ? source.src : '';
    }
    return {
      type: 'video',
      url: url || undefined,
      isInline: url ? url.startsWith('data:') || url.startsWith('blob:') : false,
      mimeType: url ? getMimeType(url, 'video') : 'video/mp4',
      dimensions
    };
  }
  
  // 2. Check for Canvas
  if (tagName === 'canvas') {
    return {
      type: 'canvas',
      isInline: true,
      dimensions
    };
  }
  
  // 3. Check for Inline SVG (or node inside inline SVG)
  const svgEl = tagName === 'svg' ? el : el.closest('svg');
  if (svgEl) {
    const isSmall = dimensions.width <= 32 && dimensions.height <= 32;
    return {
      type: isSmall ? 'icon' : 'svg-inline',
      isInline: true,
      mimeType: 'image/svg+xml',
      dimensions,
      svgContent: svgEl.outerHTML
    };
  }
  
  // 4. Check for Lottie Animation
  const isLottieTag = tagName === 'lottie-player' || tagName === 'tgs-player';
  const hasLottieClass = Array.from(el.classList).some(c => c.toLowerCase().includes('lottie'));
  const hasLottieAttr = el.hasAttribute('data-animation-path') || el.hasAttribute('data-bm-renderer') || el.hasAttribute('data-lottie-id');
  if (isLottieTag || hasLottieClass || hasLottieAttr) {
    const animationPath = el.getAttribute('data-animation-path') || el.getAttribute('src') || undefined;
    return {
      type: 'lottie',
      url: animationPath,
      isInline: animationPath ? animationPath.startsWith('data:') : false,
      mimeType: 'application/json',
      dimensions
    };
  }

  // 5. Check for Icon (Font Icons or tags like <i>, <span> with icon classes)
  const isIconTag = tagName === 'i' || tagName === 'span';
  const hasIconClasses = Array.from(el.classList).some(c => {
    const cl = c.toLowerCase();
    return cl.startsWith('fa-') || cl === 'fa' || cl.startsWith('icon-') || cl.startsWith('lucide-') || cl.startsWith('tabler-icon') || cl.startsWith('feather-') || cl.startsWith('material-icons');
  });
  if ((isIconTag && hasIconClasses) || (el.getAttribute('role') === 'img' && hasIconClasses)) {
    return {
      type: 'icon',
      isInline: true,
      dimensions
    };
  }
  
/**
 * Detects the image file format extension.
 */
function detectExtension(url: string): string {
  if (!url) return 'UNKNOWN';
  if (url.startsWith('data:')) {
    const match = url.match(/^data:image\/([^;]+);/i);
    if (match) {
      const mimeSub = match[1].toLowerCase();
      if (mimeSub === 'jpeg' || mimeSub === 'jpg') return 'JPEG';
      if (mimeSub === 'svg+xml') return 'SVG';
      return mimeSub.toUpperCase();
    }
    return 'UNKNOWN';
  }
  
  const ext = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  if (!ext) return 'UNKNOWN';
  
  if (ext === 'jpg' || ext === 'jpeg') return 'JPEG';
  if (ext === 'png') return 'PNG';
  if (ext === 'webp') return 'WEBP';
  if (ext === 'avif') return 'AVIF';
  if (ext === 'gif') return 'GIF';
  if (ext === 'svg') return 'SVG';
  
  return ext.toUpperCase();
}

  // 6. Check for Image (Img tag)
  if (tagName === 'img') {
    const imgEl = el as HTMLImageElement;
    const url = imgEl.src || '';
    const isSvg = url.split(/[?#]/)[0].toLowerCase().endsWith('.svg') || url.startsWith('data:image/svg+xml');
    const extension = detectExtension(url);
    
    return {
      type: isSvg ? 'svg-external' : 'image',
      url: url || undefined,
      isInline: url.startsWith('data:'),
      mimeType: getMimeType(url, 'img'),
      dimensions,
      imageDetails: {
        src: url,
        srcset: imgEl.getAttribute('srcset') || undefined,
        width: dimensions.width,
        height: dimensions.height,
        naturalWidth: imgEl.naturalWidth,
        naturalHeight: imgEl.naturalHeight,
        loading: imgEl.getAttribute('loading') || 'eager',
        decoding: imgEl.getAttribute('decoding') || 'auto',
        alt: imgEl.getAttribute('alt') || '',
        extension,
        source: detectImageSource(url)
      }
    };
  }
  
  // 7. Check for SVG external (OBJECT or EMBED or IFRAME with SVG source)
  if (tagName === 'object') {
    const objEl = el as HTMLObjectElement;
    const url = objEl.data || '';
    if (url.toLowerCase().endsWith('.svg') || objEl.type === 'image/svg+xml') {
      return {
        type: 'svg-external',
        url: url || undefined,
        isInline: url.startsWith('data:'),
        mimeType: 'image/svg+xml',
        dimensions
      };
    }
  }
  if (tagName === 'embed') {
    const embedEl = el as HTMLEmbedElement;
    const url = embedEl.src || '';
    if (url.toLowerCase().endsWith('.svg') || embedEl.type === 'image/svg+xml') {
      return {
        type: 'svg-external',
        url: url || undefined,
        isInline: url.startsWith('data:'),
        mimeType: 'image/svg+xml',
        dimensions
      };
    }
  }
  
  // 8. Check for Background Image (CSS background-image rule)
  const computed = window.getComputedStyle(el);
  const bgImg = computed.backgroundImage;
  if (bgImg && bgImg !== 'none') {
    const match = bgImg.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    if (match) {
      const url = match[1];
      return {
        type: 'background-image',
        url: url || undefined,
        isInline: url.startsWith('data:'),
        mimeType: getMimeType(url, 'img'),
        dimensions
      };
    }
  }
  
  // 9. Unknown
  return {
    type: 'unknown',
    isInline: false,
    dimensions
  };
}
