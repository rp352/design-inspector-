import type { SVGDetails } from './types';

/**
 * Strips formatting and pretty-prints SVG XML code with clean indentation.
 */
export function prettyPrintSVG(svgString: string): string {
  if (!svgString) return '';
  
  // Strip existing whitespace between tags
  const cleanSvg = svgString.replace(/>\s+</g, '><').trim();
  let formatted = '';
  const reg = /(>)(<)(\/*)/g;
  const xml = cleanSvg.replace(reg, '$1\r\n$2$3');
  let pad = 0;
  
  xml.split('\r\n').forEach((node) => {
    let indent = 0;
    if (node.match(/^<\/\w/)) {
      if (pad !== 0) {
        pad -= 1;
      }
    } else if (node.match(/^<\w[^>]*[^\/]>$/)) {
      indent = 1;
    }

    let padding = '';
    for (let i = 0; i < pad; i++) {
      padding += '  ';
    }
    formatted += padding + node + '\r\n';
    pad += indent;
  });
  
  return formatted.trim();
}

/**
 * Synchronously extracts SVGDetails from an inline `<svg>` or Sprite SVG element.
 */
export function extractSVGDetails(svgEl: SVGSVGElement): SVGDetails {
  const viewBox = svgEl.getAttribute('viewBox') || undefined;
  const width = svgEl.getAttribute('width') || undefined;
  const height = svgEl.getAttribute('height') || undefined;
  const fill = svgEl.getAttribute('fill') || undefined;
  const stroke = svgEl.getAttribute('stroke') || undefined;
  const strokeWidth = svgEl.getAttribute('stroke-width') || undefined;
  
  const useEl = svgEl.querySelector('use');
  let type: 'inline' | 'sprite' = 'inline';
  
  let pathsCount = svgEl.querySelectorAll('path').length;
  let groupsCount = svgEl.querySelectorAll('g').length;
  let masksCount = svgEl.querySelectorAll('mask').length;
  let clipPathsCount = svgEl.querySelectorAll('clipPath').length;
  let filtersCount = svgEl.querySelectorAll('filter').length;
  
  if (useEl) {
    type = 'sprite';
    const href = useEl.getAttribute('href') || useEl.getAttribute('xlink:href') || '';
    if (href.startsWith('#')) {
      const targetId = href.substring(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        pathsCount += targetEl.querySelectorAll('path').length;
        groupsCount += targetEl.querySelectorAll('g').length;
        masksCount += targetEl.querySelectorAll('mask').length;
        clipPathsCount += targetEl.querySelectorAll('clipPath').length;
        filtersCount += targetEl.querySelectorAll('filter').length;
      }
    }
  }
  
  return {
    type,
    viewBox,
    width,
    height,
    fill,
    stroke,
    strokeWidth,
    pathsCount,
    groupsCount,
    masksCount,
    clipPathsCount,
    filtersCount,
    rawContent: prettyPrintSVG(svgEl.outerHTML)
  };
}

/**
 * Resolves details of an external SVG file or sprite sheet asynchronously.
 */
export async function resolveExternalSVG(url: string): Promise<Partial<SVGDetails>> {
  try {
    const hashIndex = url.indexOf('#');
    let fetchUrl = url;
    let targetId = '';
    
    if (hashIndex !== -1) {
      fetchUrl = url.substring(0, hashIndex);
      targetId = url.substring(hashIndex + 1);
    }
    
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const text = await res.text();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');
    
    const parserError = doc.querySelector('parsererror');
    if (parserError) throw new Error('XML parsing failed');
    
    const svgEl = doc.querySelector('svg');
    if (!svgEl) throw new Error('No SVG element found');
    
    let targetEl: Element = svgEl;
    if (targetId) {
      const elById = doc.getElementById(targetId) || doc.querySelector(`[id="${targetId}"]`);
      if (elById) {
        targetEl = elById;
      }
    }
    
    const viewBox = svgEl.getAttribute('viewBox') || undefined;
    const width = svgEl.getAttribute('width') || undefined;
    const height = svgEl.getAttribute('height') || undefined;
    const fill = targetEl.getAttribute('fill') || svgEl.getAttribute('fill') || undefined;
    const stroke = targetEl.getAttribute('stroke') || svgEl.getAttribute('stroke') || undefined;
    const strokeWidth = targetEl.getAttribute('stroke-width') || svgEl.getAttribute('stroke-width') || undefined;
    
    const pathsCount = targetEl.querySelectorAll('path').length;
    const groupsCount = targetEl.querySelectorAll('g').length;
    const masksCount = targetEl.querySelectorAll('mask').length;
    const clipPathsCount = targetEl.querySelectorAll('clipPath').length;
    const filtersCount = targetEl.querySelectorAll('filter').length;
    
    let rawContent = '';
    if (targetEl !== svgEl) {
      const viewBoxAttr = targetEl.getAttribute('viewBox') || viewBox || '';
      const viewBoxStr = viewBoxAttr ? ` viewBox="${viewBoxAttr}"` : '';
      rawContent = `<svg xmlns="http://www.w3.org/2000/svg"${viewBoxStr}>\n${targetEl.outerHTML}\n</svg>`;
    } else {
      rawContent = text;
    }
    
    return {
      viewBox,
      width,
      height,
      fill,
      stroke,
      strokeWidth,
      pathsCount,
      groupsCount,
      masksCount,
      clipPathsCount,
      filtersCount,
      rawContent: prettyPrintSVG(rawContent)
    };
  } catch (err: any) {
    console.error('[Design Inspector] Failed resolving external SVG:', err.message);
    return {};
  }
}
