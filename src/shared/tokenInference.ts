import type { DesignToken, DesignTokenReport } from './types';

export interface TokenInferenceAdapter {
  inferTypography(fontSize: string, fontWeight: string): DesignToken[];
  inferColors(textColor: string, bgColor: string, borderColor: string): DesignToken[];
  inferSpacing(padding: { top: string; right: string; bottom: string; left: string }, margin: { top: string; right: string; bottom: string; left: string }): DesignToken[];
  inferRadius(radius: { topLeft: string; topRight: string; bottomRight: string; bottomLeft: string }): DesignToken[];
  inferShadow(boxShadows: any[], dropShadows: any[]): DesignToken[];
  inferOpacity(opacity: string): DesignToken[];
  inferBorder(borderWidths: { top: string; right: string; bottom: string; left: string }): DesignToken[];
  inferBackground(color: string, shorthand: string, bgLayers: any[]): DesignToken[];
}

// 1. Decoupled Semantic Token Inference Adapter
export class SemanticInferenceAdapter implements TokenInferenceAdapter {
  private parsePx(val: string): number {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  private getSpacingName(px: number): string {
    if (px <= 0) return 'Space/None';
    if (px <= 4) return 'Space/XX-Small';
    if (px <= 8) return 'Space/X-Small';
    if (px <= 12) return 'Space/Small';
    if (px <= 16) return 'Space/Medium';
    if (px <= 24) return 'Space/Large';
    if (px <= 32) return 'Space/X-Large';
    if (px <= 48) return 'Space/2X-Large';
    return 'Space/3X-Large';
  }

  private getRadiusName(px: number): string {
    if (px <= 0) return 'Radius/None';
    if (px <= 2) return 'Radius/X-Small';
    if (px <= 4) return 'Radius/Small';
    if (px <= 6) return 'Radius/Medium';
    if (px <= 8) return 'Radius/Large';
    if (px <= 12) return 'Radius/X-Large';
    if (px <= 24) return 'Radius/2X-Large';
    return 'Radius/Full';
  }

  inferTypography(fontSize: string, fontWeight: string): DesignToken[] {
    const tokens: DesignToken[] = [];
    const sizePx = this.parsePx(fontSize);
    
    // Sizing Inferences
    let sizeTokenName = 'Typography/Body Text';
    let sizeRole = 'Default reading text size';
    if (sizePx <= 10) {
      sizeTokenName = 'Typography/Tiny';
      sizeRole = 'Very small utility labels';
    } else if (sizePx <= 12) {
      sizeTokenName = 'Typography/Caption';
      sizeRole = 'Secondary helper / Caption labels';
    } else if (sizePx <= 14) {
      sizeTokenName = 'Typography/Body Small';
      sizeRole = 'Compact reading text';
    } else if (sizePx <= 16) {
      sizeTokenName = 'Typography/Body Text';
      sizeRole = 'Standard body copy';
    } else if (sizePx <= 18) {
      sizeTokenName = 'Typography/Subheading';
      sizeRole = 'Small title / Subheading';
    } else if (sizePx <= 20) {
      sizeTokenName = 'Typography/Heading Small';
      sizeRole = 'Section header sizing';
    } else if (sizePx <= 28) {
      sizeTokenName = 'Typography/Heading Medium';
      sizeRole = 'Component / Card header';
    } else if (sizePx <= 38) {
      sizeTokenName = 'Typography/Heading Large';
      sizeRole = 'Main page titles';
    } else {
      sizeTokenName = 'Typography/Display';
      sizeRole = 'Large visual statement headings';
    }
    
    tokens.push({
      category: 'typography',
      tokenName: sizeTokenName,
      value: fontSize,
      role: sizeRole
    });

    // Weight Inferences
    const weightNum = parseInt(fontWeight);
    let weightName = 'Font Weight/Regular';
    if (weightNum === 100) weightName = 'Font Weight/Thin';
    else if (weightNum === 200) weightName = 'Font Weight/Extra Light';
    else if (weightNum === 300) weightName = 'Font Weight/Light';
    else if (weightNum === 400 || fontWeight === 'normal') weightName = 'Font Weight/Regular';
    else if (weightNum === 500 || fontWeight === 'medium') weightName = 'Font Weight/Medium';
    else if (weightNum === 600 || fontWeight === 'semibold') weightName = 'Font Weight/Semibold';
    else if (weightNum === 700 || fontWeight === 'bold') weightName = 'Font Weight/Bold';
    else if (weightNum === 800) weightName = 'Font Weight/Extra Bold';
    else if (weightNum === 900) weightName = 'Font Weight/Black';

    tokens.push({
      category: 'typography',
      tokenName: weightName,
      value: fontWeight,
      role: `Applies weight rendering to text layers`
    });

    return tokens;
  }

  private getColorSemanticRole(role: 'text' | 'bg' | 'border', color: string): { name: string; desc: string } {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
      return { name: `Color/${role === 'bg' ? 'Background' : role === 'border' ? 'Border' : 'Text'}/Transparent`, desc: 'Empty alpha layer' };
    }

    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      const lightness = (r * 299 + g * 587 + b * 114) / 1000;
      
      if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15) {
        // Monochrome (white/gray/black)
        if (lightness > 240) {
          return {
            name: `Color/${role === 'bg' ? 'Surface' : role === 'border' ? 'Border' : 'Text'}/Light`,
            desc: `High lightness monochrome for ${role} rendering`
          };
        }
        if (lightness < 35) {
          return {
            name: `Color/${role === 'bg' ? 'Surface' : role === 'border' ? 'Border' : 'Text'}/Dark`,
            desc: `Low lightness monochrome for ${role} rendering`
          };
        }
        return {
          name: `Color/${role === 'bg' ? 'Surface' : role === 'border' ? 'Border' : 'Text'}/Muted`,
          desc: `Midrange gray utility shade for ${role} layers`
        };
      }
      
