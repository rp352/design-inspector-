import type { IconDetails } from './types';

/**
 * Helper to scan stylesheet and script tags in the page to detect loaded icon CDNs.
 */
function getLoadedIconCDNs(): Record<string, boolean> {
  const cdns: Record<string, boolean> = {};
  if (typeof document === 'undefined') return cdns;

  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  const scripts = Array.from(document.querySelectorAll('script'));

  const check = (str: string) => {
    const s = str.toLowerCase();
    if (s.includes('font-awesome') || s.includes('fontawesome') || s.includes('fa-')) cdns['Font Awesome'] = true;
    if (s.includes('material-icons') || s.includes('material-symbols') || s.includes('material%20icons')) cdns['Material Symbols'] = true;
    if (s.includes('bootstrap-icons')) cdns['Bootstrap Icons'] = true;
    if (s.includes('remixicon')) cdns['Remix Icons'] = true;
    if (s.includes('tabler-icons') || s.includes('tabler%20icons')) cdns['Tabler Icons'] = true;
    if (s.includes('feather-icons') || s.includes('feather.js')) cdns['Feather'] = true;
    if (s.includes('ionicons')) cdns['Ionicons'] = true;
    if (s.includes('phosphor')) cdns['Phosphor'] = true;
    if (s.includes('heroicons')) cdns['Heroicons'] = true;
  };

  links.forEach(l => check(l.getAttribute('href') || ''));
  scripts.forEach(s => check(s.getAttribute('src') || ''));

  return cdns;
}

/**
 * Detects if the given element is a common icon and extracts its metadata.
 * Supports Lucide, Heroicons, Font Awesome, Material Symbols, Bootstrap Icons,
 * Remix Icons, Tabler Icons, Feather, Ionicons, and Phosphor.
 */
