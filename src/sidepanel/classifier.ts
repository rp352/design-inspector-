import type { ElementHoverInfo, ElementSelectInfo } from '../shared/types';

export type SemanticCategory =
  | 'Text'
  | 'Heading'
  | 'Paragraph'
  | 'Link'
  | 'Button'
  | 'Input'
  | 'Textarea'
  | 'Image'
  | 'Picture'
  | 'SVG'
  | 'Video'
  | 'Canvas'
  | 'Iframe'
  | 'Section'
  | 'Container'
  | 'Navigation'
  | 'List'
  | 'Card'
  | 'Background Image'
  | 'Unknown';

export interface ElementClassification {
  type: SemanticCategory;
  subtype: string;
  confidence: number;
  hasText: boolean;
  hasBackgroundImage: boolean;
  isInteractive: boolean;
  isMedia: boolean;
  isLayoutContainer: boolean;
}

export interface ElementClassifier {
  name: string;
  classify(el: ElementSelectInfo | ElementHoverInfo): Partial<ElementClassification> | null;
}

// 1. Tag & Accessibility Role Classifier
class TagAndRoleClassifier implements ElementClassifier {
  name = 'TagAndRole';

  classify(el: ElementSelectInfo | ElementHoverInfo): Partial<ElementClassification> | null {
    const tagName = el.tagName.toLowerCase();
    const role = (el.styles?.role || '').toLowerCase();
    
    let type: SemanticCategory = 'Unknown';
    let subtype = tagName;
    let confidence = 0.5;
    let isInteractive = false;
    let isMedia = false;
    let isLayoutContainer = false;

    // Check Interactive elements
    if (tagName === 'button' || role === 'button' || (tagName === 'input' && ['button', 'submit', 'reset'].includes(el.styles?.type || ''))) {
      type = 'Button';
      isInteractive = true;
      confidence = 0.9;
    } else if (tagName === 'a' || role === 'link') {
      type = 'Link';
      isInteractive = true;
      confidence = 0.9;
    } else if (tagName === 'textarea') {
      type = 'Textarea';
      isInteractive = true;
      confidence = 0.9;
    } else if (tagName === 'input' || tagName === 'select') {
      type = 'Input';
      isInteractive = true;
      confidence = 0.9;
    } else if (tagName === 'iframe') {
      type = 'Iframe';
      isInteractive = true;
      confidence = 0.9;
    }
    
    // Check Headings & Paragraphs
    else if (/^h[1-6]$/.test(tagName) || role === 'heading') {
      type = 'Heading';
      confidence = 0.9;
    } else if (['p', 'blockquote', 'pre'].includes(tagName)) {
      type = 'Paragraph';
      confidence = 0.8;
    }
    
    // Check Media & Vectors
    else if (tagName === 'img' || el.asset?.type === 'image') {
      type = 'Image';
      isMedia = true;
      confidence = 0.95;
    } else if (tagName === 'picture') {
      type = 'Picture';
      isMedia = true;
      confidence = 0.95;
    } else if (tagName === 'svg' || tagName === 'path' || tagName === 'g' || el.asset?.type === 'svg-inline' || el.asset?.type === 'svg-external') {
      type = 'SVG';
      isMedia = true;
      confidence = 0.9;
    } else if (tagName === 'video' || el.asset?.type === 'video') {
      type = 'Video';
      isMedia = true;
      confidence = 0.95;
    } else if (tagName === 'canvas' || el.asset?.type === 'canvas') {
      type = 'Canvas';
      isMedia = true;
      confidence = 0.9;
    }
    
    // Check Structural / Containers
    else if (['section', 'article', 'aside', 'header', 'footer', 'main'].includes(tagName)) {
      type = 'Section';
      isLayoutContainer = true;
      confidence = 0.8;
    } else if (tagName === 'nav' || role === 'navigation') {
      type = 'Navigation';
      isLayoutContainer = true;
      confidence = 0.9;
    } else if (['ul', 'ol', 'li', 'dl', 'dt', 'dd'].includes(tagName) || role === 'list' || role === 'listitem') {
      type = 'List';
      isLayoutContainer = true;
      confidence = 0.85;
    } else if (['div', 'form', 'table', 'tbody', 'thead', 'tr', 'td'].includes(tagName)) {
      type = 'Container';
      isLayoutContainer = true;
      confidence = 0.6;
    }
    
    // Fallback inline text tags
    else if (['span', 'b', 'strong', 'i', 'em', 'small', 'code', 'sub', 'sup', 'label'].includes(tagName)) {
      type = 'Text';
      confidence = 0.7;
    }

    return { type, subtype, confidence, isInteractive, isMedia, isLayoutContainer };
  }
}

