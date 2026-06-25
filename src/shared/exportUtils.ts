export function generateJSONReport(el: any, url: string): any {
  const timestamp = new Date().toISOString();
  
  // Construct a semantic description for AI analysis
  const parts: string[] = [];
  parts.push(`This JSON represents a HTML <${el.tagName}> element extracted from ${url} at ${timestamp}.`);
  
  if (el.textContent) {
    parts.push(`The element contains text content: "${el.textContent}".`);
  }
  
  if (el.layout?.display) {
    parts.push(`It is rendered using "display: ${el.layout.display}" and layout position is "${el.layout.position || 'static'}".`);
  }
  
  if (el.typography?.fontFamily) {
    parts.push(`Typography styles specify font-family "${el.typography.fontFamily}", size "${el.typography.fontSize}", weight "${el.typography.fontWeight}", and color "${el.typography.color}".`);
  }
  
  if (el.background?.color && el.background.color !== 'transparent') {
    parts.push(`The background has base color: "${el.background.color}".`);
  }
  if (el.background && el.background.backgrounds.length > 0) {
    const bgTypes = el.background.backgrounds.map((b: any) => b.type).join(', ');
    parts.push(`The background has active layers: [${bgTypes}].`);
  }
  
  if (el.effects) {
    const br = el.effects.borderRadius;
    if (br.topLeft !== '0px' || br.topRight !== '0px' || br.bottomRight !== '0px' || br.bottomLeft !== '0px') {
      parts.push(`It has border radii: Top-Left: ${br.topLeft}, Top-Right: ${br.topRight}, Bottom-Right: ${br.bottomRight}, Bottom-Left: ${br.bottomLeft}.`);
    }
    if (el.effects.boxShadows.length > 0) {
      parts.push(`It has ${el.effects.boxShadows.length} box shadows applied.`);
    }
    if (el.effects.dropShadows.length > 0) {
      parts.push(`It has ${el.effects.dropShadows.length} drop shadows applied.`);
    }
    if (el.effects.filter && el.effects.filter !== 'none') {
      parts.push(`Filters: "${el.effects.filter}".`);
    }
  }

  const descriptionForAI = parts.join(' ');

  return {
    meta: {
      url,
      timestamp,
      descriptionForAI,
    },
    element: {
      tagName: el.tagName,
      id: el.id || null,
      className: el.className || null,
      textContent: el.textContent || null,
      rect: el.rect,
    },
    typography: el.typography || null,
    colors: el.colors || null,
    layout: el.layout || null,
    background: el.background || null,
    effects: el.effects || null,
    asset: el.asset || null
  };
}