      // Accent roles
      if (r > g && r > b) return { name: `Color/${role === 'bg' ? 'Surface' : role === 'border' ? 'Border' : 'Text'}/Accent Warm`, desc: 'Warm color tone accents' };
      if (b > r && b > g) return { name: `Color/${role === 'bg' ? 'Surface' : role === 'border' ? 'Border' : 'Text'}/Accent Cool`, desc: 'Cool color tone accents' };
      return { name: `Color/${role === 'bg' ? 'Surface' : role === 'border' ? 'Border' : 'Text'}/Brand`, desc: 'Adaptive primary brand theme palette' };
    }

    return { name: `Color/${role}/Custom`, desc: 'Named or custom custom scale color' };
  }

  inferColors(textColor: string, bgColor: string, borderColor: string): DesignToken[] {
    const tokens: DesignToken[] = [];
    
    if (textColor) {
      const textRole = this.getColorSemanticRole('text', textColor);
      tokens.push({ category: 'color', tokenName: textRole.name, value: textColor, role: textRole.desc });
    }
    if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
      const bgRole = this.getColorSemanticRole('bg', bgColor);
      tokens.push({ category: 'color', tokenName: bgRole.name, value: bgColor, role: bgRole.desc });
    }
    if (borderColor && borderColor !== 'transparent' && borderColor !== 'rgba(0, 0, 0, 0)' && !borderColor.includes('none')) {
      const borderRole = this.getColorSemanticRole('border', borderColor);
      tokens.push({ category: 'color', tokenName: borderRole.name, value: borderColor, role: borderRole.desc });
    }

    return tokens;
  }

  inferSpacing(padding: any, margin: any): DesignToken[] {
    const tokens: DesignToken[] = [];
    
    // Padding summary
    if (padding) {
      const { top, right, bottom, left } = padding;
      const values = [this.parsePx(top), this.parsePx(right), this.parsePx(bottom), this.parsePx(left)];
      const maxVal = Math.max(...values);
      if (maxVal > 0) {
        if (top === bottom && right === left) {
          if (top === right) {
            tokens.push({
              category: 'spacing',
              tokenName: this.getSpacingName(this.parsePx(top)),
              value: top,
              role: 'Uniform internal container inset padding'
            });
          } else {
            tokens.push({
              category: 'spacing',
              tokenName: `${this.getSpacingName(this.parsePx(top))} Y / ${this.getSpacingName(this.parsePx(right))} X`,
              value: `${top} ${right}`,
              role: 'Bi-directional padding (Vertical / Horizontal)'
            });
          }
        } else {
          tokens.push({
            category: 'spacing',
            tokenName: 'Space/Asymmetric Padding',
            value: `${top} ${right} ${bottom} ${left}`,
            role: 'Custom spacing layout constraints'
          });
        }
      }
    }

    // Margin summary
    if (margin) {
      const { top, right, bottom, left } = margin;
      const values = [this.parsePx(top), this.parsePx(right), this.parsePx(bottom), this.parsePx(left)];
      const maxVal = Math.max(...values);
      if (maxVal > 0) {
        if (top === bottom && right === left) {
          if (top === right) {
            tokens.push({
              category: 'spacing',
              tokenName: this.getSpacingName(this.parsePx(top)),
              value: top,
              role: 'Uniform external margins'
            });
          } else {
            tokens.push({
              category: 'spacing',
              tokenName: `${this.getSpacingName(this.parsePx(top))} Y / ${this.getSpacingName(this.parsePx(right))} X`,
              value: `${top} ${right}`,
              role: 'External margins (Vertical / Horizontal)'
            });
          }
        } else {
          tokens.push({
            category: 'spacing',
            tokenName: 'Space/Asymmetric Margin',
            value: `${top} ${right} ${bottom} ${left}`,
            role: 'Custom outer bounds layouts'
          });
        }
      }
    }

    return tokens;
  }

  inferRadius(radius: any): DesignToken[] {
    const tokens: DesignToken[] = [];
    if (!radius) return tokens;

    const { topLeft, topRight, bottomRight, bottomLeft } = radius;
    const values = [this.parsePx(topLeft), this.parsePx(topRight), this.parsePx(bottomRight), this.parsePx(bottomLeft)];
    const maxVal = Math.max(...values);

    if (maxVal > 0) {
      if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
        tokens.push({
          category: 'radius',
          tokenName: this.getRadiusName(this.parsePx(topLeft)),
          value: topLeft,
          role: 'Uniform corner clipping radius'
        });
      } else {
        tokens.push({
          category: 'radius',
          tokenName: 'Radius/Asymmetric',
          value: `${topLeft} ${topRight} ${bottomRight} ${bottomLeft}`,
          role: 'Unique stylistic corner radii shapes'
        });
      }
    }

    return tokens;
  }

  inferShadow(boxShadows: any[], dropShadows: any[]): DesignToken[] {
    const tokens: DesignToken[] = [];
    const all = [...boxShadows, ...dropShadows];
    if (all.length === 0) return tokens;

    for (let i = 0; i < all.length; i++) {
      const sh = all[i];
      const blur = this.parsePx(sh.blurRadius);
      let name = 'Shadow/Medium';
      let desc = 'Standard component elevation depth shadow';
      
      if (sh.inset) {
        name = 'Shadow/Inset';
        desc = 'Recessed inner frame shadow layer';
      } else if (blur <= 2) {
        name = 'Shadow/Sharp';
        desc = 'Hard borders and paper edge depth indicators';
      } else if (blur <= 6) {
        name = 'Shadow/Small';
        desc = 'Small component elevation depth shadow';
      } else if (blur > 16) {
        name = 'Shadow/Large';
        desc = 'High-floating window / dropdown menu shadow overlay';
      }

      tokens.push({
        category: 'shadow',
        tokenName: name,
        value: sh.raw,
        role: desc
      });
    }

    return tokens;
  }

  inferOpacity(opacity: string): DesignToken[] {
    const tokens: DesignToken[] = [];
    const num = parseFloat(opacity);
    if (isNaN(num) || num === 1) return tokens;

    let name = 'Opacity/Opaque';
    let role = 'Fully visible display layers';
    
    if (num === 0) {
      name = 'Opacity/Transparent';
      role = 'Fully invisible layers';
    } else if (num <= 0.1) {
      name = 'Opacity/Faint';
      role = 'Faint structural helper / grid guidelines';
    } else if (num <= 0.3) {
      name = 'Opacity/Low';
      role = 'Utility backgrounds / hover states';
    } else if (num <= 0.6) {
      name = 'Opacity/Muted';
      role = 'Disabled text / secondary headers';
    } else if (num <= 0.9) {
      name = 'Opacity/Subtle';
      role = 'Nearly opaque components overlays';
    }

    tokens.push({
      category: 'opacity',
      tokenName: name,
      value: opacity,
      role
    });

    return tokens;
  }

  inferBorder(borderWidths: any): DesignToken[] {
    const tokens: DesignToken[] = [];
    if (!borderWidths) return tokens;

    const { top, right, bottom, left } = borderWidths;
    const values = [this.parsePx(top), this.parsePx(right), this.parsePx(bottom), this.parsePx(left)];
    const maxVal = Math.max(...values);

    if (maxVal > 0) {
      let name = 'Border Width/Thin';
      if (maxVal > 4) name = 'Border Width/Heavy';
      else if (maxVal > 2) name = 'Border Width/Thick';
      else if (maxVal > 1) name = 'Border Width/Medium';

      tokens.push({
        category: 'border',
        tokenName: name,
        value: top === bottom && right === left && top === right ? top : `${top} ${right} ${bottom} ${left}`,
        role: 'Applies bounds / stroke dividers outlining elements'
      });
    }

    return tokens;
  }

  inferBackground(_color: string, _shorthand: string, bgLayers: any[]): DesignToken[] {
    const tokens: DesignToken[] = [];
    if (bgLayers.length > 0) {
      for (const layer of bgLayers) {
        if (layer.type === 'gradient') {
          tokens.push({
            category: 'background',
            tokenName: 'Background/Gradient Fill',
            value: layer.gradient?.raw || 'gradient',
            role: 'Visual gradient coloring fill layer'
          });
        } else if (layer.type === 'image') {
          tokens.push({
            category: 'background',
            tokenName: 'Background/Image Source',
            value: layer.imageUrl || 'image',
            role: 'External media cover background image'
          });
        }
      }
    }
    return tokens;
  }
}