export function detectIconLibrary(el: HTMLElement): IconDetails {
  if (!el) {
    return { library: 'Custom Icon', confidence: 1.0 };
  }

  const tagName = el.tagName.toLowerCase();
  
  // Collate classes from the element and up to 2 parents
  const classes: string[] = Array.from(el.classList);
  let parent = el.parentElement;
  for (let i = 0; i < 2; i++) {
    if (parent) {
      Array.from(parent.classList).forEach(c => {
        if (!classes.includes(c)) classes.push(c);
      });
      parent = parent.parentElement;
    }
  }

  const activeCDNs = getLoadedIconCDNs();

  // Helper to extract clean name by removing prefixes/modifiers
  const extractName = (prefix: string, modifiers: string[] = []): string | undefined => {
    const matchClass = classes.find(c => c.startsWith(prefix));
    if (!matchClass) return undefined;
    const rawName = matchClass.substring(prefix.length);
    // Ignore if name itself is a modifier or style description
    if (modifiers.includes(rawName)) return undefined;
    return rawName;
  };

  // 1. Ionicons
  if (tagName === 'ion-icon' || classes.some(c => c.startsWith('ion-'))) {
    const nameAttr = el.getAttribute('name') || el.getAttribute('icon');
    const nameFromClass = extractName('ion-');
    return {
      library: 'Ionicons',
      iconName: nameAttr || nameFromClass || 'unknown',
      confidence: 1.0,
      documentation: 'https://ionic.io/ionicons'
    };
  }

  // 2. Font Awesome
  const isFaSvg = tagName === 'svg' && (el.classList.contains('svg-inline--fa') || el.hasAttribute('data-icon'));
  const hasFaClass = classes.some(c => c.startsWith('fa-') || c === 'fa' || c === 'fas' || c === 'far' || c === 'fab' || c === 'fal' || c === 'fad');
  if (isFaSvg || hasFaClass) {
    const dataIcon = el.getAttribute('data-icon') || undefined;
    const nameFromClass = extractName('fa-', [
      'solid', 'regular', 'light', 'thin', 'duotone', 'brands',
      '1x', '2x', '3x', '4x', '5x', 'lg', 'xs', 'sm', 'fw', 'spin', 'pulse'
    ]);
    return {
      library: 'Font Awesome',
      iconName: dataIcon || nameFromClass || 'unknown',
      confidence: 1.0,
      documentation: 'https://fontawesome.com/icons'
    };
  }

  // 3. Material Symbols / Material Icons
  const materialClasses = [
    'material-icons', 'material-icons-outlined', 'material-icons-two-tone',
    'material-icons-round', 'material-icons-sharp', 'material-symbols-outlined',
    'material-symbols-rounded', 'material-symbols-sharp'
  ];
  if (materialClasses.some(c => classes.includes(c)) || activeCDNs['Material Symbols']) {
    const textContent = el.textContent?.trim();
    const isFontIcon = textContent && textContent.length > 0 && !textContent.includes('<') && textContent.length < 30;
    if (isFontIcon || materialClasses.some(c => classes.includes(c))) {
      return {
        library: 'Material Symbols',
        iconName: isFontIcon ? textContent : 'unknown',
        confidence: isFontIcon ? 1.0 : 0.8,
        documentation: 'https://fonts.google.com/icons'
      };
    }
  }

  // 4. Lucide
  const isLucideSvg = tagName === 'svg' && (el.classList.contains('lucide') || classes.some(c => c.startsWith('lucide-')));
  if (isLucideSvg) {
    const name = extractName('lucide-') || extractName('lucide') || 'unknown';
    return {
      library: 'Lucide',
      iconName: name,
      confidence: 1.0,
      documentation: 'https://lucide.dev/icons/'
    };
  }

  // 5. Bootstrap Icons
  if (classes.some(c => c.startsWith('bi-'))) {
    const name = extractName('bi-') || 'unknown';
    return {
      library: 'Bootstrap Icons',
      iconName: name,
      confidence: 1.0,
      documentation: 'https://icons.getbootstrap.com/'
    };
  }

  // 6. Remix Icons
  if (classes.some(c => c.startsWith('ri-'))) {
    const name = extractName('ri-', ['fw', 'xxs', 'xs', 'sm', '1x', '2x', '3x', 'lg']);
    return {
      library: 'Remix Icons',
      iconName: name || 'unknown',
      confidence: 1.0,
      documentation: 'https://remixicon.com/'
    };
  }

  // 7. Tabler Icons
  const isTabler = classes.some(c => c.startsWith('ti-') || c.startsWith('tabler-icon-') || c === 'tabler-icon');
  if (isTabler) {
    const name = extractName('tabler-icon-') || extractName('ti-') || 'unknown';
    return {
      library: 'Tabler Icons',
      iconName: name,
      confidence: 1.0,
      documentation: 'https://tabler.io/icons'
    };
  }

  // 8. Feather
  const isFeather = classes.some(c => c.startsWith('feather-') || c === 'feather');
  if (isFeather) {
    const name = extractName('feather-') || 'unknown';
    return {
      library: 'Feather',
      iconName: name,
      confidence: 1.0,
      documentation: 'https://feathericons.com/'
    };
  }

  // 9. Phosphor
  if (classes.some(c => c.startsWith('ph-'))) {
    const name = extractName('ph-', ['bold', 'fill', 'regular', 'light', 'thin', 'duotone']);
    return {
      library: 'Phosphor',
      iconName: name || 'unknown',
      confidence: 1.0,
      documentation: 'https://phosphoricons.com/'
    };
  }

  // 10. Heroicons
  // Heroicons inline SVGs generally don't carry classes. We look for CDN signals, class keywords,
  // or typical attributes (e.g. viewBox="0 0 24 24" fill="none" stroke-width="1.5")
  const hasHeroiconClass = classes.some(c => c.toLowerCase().includes('heroicon'));
  const isPotentialHeroiconSvg = tagName === 'svg' && (
    (el.getAttribute('viewBox') === '0 0 24 24' && el.getAttribute('stroke-width') === '1.5' && el.getAttribute('fill') === 'none') ||
    (el.getAttribute('viewBox') === '0 0 20 20' && el.getAttribute('fill') === 'currentColor') ||
    (el.getAttribute('viewBox') === '0 0 16 16' && el.getAttribute('fill') === 'currentColor')
  );
  if (hasHeroiconClass || (isPotentialHeroiconSvg && activeCDNs['Heroicons'])) {
    return {
      library: 'Heroicons',
      iconName: extractName('heroicon-') || 'unknown',
      confidence: hasHeroiconClass ? 1.0 : 0.8,
      documentation: 'https://heroicons.com/'
    };
  }

  return { library: 'Custom Icon', confidence: 1.0 };
}