export function generateCleanCSS(el: any): string {
  const rules: string[] = [];

  // Determine selector
  let selector = el.tagName;
  if (el.id) {
    selector = `#${el.id.replace('#', '')}`;
  } else if (el.className) {
    const classes = el.className.split('.').filter(Boolean);
    if (classes.length > 0) {
      selector = `.${classes[0]}`;
    }
  }

  // Layout & Box model
  if (el.layout) {
    if (el.layout.display) rules.push(`  display: ${el.layout.display};`);
    if (el.layout.position && el.layout.position !== 'static') {
      rules.push(`  position: ${el.layout.position};`);
      const off = el.layout.offsets;
      if (off.top !== 'auto') rules.push(`  top: ${off.top};`);
      if (off.right !== 'auto') rules.push(`  right: ${off.right};`);
      if (off.bottom !== 'auto') rules.push(`  bottom: ${off.bottom};`);
      if (off.left !== 'auto') rules.push(`  left: ${off.left};`);
    }
    const bm = el.layout.boxModel;
    if (bm.width && bm.width !== 'auto') rules.push(`  width: ${bm.width};`);
    if (bm.height && bm.height !== 'auto') rules.push(`  height: ${bm.height};`);
    
    // Padding and Margin
    const pad = bm.padding;
    if (pad.top !== '0px' || pad.right !== '0px' || pad.bottom !== '0px' || pad.left !== '0px') {
      if (pad.top === pad.bottom && pad.right === pad.left) {
        rules.push(`  padding: ${pad.top} ${pad.right};`);
      } else {
        rules.push(`  padding: ${pad.top} ${pad.right} ${pad.bottom} ${pad.left};`);
      }
    }
    const marg = bm.margin;
    if (marg.top !== '0px' || marg.right !== '0px' || marg.bottom !== '0px' || marg.left !== '0px') {
      if (marg.top === marg.bottom && marg.right === marg.left) {
        rules.push(`  margin: ${marg.top} ${marg.right};`);
      } else {
        rules.push(`  margin: ${marg.top} ${marg.right} ${marg.bottom} ${marg.left};`);
      }
    }
  }

  // Typography
  if (el.typography) {
    const ty = el.typography;
    if (ty.fontFamily) rules.push(`  font-family: ${ty.fontFamily};`);
    if (ty.fontSize) rules.push(`  font-size: ${ty.fontSize};`);
    if (ty.fontWeight) rules.push(`  font-weight: ${ty.fontWeight};`);
    if (ty.lineHeight && ty.lineHeight !== 'normal') rules.push(`  line-height: ${ty.lineHeight};`);
    if (ty.letterSpacing && ty.letterSpacing !== 'normal') rules.push(`  letter-spacing: ${ty.letterSpacing};`);
    if (ty.color) rules.push(`  color: ${ty.color};`);
  }

  // Background
  if (el.background) {
    const bg = el.background;
    if (bg.shorthand) {
      rules.push(`  background: ${bg.shorthand};`);
    } else if (bg.color && bg.color !== 'transparent') {
      rules.push(`  background-color: ${bg.color};`);
    }
  }

  // Effects (opacity, border-radius, box-shadow, filter, backdrop-filter)
  if (el.effects) {
    const eff = el.effects;
    const br = eff.borderRadius;
    if (br.raw && br.raw !== '0px') rules.push(`  border-radius: ${br.raw};`);
    if (eff.opacity && eff.opacity !== '1') rules.push(`  opacity: ${eff.opacity};`);
    if (eff.mixBlendMode && eff.mixBlendMode !== 'normal') rules.push(`  mix-blend-mode: ${eff.mixBlendMode};`);
    if (eff.isolation && eff.isolation !== 'auto') rules.push(`  isolation: ${eff.isolation};`);
    if (eff.filter && eff.filter !== 'none') rules.push(`  filter: ${eff.filter};`);
    if (eff.backdropFilter && eff.backdropFilter !== 'none') rules.push(`  backdrop-filter: ${eff.backdropFilter};`);
    
    // Box Shadow
    if (el.styles.boxShadow && el.styles.boxShadow !== 'none') {
      rules.push(`  box-shadow: ${el.styles.boxShadow};`);
    }
  }

  return `${selector} {\n${rules.join('\n')}\n}`;
}