// 2. Future Tailwind Token Inference Adapter Placeholder
export class TailwindInferenceAdapter implements TokenInferenceAdapter {
  inferTypography(fontSize: string, fontWeight: string): DesignToken[] {
    const sizeNum = parseFloat(fontSize);
    let sizeToken = 'text-base';
    if (sizeNum <= 12) sizeToken = 'text-xs';
    else if (sizeNum <= 14) sizeToken = 'text-sm';
    else if (sizeNum <= 16) sizeToken = 'text-base';
    else if (sizeNum <= 18) sizeToken = 'text-lg';
    else if (sizeNum <= 20) sizeToken = 'text-xl';
    else if (sizeNum <= 24) sizeToken = 'text-2xl';
    else if (sizeNum <= 30) sizeToken = 'text-3xl';
    else sizeToken = 'text-4xl';

    const wNum = parseInt(fontWeight);
    let wToken = 'font-normal';
    if (wNum <= 200) wToken = 'font-thin';
    else if (wNum <= 300) wToken = 'font-light';
    else if (wNum <= 400) wToken = 'font-normal';
    else if (wNum <= 500) wToken = 'font-medium';
    else if (wNum <= 600) wToken = 'font-semibold';
    else wToken = 'font-bold';

    return [
      { category: 'typography', tokenName: `text-size: ${sizeToken}`, value: fontSize, role: 'Tailwind Sizing Class Utility' },
      { category: 'typography', tokenName: `text-weight: ${wToken}`, value: fontWeight, role: 'Tailwind Weight Class Utility' }
    ];
  }

