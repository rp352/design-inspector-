
// Simple utility to convert strings to kebab-case
export function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
}

export function exportToDTCG(
  font: { fontName: string; source: string },
  colors: any[],
  spacing: any[],
  radii: any[],
  shadows: any[]
): string {
  const dtcg: Record<string, any> = {};

  // 1. Typography / Font family
  if (font && font.fontName !== '—') {
    dtcg.typography = {
      'font-family': {
        primary: {
          $value: font.fontName,
          $type: 'fontFamily',
          $description: `Primary website font family (${font.source})`
        }
      }
    };
  }

  // 2. Colors
  if (colors && colors.length > 0) {
    dtcg.color = {};
    colors.forEach((c) => {
      const name = toKebabCase(c.token);
      dtcg.color[name] = {
        $value: c.hex,
        $type: 'color',
        $description: `Inferred color token (role: ${c.role}, contrast: ${c.contrast})`
      };
    });
  }

  // 3. Spacing
  if (spacing && spacing.length > 0) {
    dtcg.spacing = {};
    spacing.forEach((s) => {
      const name = toKebabCase(s.tokenName);
      dtcg.spacing[name] = {
        $value: `${s.valuePx}px`,
        $type: 'dimension',
        $description: `Inferred spacing scale item (value: ${s.valuePx}px)`
      };
    });
  }

  // 4. Radius
  if (radii && radii.length > 0) {
    dtcg.radius = {};
    radii.forEach((r) => {
      const name = toKebabCase(r.tokenName);
      dtcg.radius[name] = {
        $value: r.value,
        $type: 'dimension',
        $description: `Inferred border radius item (value: ${r.value})`
      };
    });
  }

  // 5. Shadows
  if (shadows && shadows.length > 0) {
    dtcg.shadow = {};
    shadows.forEach((sh) => {
      const name = toKebabCase(sh.classification);
      dtcg.shadow[name] = {
        $value: sh.raw,
        $type: 'shadow',
        $description: `Inferred box shadow elevation style`
      };
    });
  }

  return JSON.stringify(dtcg, null, 2);
}

export function exportToFigma(
  font: { fontName: string; source: string },
  colors: any[],
  spacing: any[],
  radii: any[],
  shadows: any[]
): string {
  const figmaVars: Array<{ name: string; type: 'COLOR' | 'FLOAT' | 'STRING'; value: any }> = [];

  // 1. Typography
  if (font && font.fontName !== '—') {
    figmaVars.push({
      name: 'typography/font-primary',
      type: 'STRING',
      value: font.fontName
    });
  }

  // 2. Colors
  if (colors && colors.length > 0) {
    colors.forEach((c) => {
      const name = `color/${toKebabCase(c.token)}`;
      figmaVars.push({
        name,
        type: 'COLOR',
        value: c.hex
      });
    });
  }

  // 3. Spacing
  if (spacing && spacing.length > 0) {
    spacing.forEach((s) => {
      const name = `spacing/${toKebabCase(s.tokenName)}`;
      figmaVars.push({
        name,
        type: 'FLOAT',
        value: s.valuePx
      });
    });
  }

  // 4. Radius
  if (radii && radii.length > 0) {
    radii.forEach((r) => {
      const name = `radius/${toKebabCase(r.tokenName)}`;
      const numVal = parseFloat(r.value);
      figmaVars.push({
        name,
        type: 'FLOAT',
        value: isNaN(numVal) ? r.value : numVal
      });
    });
  }

  // 5. Shadows
  if (shadows && shadows.length > 0) {
    shadows.forEach((sh) => {
      const name = `shadow/${toKebabCase(sh.classification)}`;
      figmaVars.push({
        name,
        type: 'STRING',
        value: sh.raw
      });
    });
  }

  return JSON.stringify(figmaVars, null, 2);
}

export function exportToCSS(
  font: { fontName: string; source: string },
  colors: any[],
  spacing: any[],
  radii: any[],
  shadows: any[]
): string {
  const cssLines: string[] = [];
  cssLines.push(':root {');

  // 1. Typography
  if (font && font.fontName !== '—') {
    cssLines.push(`  /* Typography */`);
    cssLines.push(`  --font-primary: '${font.fontName}', sans-serif;`);
    cssLines.push('');
  }

  // 2. Colors
  if (colors && colors.length > 0) {
    cssLines.push(`  /* Colors */`);
    colors.forEach((c) => {
      const name = toKebabCase(c.token);
      cssLines.push(`  --color-${name}: ${c.hex};`);
    });
    cssLines.push('');
  }

  // 3. Spacing
  if (spacing && spacing.length > 0) {
    cssLines.push(`  /* Spacing */`);
    spacing.forEach((s) => {
      const name = toKebabCase(s.tokenName);
      cssLines.push(`  --${name}: ${s.valuePx}px;`);
    });
    cssLines.push('');
  }

  // 4. Radius
  if (radii && radii.length > 0) {
    cssLines.push(`  /* Radius */`);
    radii.forEach((r) => {
      const name = toKebabCase(r.tokenName);
      cssLines.push(`  --radius-${name}: ${r.value};`);
    });
    cssLines.push('');
  }

  // 5. Shadows
  if (shadows && shadows.length > 0) {
    cssLines.push(`  /* Shadows */`);
    shadows.forEach((sh) => {
      const name = toKebabCase(sh.classification);
      cssLines.push(`  --shadow-${name}: ${sh.raw};`);
    });
    cssLines.push('');
  }

  // Remove the trailing empty line if it exists
  if (cssLines[cssLines.length - 1] === '') {
    cssLines.pop();
  }

  cssLines.push('}');
  return cssLines.join('\n');
}

export function exportToTailwind(
  font: { fontName: string; source: string },
  colors: any[],
  spacing: any[],
  radii: any[],
  shadows: any[]
): string {
  const tailwindObj: Record<string, any> = {};

  // 1. Typography
  if (font && font.fontName !== '—') {
    tailwindObj.fontFamily = {
      primary: [font.fontName, 'sans-serif']
    };
  }

  // 2. Colors
  if (colors && colors.length > 0) {
    tailwindObj.colors = {};
    colors.forEach((c) => {
      const name = toKebabCase(c.token);
      tailwindObj.colors[name] = c.hex;
    });
  }

  // 3. Spacing
  if (spacing && spacing.length > 0) {
    tailwindObj.spacing = {};
    spacing.forEach((s) => {
      const name = toKebabCase(s.tokenName);
      tailwindObj.spacing[name] = `${s.valuePx}px`;
    });
  }

  // 4. Radius
  if (radii && radii.length > 0) {
    tailwindObj.borderRadius = {};
    radii.forEach((r) => {
      const name = toKebabCase(r.tokenName);
      tailwindObj.borderRadius[name] = r.value;
    });
  }

  // 5. Shadows
  if (shadows && shadows.length > 0) {
    tailwindObj.boxShadow = {};
    shadows.forEach((sh) => {
      const name = toKebabCase(sh.classification);
      tailwindObj.boxShadow[name] = sh.raw;
    });
  }

  const prettyConfig = JSON.stringify(tailwindObj, null, 2);
  // Construct best-effort tailwind.config.js output
  return `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: ${prettyConfig.replace(/\n/g, '\n    ')}
  },
  plugins: [],
};`;
}