export function generateTailwindSummary(el: any): string {
  const classes: string[] = [];

  const layout = el.layout;
  const typography = el.typography;
  const effects = el.effects;
  const background = el.background;

  if (layout) {
    // Display & Flexbox
    if (layout.display) {
      if (layout.display === 'flex') {
        classes.push('flex');
        if (layout.flexGrid?.flexDirection === 'column') classes.push('flex-col');
        if (layout.flexGrid?.flexDirection === 'row-reverse') classes.push('flex-row-reverse');
        if (layout.flexGrid?.flexDirection === 'column-reverse') classes.push('flex-col-reverse');
        if (layout.flexGrid?.flexWrap === 'wrap') classes.push('flex-wrap');
        
        const jcMap: Record<string, string> = {
          'flex-start': 'justify-start',
          'flex-end': 'justify-end',
          'center': 'justify-center',
          'space-between': 'justify-between',
          'space-around': 'justify-around',
          'space-evenly': 'justify-evenly'
        };
        if (layout.flexGrid?.justifyContent && jcMap[layout.flexGrid.justifyContent]) {
          classes.push(jcMap[layout.flexGrid.justifyContent]);
        }

        const aiMap: Record<string, string> = {
          'flex-start': 'items-start',
          'flex-end': 'items-end',
          'center': 'items-center',
          'baseline': 'items-baseline',
          'stretch': 'items-stretch'
        };
        if (layout.flexGrid?.alignItems && aiMap[layout.flexGrid.alignItems]) {
          classes.push(aiMap[layout.flexGrid.alignItems]);
        }
      } else if (layout.display === 'grid') {
        classes.push('grid');
        if (layout.flexGrid?.gridAutoFlow) {
          if (layout.flexGrid.gridAutoFlow.includes('column')) classes.push('grid-flow-col');
          else if (layout.flexGrid.gridAutoFlow.includes('row')) classes.push('grid-flow-row');
        }
      } else if (layout.display === 'block') {
        classes.push('block');
      } else if (layout.display === 'inline-block') {
        classes.push('inline-block');
      } else if (layout.display === 'inline') {
        classes.push('inline');
      } else if (layout.display === 'none') {
        classes.push('hidden');
      }
    }

    // Position
    if (layout.position && layout.position !== 'static') {
      classes.push(layout.position);
    }

    // Gap
    if (layout.flexGrid?.gap && layout.flexGrid.gap !== 'normal' && layout.flexGrid.gap !== '0px') {
      classes.push(`gap-[${layout.flexGrid.gap}]`);
    }
  }

  // Typography
  if (typography) {
    // Font Size
    if (typography.fontSize) {
      const size = parseInt(typography.fontSize);
      if (!isNaN(size)) {
        if (size <= 12) classes.push('text-xs');
        else if (size <= 14) classes.push('text-sm');
        else if (size <= 16) classes.push('text-base');
        else if (size <= 18) classes.push('text-lg');
        else if (size <= 20) classes.push('text-xl');
        else if (size <= 24) classes.push('text-2xl');
        else if (size <= 30) classes.push('text-3xl');
        else if (size <= 36) classes.push('text-4xl');
        else if (size <= 48) classes.push('text-5xl');
        else classes.push(`text-[${typography.fontSize}]`);
      }
    }

    // Font Weight
    if (typography.fontWeight) {
      const fw = typography.fontWeight;
      if (fw === 'bold' || fw === '700') classes.push('font-bold');
      else if (fw === 'semibold' || fw === '600') classes.push('font-semibold');
      else if (fw === 'medium' || fw === '500') classes.push('font-medium');
      else if (fw === 'normal' || fw === '400') classes.push('font-normal');
      else if (fw === 'light' || fw === '300') classes.push('font-light');
      else if (fw === '100') classes.push('font-thin');
      else if (fw === '200') classes.push('font-extralight');
      else if (fw === '800') classes.push('font-extrabold');
      else if (fw === '900') classes.push('font-black');
    }
  }

  // Background
  if (background && background.color && background.color !== 'transparent') {
    classes.push(`bg-[${background.color}]`);
  }

  // Effects & border radius
  if (effects) {
    // Border Radius
    const br = effects.borderRadius;
    if (br.topLeft === br.topRight && br.topRight === br.bottomRight && br.bottomRight === br.bottomLeft) {
      const radius = br.topLeft;
      if (radius && radius !== '0px') {
        if (radius === '9999px' || radius === '50%') classes.push('rounded-full');
        else if (radius === '2px') classes.push('rounded-sm');
        else if (radius === '4px') classes.push('rounded');
        else if (radius === '6px') classes.push('rounded-md');
        else if (radius === '8px') classes.push('rounded-lg');
        else if (radius === '12px') classes.push('rounded-xl');
        else if (radius === '16px') classes.push('rounded-2xl');
        else if (radius === '24px') classes.push('rounded-3xl');
        else classes.push(`rounded-[${radius}]`);
      }
    } else {
      if (br.topLeft !== '0px') classes.push(`rounded-tl-[${br.topLeft}]`);
      if (br.topRight !== '0px') classes.push(`rounded-tr-[${br.topRight}]`);
      if (br.bottomRight !== '0px') classes.push(`rounded-br-[${br.bottomRight}]`);
      if (br.bottomLeft !== '0px') classes.push(`rounded-bl-[${br.bottomLeft}]`);
    }

    // Opacity
    if (effects.opacity && effects.opacity !== '1') {
      const op = Math.round(parseFloat(effects.opacity) * 100);
      if (!isNaN(op)) {
        classes.push(`opacity-${op}`);
      }
    }

    // Shadows
    if (effects.boxShadows.length > 0 || effects.dropShadows.length > 0) {
      classes.push('shadow');
    }
  }

  return classes.join(' ');
}