  inferColors(textColor: string, _bgColor: string, _borderColor: string): DesignToken[] {
    return [
      { category: 'color', tokenName: 'color-text: custom-hex', value: textColor || '#ffffff', role: 'Custom color utility' }
    ];
  }

  inferSpacing(padding: any, _margin: any): DesignToken[] {
    return [
      { category: 'spacing', tokenName: 'p-[custom]', value: padding?.top || '0px', role: 'Inlined tailwind spacing padding' }
    ];
  }

  inferRadius(radius: any): DesignToken[] {
    return [{ category: 'radius', tokenName: 'rounded-md', value: radius?.topLeft || '0px', role: 'Default tailwind border radius' }];
  }

  inferShadow(_boxShadows: any[], _dropShadows: any[]): DesignToken[] {
    return [{ category: 'shadow', tokenName: 'shadow-md', value: 'box-shadow', role: 'Default tailwind shadow utility' }];
  }

  inferOpacity(opacity: string): DesignToken[] {
    return [{ category: 'opacity', tokenName: 'opacity-100', value: opacity, role: 'Default tailwind opacity class' }];
  }

  inferBorder(borderWidths: any): DesignToken[] {
    return [{ category: 'border', tokenName: 'border-sm', value: borderWidths?.top || '0px', role: 'Tailwind border thin utility' }];
  }

