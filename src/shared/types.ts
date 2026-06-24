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
  'STATUS_UPDATE': { status: 'ready' | 'inspecting' | 'error'; message?: string };
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

