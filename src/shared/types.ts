export type MessageSource = 'content' | 'background' | 'sidepanel';

export interface TypographyData {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  color: string;
}

export interface ColorInfo {
  raw: string;
  hex: string;
  rgb: string;
  isTransparent: boolean;
}

export interface ColorExtractionData {
  text: ColorInfo | null;
  background: ColorInfo | null;
  border: ColorInfo | null;
  shadows: ColorInfo[];
}

export interface BoxModelData {
  margin: { top: string; right: string; bottom: string; left: string };
  border: { top: string; right: string; bottom: string; left: string };
  padding: { top: string; right: string; bottom: string; left: string };
  width: string;
  height: string;
}

export interface FlexGridData {
  flexDirection?: string;
  flexWrap?: string;
  justifyContent?: string;
  alignItems?: string;
  flexGrow?: string;
  flexShrink?: string;
  flexBasis?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridAutoFlow?: string;
  gap?: string;
}

export interface LayoutExtractionData {
  display: string;
  position: string;
  boxModel: BoxModelData;
  offsets: { top: string; right: string; bottom: string; left: string };
  flexGrid: FlexGridData;
}

export interface ImageSourceInfo {
  provider: string;
  confidence: number;
  documentationLink?: string;
}

export interface ImageDetails {
  src: string;
  srcset?: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  loading: string;
  decoding: string;
  alt: string;
  extension: string;
  source?: ImageSourceInfo;
}

export interface SVGDetails {
  type: 'inline' | 'external' | 'sprite';
  viewBox?: string;
  width?: string;
  height?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  pathsCount: number;
  groupsCount: number;
  masksCount: number;
  clipPathsCount: number;
  filtersCount: number;
  rawContent: string;
}

export interface IconDetails {
  library: string;
  iconName?: string;
  confidence: number;
  documentation?: string;
}

export interface AssetData {
  type: 'image' | 'svg-inline' | 'svg-external' | 'background-image' | 'video' | 'canvas' | 'lottie' | 'icon' | 'unknown';
  url?: string;
  isInline: boolean;
  mimeType?: string;
  dimensions?: { width: number; height: number };
  svgContent?: string;
  imageDetails?: ImageDetails;
  svgDetails?: SVGDetails;
  iconDetails?: IconDetails;
}

export interface ColorStop {
  color: string;
  position?: string;
}

export interface GradientDetails {
  type: 'linear' | 'radial' | 'conic' | 'other';
  direction?: string;
  stops: ColorStop[];
  raw: string;
}

export interface SingleBackgroundInfo {
  type: 'solid' | 'gradient' | 'image' | 'none';
  color?: string;
  gradient?: GradientDetails;
  imageUrl?: string;
  blendMode: string;
  attachment: string;
  position: string;
  size: string;
  repeat: string;
}

export interface BackgroundDetails {
  color: string;
  shorthand: string;
  backgrounds: SingleBackgroundInfo[];
  multiple: boolean;
}

export interface ParsedShadow {
  type: 'box-shadow' | 'drop-shadow';
  inset: boolean;
  offsetX: string;
  offsetY: string;
  blurRadius: string;
  spreadRadius: string;
  color: string;
  raw: string;
}

export interface ParsedBorderRadius {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
  raw: string;
}

export interface FilterValues {
  blur?: string;
  brightness?: string;
  contrast?: string;
  grayscale?: string;
  hueRotate?: string;
  invert?: string;
  opacity?: string;
  saturate?: string;
  sepia?: string;
}

export interface EffectDetails {
  boxShadows: ParsedShadow[];
  dropShadows: ParsedShadow[];
  filter: string;
  backdropFilter: string;
  opacity: string;
  mixBlendMode: string;
  isolation: string;
  borderRadius: ParsedBorderRadius;
  filters: FilterValues;
  backdropFilters: FilterValues;
}

export interface DesignToken {
  category: 'typography' | 'color' | 'spacing' | 'radius' | 'shadow' | 'opacity' | 'border' | 'background';
  tokenName: string;
  value: string;
  role: string;
}

export interface DesignTokenReport {
  tokens: DesignToken[];
  system: 'semantic' | 'tailwind' | 'material' | 'custom';
}

export interface TypographyIntelligence {
  classification: 'Display' | 'Hero' | 'Heading XL' | 'Heading Large' | 'Heading Medium' | 'Body Large' | 'Body' | 'Body Small' | 'Caption' | 'Label' | 'Button' | 'Code' | 'Overline' | 'Unknown';
  readingComfort: {
    score: number;
    level: 'Excellent' | 'Good' | 'Moderate' | 'Poor';
    feedback: string;
  };
  accessibility: {
    sizeCompliant: boolean;
    contrastRatio: string;
    contrastLevel: 'AAA Passed' | 'AA Passed' | 'Failed' | 'N/A';
    feedback: string;
  };
  hierarchyLevel: number;
}