  inferBackground(_color: string, shorthand: string, _bgLayers: any[]): DesignToken[] {
    return [{ category: 'background', tokenName: 'bg-cover', value: shorthand, role: 'Tailwind background properties utility' }];
  }
}

// 3. Future Material Design Token Inference Adapter Placeholder
export class MaterialInferenceAdapter implements TokenInferenceAdapter {
  inferTypography(fontSize: string, _fontWeight: string): DesignToken[] {
    return [
      { category: 'typography', tokenName: 'md.custom.typography/body-large', value: fontSize, role: 'Material Design Sizing Utility' }
    ];
  }

  inferColors(textColor: string, _bgColor: string, _borderColor: string): DesignToken[] {
    return [{ category: 'color', tokenName: 'md.sys.color.primary', value: textColor || '#ffffff', role: 'Material System Color Palette' }];
  }

  inferSpacing(padding: any, _margin: any): DesignToken[] {
    return [{ category: 'spacing', tokenName: 'md.spacing.padding-medium', value: padding?.top || '8px', role: 'Material spacing parameters' }];
  }

  inferRadius(radius: any): DesignToken[] {
    return [{ category: 'radius', tokenName: 'md.shape.corner.medium', value: radius?.topLeft || '0px', role: 'Material radius shape token' }];
  }

  inferShadow(_boxShadows: any[], _dropShadows: any[]): DesignToken[] {
    return [{ category: 'shadow', tokenName: 'md.elevation.level1', value: 'shadow', role: 'Material standard elevation depth shadow' }];
  }

  inferOpacity(opacity: string): DesignToken[] {
    return [{ category: 'opacity', tokenName: 'md.state.opacity.hover', value: opacity, role: 'Material opacity states' }];
  }

  inferBorder(borderWidths: any): DesignToken[] {
    return [{ category: 'border', tokenName: 'md.shape.outline', value: borderWidths?.top || '0px', role: 'Material outlines token' }];
  }

  inferBackground(_color: string, shorthand: string, _bgLayers: any[]): DesignToken[] {
    return [{ category: 'background', tokenName: 'md.sys.background.surface', value: shorthand, role: 'Material background surface colors' }];
  }
}

// Inference Engine Main Runner
export function inferDesignTokens(el: any, system: 'semantic' | 'tailwind' | 'material' | 'custom' = 'semantic'): DesignTokenReport {
  let adapter: TokenInferenceAdapter;
  
  switch (system) {
    case 'tailwind':
      adapter = new TailwindInferenceAdapter();
      break;
    case 'material':
      adapter = new MaterialInferenceAdapter();
      break;
    default:
      adapter = new SemanticInferenceAdapter();
      break;
  }

  const computed = el.styles || {};
  const typography = el.typography || {};
  const colors = el.colors || {};
  const layout = el.layout || {};
  const background = el.background || null;
  const effects = el.effects || null;

  const bgLayers = background ? background.backgrounds : [];
  const boxShadows = effects ? effects.boxShadows : [];
  const dropShadows = effects ? effects.dropShadows : [];
  const br = effects ? effects.borderRadius : { topLeft: '0px', topRight: '0px', bottomRight: '0px', bottomLeft: '0px' };
  
  const pad = (layout.boxModel && layout.boxModel.padding) || { top: '0px', right: '0px', bottom: '0px', left: '0px' };
  const marg = (layout.boxModel && layout.boxModel.margin) || { top: '0px', right: '0px', bottom: '0px', left: '0px' };
  const borders = (layout.boxModel && layout.boxModel.border) || { top: '0px', right: '0px', bottom: '0px', left: '0px' };

  let tokens: DesignToken[] = [];

  // Gather tokens
  tokens = tokens.concat(adapter.inferTypography(typography.fontSize || '16px', typography.fontWeight || '400'));
  tokens = tokens.concat(adapter.inferColors(colors.text?.raw, colors.background?.raw, colors.border?.raw));
  tokens = tokens.concat(adapter.inferSpacing(pad, marg));
  tokens = tokens.concat(adapter.inferRadius(br));
  tokens = tokens.concat(adapter.inferShadow(boxShadows, dropShadows));
  tokens = tokens.concat(adapter.inferOpacity(computed.opacity || '1'));
  tokens = tokens.concat(adapter.inferBorder(borders));
  tokens = tokens.concat(adapter.inferBackground(colors.background?.raw, background?.shorthand, bgLayers));

  return {
    tokens,
    system
  };
}
