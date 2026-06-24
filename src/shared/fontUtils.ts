export interface FontIdentificationResult {
  fontName: string;
  source: 'Google Fonts' | 'System Font' | 'Custom / Licensed';
  isGoogleFont: boolean;
  googleFontUrl?: string;
}

// Curated list of popular Google Fonts (~150 design fonts)
const GOOGLE_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Oswald',
  'Source Sans Pro',
  'Source Sans 3',
  'Slabo 27px',
  'Raleway',
  'PT Sans',
  'Merriweather',
  'Noto Sans',
  'Playfair Display',
  'Lora',
  'Rubik',
  'Kanit',
  'Nunito',
  'Nunito Sans',
  'Amatic SC',
  'Mukta',
  'Work Sans',
  'Dosis',
  'Quicksand',
  'Barlow',
  'Fira Sans',
  'Josefin Sans',
  'PT Serif',
  'Cabin',
  'DM Sans',
  'Arimo',
  'Assistant',
  'Hind',
  'Heebo',
  'Karla',
  'Ubuntu',
  'Poppins',
  'Outfit',
  'Plus Jakarta Sans',
  'Manrope',
  'Bitter',
  'Crimson Text',
  'Cinzel',
  'Pacifico',
  'Caveat',
  'Dancing Script',
  'Comfortaa',
  'Righteous',
  'Lilita One',
  'Shadows Into Light',
  'Lobster',
  'Abril Fatface',
  'Patua One',
  'Satisfy',
  'Bebas Neue',
  'DM Serif Display',
  'Merriweather Sans',
  'Sora',
  'Syne',
  'Space Grotesk',
  'Urbanist',
  'Titillium Web',
  'Inconsolata',
  'Maven Pro',
  'Cairo',
  'Exo 2',
  'Playpen Sans',
  'Cormorant Garamond',
  'Great Vibes',
  'Libre Baskerville',
  'Domine',
  'Hind Siliguri',
  'Hind Madurai',
  'Exo',
  'Monda',
  'Teko',
  'Archivo',
  'Asap',
  'Abel',
  'Signika',
  'Philosopher',
  'Varela Round',
  'Fredoka One',
  'Fredoka',
  'Unbounded',
  'Playfair',
  'Chivo',
  'Overpass',
  'Fjalla One',
  'Anton',
  'Pathway Gothic One',
  'Alegreya',
  'Alegreya Sans',
  'Cardo',
  'Krona One',
  'Sen',
  'Jost',
  'Bricolage Grotesque',
  'Schibsted Grotesk',
  'Catamaran',
  'Yantramanav',
  'Rajdhani',
  'Tangerine',
  'Pinyon Script',
  'Sacramento',
  'Allura',
  'Alex Brush',
  'Cookie',
  'Yellowtail',
  'Grand Hotel',
  'Parisienne',
  'Kaushan Script',
  'Damion',
  'Mr Dafoe',
  'Niconne',
  'Monoton',
  'Press Start 2P',
  'Special Elite',
  'VT323',
  'Share Tech Mono',
  'Nanum Gothic',
  'Nanum Myeongjo',
  'Nanum Pen Script',
  'Nanum Brush Script',
  'Noto Serif JP',
  'Noto Serif KR',
  'Noto Serif TC',
  'Noto Serif SC',
  'Noto Serif HK'
];

// Curated list of Web-safe / System Fonts
const SYSTEM_FONTS = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Times',
  'Courier New',
  'Courier',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Lucida Grande',
  'Palatino Linotype',
  'Palatino',
  'Garamond',
  'Bookman',
  'Calibri',
  'Segoe UI',
  'Tahoma',
  'Geneva',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  'Consolas',
  'Monaco'
];

/**
 * Normalizes a font name by removing casing, quotes, whitespace, and special characters.
 */
export function normalizeFontName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Identifies the source and details of a font-family string.
 * Supports multiple font fallbacks (stack) and implements case-insensitive fuzzy matching.
 */
export function identifyFont(fontFamilyStr: string): FontIdentificationResult {
  if (!fontFamilyStr) {
    return {
      fontName: 'Unknown',
      source: 'Custom / Licensed',
      isGoogleFont: false
    };
  }

  // Parse font stack (split on commas, strip surrounding quotes and extra spaces)
  const fontStack = fontFamilyStr
    .split(',')
    .map((f) => f.trim().replace(/['"]/g, ''))
    .filter(Boolean);

  if (fontStack.length === 0) {
    return {
      fontName: 'Unknown',
      source: 'Custom / Licensed',
      isGoogleFont: false
    };
  }

  // Helper for matching normalized names
  const findMatch = (name: string, list: string[]): string | undefined => {
    const normalizedTarget = normalizeFontName(name);
    return list.find((item) => normalizeFontName(item) === normalizedTarget);
  };

  // 1. Iterate through the stack and try to find any Google Font (resolves fallback logic)
  for (const font of fontStack) {
    const googleMatch = findMatch(font, GOOGLE_FONTS);
    if (googleMatch) {
      return {
        fontName: googleMatch, // Return official capitalization name
        source: 'Google Fonts',
        isGoogleFont: true,
        googleFontUrl: `https://fonts.google.com/specimen/${encodeURIComponent(googleMatch).replace(/%20/g, '+')}`
      };
    }
  }

  // 2. If no Google Font is found in the stack, analyze the primary (first) font in the stack
  const primaryFont = fontStack[0];
  
  const systemMatch = findMatch(primaryFont, SYSTEM_FONTS);
  if (systemMatch) {
    return {
      fontName: systemMatch, // Return official capitalization name
      source: 'System Font',
      isGoogleFont: false
    };
  }

  // 3. Fallback to Custom / Licensed font
  return {
    fontName: primaryFont,
    source: 'Custom / Licensed',
    isGoogleFont: false
  };
}