export interface ColorAnalysis {
  color: ColorInfo;
  usage: 'text' | 'background' | 'border' | 'shadow';
  tokenName: string;
  description: string;
  confidence: number;
}

export interface ColorContrastDetails {
  ratio: string;
  ratioNum: number;
  normalTextCompliant: { aa: boolean; aaa: boolean };
  largeTextCompliant: { aa: boolean; aaa: boolean };
  feedback: string;
}

export interface ColorIntelligence {
  colors: ColorAnalysis[];
  contrast: ColorContrastDetails | null;
}

export interface SpacingItem {
  type: 'padding' | 'margin' | 'gap';
  direction: 'top' | 'right' | 'bottom' | 'left' | 'row' | 'column' | 'all';
  valuePx: number;
  tokenName: string;
  isGridCompliant: boolean; // divisible by 8
}

export interface SpacingIntelligence {
  spacingItems: SpacingItem[];
  gridComplianceScore: number; // 0 - 100
  gridFeedback: string;
}

export interface CornerClassification {
  topLeft: 'Sharp' | 'Small' | 'Medium' | 'Large' | 'Pill' | 'Circle';
  topRight: 'Sharp' | 'Small' | 'Medium' | 'Large' | 'Pill' | 'Circle';
  bottomRight: 'Sharp' | 'Small' | 'Medium' | 'Large' | 'Pill' | 'Circle';
  bottomLeft: 'Sharp' | 'Small' | 'Medium' | 'Large' | 'Pill' | 'Circle';
}

export interface BorderRadiusIntelligence {
  classification: 'Sharp' | 'Small' | 'Medium' | 'Large' | 'Pill' | 'Circle' | 'Mixed';
  corners: CornerClassification;
  raw: {
    topLeft: string;
    topRight: string;
    bottomRight: string;
    bottomLeft: string;
  };
  uniform: boolean;
  gridCompliance: boolean; // divisible by 2px (typical standard radius scale)
}

export interface ShadowIntelligence {
  classification: 'None' | 'Small' | 'Medium' | 'Large' | 'Floating Card' | 'Elevated Modal' | 'Glass Effect';
  elevationLevel: number; // 0 - 5
  hasGlassEffect: boolean;
  shadowsCount: number;
  layers: ParsedShadow[];
}

export interface ElementHoverInfo {
  tagName: string;
  className: string;
  id: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  styles: Record<string, string>;
  typography: TypographyData;
  colors: ColorExtractionData;
  layout: LayoutExtractionData;
  asset: AssetData;
  background?: BackgroundDetails;
  effects?: EffectDetails;
  tokens?: DesignTokenReport;
  typographyIntelligence?: TypographyIntelligence;
  colorIntelligence?: ColorIntelligence;
  spacingIntelligence?: SpacingIntelligence;
  borderRadiusIntelligence?: BorderRadiusIntelligence;
  shadowIntelligence?: ShadowIntelligence;
}

export interface TabInfo {
  tabId: number;
  url: string;
  title: string;
}

export interface ElementSelectInfo {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  styles: Record<string, string>;
  typography: TypographyData;
  colors: ColorExtractionData;
  layout: LayoutExtractionData;
  asset: AssetData;
  background?: BackgroundDetails;
  effects?: EffectDetails;
  tokens?: DesignTokenReport;
  typographyIntelligence?: TypographyIntelligence;
  colorIntelligence?: ColorIntelligence;
  spacingIntelligence?: SpacingIntelligence;
  borderRadiusIntelligence?: BorderRadiusIntelligence;
  shadowIntelligence?: ShadowIntelligence;
}

export interface MessagePayloadMap {
  'PING': { text: string };
  'PONG': { text: string; sender: string };
  'GET_TAB_INFO': undefined;
  'TAB_CHANGED': TabInfo;
  'TOGGLE_INSPECT': { enabled: boolean };
  'ELEMENT_HOVERED': ElementHoverInfo;
  'ELEMENT_SELECTED': ElementSelectInfo;
  'RESET_SELECTION': undefined;
  'STATUS_UPDATE': { status: 'ready' | 'inspecting' | 'error'; message?: string; detectedStack?: string[] };
  'DETECT_STACK': undefined;
}

export interface ExtensionMessage<T extends keyof MessagePayloadMap = keyof MessagePayloadMap> {
  type: T;
  payload: MessagePayloadMap[T];
  source: MessageSource;
  timestamp: number;
}

export type AnyExtensionMessage = {
  [K in keyof MessagePayloadMap]: ExtensionMessage<K>;
}[keyof MessagePayloadMap];