// 2. Style-based and Card Classifier
class StyleAndLayoutClassifier implements ElementClassifier {
  name = 'StyleAndLayout';

  classify(el: ElementSelectInfo | ElementHoverInfo): Partial<ElementClassification> | null {
    const tagName = el.tagName.toLowerCase();
    const className = (el.className || '').toLowerCase();
    
    // Background Image detection
    const hasBgImage = el.background?.backgrounds.some(bg => bg.type === 'image' || bg.imageUrl) || el.asset?.type === 'background-image';
    
    // Card detection rules
    const isContainerTag = ['div', 'section', 'article', 'li'].includes(tagName);
    const hasCardClass = className.split(/\s+/).some(cls => 
      ['card', 'tile', 'panel', 'item', 'modal', 'dialog'].some(keyword => cls.includes(keyword))
    );
    
    // Check if it has borders, radius, or shadow styling indicative of a card
    const hasRounding = el.effects?.borderRadius && (
      el.effects.borderRadius.topLeft !== '0px' ||
      el.effects.borderRadius.topRight !== '0px' ||
      el.effects.borderRadius.bottomRight !== '0px' ||
      el.effects.borderRadius.bottomLeft !== '0px'
    );
    const hasShadow = el.effects?.boxShadows && el.effects.boxShadows.length > 0;
    const hasBorder = el.styles?.border && el.styles.border !== 'none' && el.styles.border !== '';

    if (isContainerTag && (hasCardClass || (hasRounding && hasShadow) || (hasShadow && hasBorder))) {
      return {
        type: 'Card',
        subtype: hasCardClass ? 'styled-card-class' : 'styled-container',
        confidence: hasCardClass && hasShadow ? 0.85 : 0.7,
        hasBackgroundImage: !!hasBgImage,
        isLayoutContainer: true
      };
    }

    if (hasBgImage) {
      return {
        type: 'Background Image',
        subtype: 'css-background-image',
        confidence: 0.8,
        hasBackgroundImage: true
      };
    }

    return {
      hasBackgroundImage: !!hasBgImage
    };
  }
}

// 3. Content and Metadata Classifier
class ContentClassifier implements ElementClassifier {
  name = 'Content';

  classify(el: ElementSelectInfo | ElementHoverInfo): Partial<ElementClassification> | null {
    // Determine text presence
    const selectEl = el as ElementSelectInfo;
    const hasText = !!(
      selectEl.textContent?.trim() || 
      el.styles?.alt || 
      el.asset?.imageDetails?.alt
    );

    return { hasText };
  }
}

// 4. Main Classification Engine
export class ElementClassificationEngine {
  private classifiers: ElementClassifier[] = [];

  constructor() {
    // Register default classifiers
    this.registerClassifier(new TagAndRoleClassifier());
    this.registerClassifier(new StyleAndLayoutClassifier());
    this.registerClassifier(new ContentClassifier());
  }

  registerClassifier(classifier: ElementClassifier) {
    this.classifiers.push(classifier);
  }

  classify(el: ElementSelectInfo | ElementHoverInfo): ElementClassification {
    let result: ElementClassification = {
      type: 'Unknown',
      subtype: el.tagName,
      confidence: 0.1,
      hasText: false,
      hasBackgroundImage: false,
      isInteractive: false,
      isMedia: false,
      isLayoutContainer: false
    };

    // Evaluate each classifier and merge results.
    // Classifications with higher confidence can override the type/subtype.
    for (const classifier of this.classifiers) {
      const partial = classifier.classify(el);
      if (partial) {
        // Merge boolean/trait flags
        if (partial.hasText !== undefined) result.hasText = partial.hasText;
        if (partial.hasBackgroundImage !== undefined) result.hasBackgroundImage = partial.hasBackgroundImage;
        if (partial.isInteractive !== undefined) result.isInteractive = partial.isInteractive;
        if (partial.isMedia !== undefined) result.isMedia = partial.isMedia;
        if (partial.isLayoutContainer !== undefined) result.isLayoutContainer = partial.isLayoutContainer;

        // Override type/subtype if confidence is higher
        if (partial.type && partial.confidence && partial.confidence > result.confidence) {
          result.type = partial.type;
          result.subtype = partial.subtype || result.subtype;
          result.confidence = partial.confidence;
        }
      }
    }

    return result;
  }
}

// Export a singleton instance
export const elementClassificationEngine = new ElementClassificationEngine();
