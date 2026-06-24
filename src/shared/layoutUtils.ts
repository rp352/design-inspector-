import type { LayoutExtractionData } from './types';

/**
 * Extracts and compiles layout settings, box model properties, and flex/grid options from an element.
 */
export function extractElementLayout(el: HTMLElement): LayoutExtractionData {
  const computed = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  
  // Format content width and height (absolute dimensions in pixels)
  const widthVal = `${Math.round(rect.width)}px`;
  const heightVal = `${Math.round(rect.height)}px`;
  
  const boxModel = {
    margin: {
      top: computed.marginTop || '0px',
      right: computed.marginRight || '0px',
      bottom: computed.marginBottom || '0px',
      left: computed.marginLeft || '0px'
    },
    border: {
      top: computed.borderTopWidth || '0px',
      right: computed.borderRightWidth || '0px',
      bottom: computed.borderBottomWidth || '0px',
      left: computed.borderLeftWidth || '0px'
    },
    padding: {
      top: computed.paddingTop || '0px',
      right: computed.paddingRight || '0px',
      bottom: computed.paddingBottom || '0px',
      left: computed.paddingLeft || '0px'
    },
    width: widthVal,
    height: heightVal
  };
  
  const offsets = {
    top: computed.top || 'auto',
    right: computed.right || 'auto',
    bottom: computed.bottom || 'auto',
    left: computed.left || 'auto'
  };
  
  // Parse gaps for flex or grid layouts
  let gapVal = computed.gap;
  if (!gapVal || gapVal === 'normal') {
    const rowGap = computed.rowGap;
    const colGap = computed.columnGap;
    if (rowGap && colGap && rowGap !== 'normal' && colGap !== 'normal') {
      gapVal = rowGap === colGap ? rowGap : `${rowGap} ${colGap}`;
    }
  }
  
  const flexGrid = {
    flexDirection: computed.flexDirection,
    flexWrap: computed.flexWrap,
    justifyContent: computed.justifyContent,
    alignItems: computed.alignItems,
    flexGrow: computed.flexGrow,
    flexShrink: computed.flexShrink,
    flexBasis: computed.flexBasis,
    gridTemplateColumns: computed.gridTemplateColumns,
    gridTemplateRows: computed.gridTemplateRows,
    gridAutoFlow: computed.gridAutoFlow,
    gap: gapVal
  };
  
  return {
    display: computed.display || 'block',
    position: computed.position || 'static',
    boxModel,
    offsets,
    flexGrid
  };
}
