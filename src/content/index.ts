import { listenForMessages, createMessage, sendMessageToBackground } from '../shared/messaging';
import { extractElementColors } from '../shared/colorUtils';
import { extractElementLayout } from '../shared/layoutUtils';
import type { TypographyData } from '../shared/types';

console.log('[Design Inspector] Content script loaded on page:', window.location.href);

// Announce presence to the background/side panel
sendMessageToBackground(
  'STATUS_UPDATE',
  { status: 'ready', message: `Content Script loaded on: ${window.location.hostname}` },
  'content'
).catch((err) => {
  console.debug('[Design Inspector] Background connection not established yet:', err.message);
});

let inspectModeEnabled = false;
let isSelectionFrozen = false;
let currentElement: HTMLElement | null = null;
let overlayContainer: HTMLDivElement | null = null;
let tooltipBadge: HTMLDivElement | null = null;

/**
 * Extracts and maps standard CSS styles from an element for Design Inspector cards.
 */
function getElementStyles(el: HTMLElement): Record<string, string> {
  const computed = window.getComputedStyle(el);
  
  // Safely construct padding/margin values since shorthand computed values can return empty strings
  const paddingVal = `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`;
  const marginVal = `${computed.marginTop} ${computed.marginRight} ${computed.marginBottom} ${computed.marginLeft}`;

  return {
    // Typography
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    lineHeight: computed.lineHeight,
    
    // Colors
    color: computed.color,
    backgroundColor: computed.backgroundColor,
    borderColor: computed.borderColor,
    
    // Layout
    display: computed.display,
    padding: paddingVal,
    margin: marginVal,
    
    // Effects
    opacity: computed.opacity,
    borderRadius: computed.borderRadius,
    boxShadow: computed.boxShadow,
    transition: computed.transition
  };
}

/**
 * Extracts typography attributes from an element.
 */
function extractTypography(el: HTMLElement): TypographyData {
  const computed = window.getComputedStyle(el);
  return {
    fontFamily: computed.fontFamily || 'none',
    fontSize: computed.fontSize || 'none',
    fontWeight: computed.fontWeight || 'none',
    lineHeight: computed.lineHeight || 'none',
    letterSpacing: computed.letterSpacing || 'none',
    color: computed.color || 'none'
  };
}

/**
 * Positions the highlight overlay and updates the tooltip text.
 */
function updateOverlay(el: HTMLElement) {
  if (!overlayContainer || !tooltipBadge) return;
  
  const rect = el.getBoundingClientRect();
  
  // Align highlight border box with hovered/selected element
  overlayContainer.style.width = `${rect.width}px`;
  overlayContainer.style.height = `${rect.height}px`;
  overlayContainer.style.left = `${rect.left}px`;
  overlayContainer.style.top = `${rect.top}px`;
  overlayContainer.style.display = 'block';

  // Construct label contents (tagname, ID, class, dimensions)
  const tagName = el.tagName.toLowerCase();
  const idText = el.id ? `#${el.id}` : '';
  const classText = el.className && typeof el.className === 'string' 
    ? `.${el.className.trim().split(/\s+/).join('.')}` 
    : '';
  
  // Truncate classes if they are extremely long
  const classesTruncated = classText.length > 20 ? `${classText.substring(0, 20)}...` : classText;
  const widthRound = Math.round(rect.width);
  const heightRound = Math.round(rect.height);

  // Prefix a "LOCKED" indicator on tooltip if selection is frozen
  const statusLabel = isSelectionFrozen 
    ? `<span style="color: #a855f7; font-weight: 800; border: 1px solid #a855f7; border-radius: 2px; padding: 0px 4px; margin-right: 5px; font-size: 8px; vertical-align: middle;">LOCKED</span>`
    : '';

  tooltipBadge.innerHTML = `
    ${statusLabel}
    <span style="color: #f43f5e; font-weight: 700;">${tagName}</span>
    <span style="color: #60a5fa;">${idText}${classesTruncated}</span>
    <span style="color: #71717a;"> | </span>
    <span style="color: #fafafa; font-weight: 600;">${widthRound} × ${heightRound}px</span>
  `;

  // Position tooltip above element, or flip it below if element is at the very top of viewport
  if (rect.top < 35) {
    tooltipBadge.style.top = '100%';
    tooltipBadge.style.transform = 'translateY(4px)';
  } else {
    tooltipBadge.style.top = '0px';
    tooltipBadge.style.transform = 'translateY(-100%) translateY(-4px)';
  }
}

/**
 * Handles mouseover target changes on the page.
 */
function handleMouseMove(e: MouseEvent) {
  // If inspect mode is off or selection is locked/frozen, ignore mouse movements
  if (!inspectModeEnabled || isSelectionFrozen) return;
  
  const target = e.target as HTMLElement;
  if (!target) return;
  
  // Skip HTML and BODY containers to avoid full-page visual clutter
  if (target.tagName === 'HTML' || target.tagName === 'BODY') {
    hideOverlay();
    return;
  }
  
  // Ignore hovering over the inspector overlay container itself
  if (overlayContainer && (target === overlayContainer || overlayContainer.contains(target))) {
    return;
  }

  // Optimize: skip redundant updates if moving inside the same element
  if (target === currentElement) {
    return;
  }

  currentElement = target;
  updateOverlay(target);

  // Extract element style parameters
  const rect = target.getBoundingClientRect();
  const styles = getElementStyles(target);
  const typography = extractTypography(target);
  const colors = extractElementColors(target);
  const layout = extractElementLayout(target);
  
  const tagName = target.tagName.toLowerCase();
  const idText = target.id ? `#${target.id}` : '';
  const classText = target.className && typeof target.className === 'string'
    ? `.${target.className.trim().split(/\s+/).filter(Boolean).join('.')}`
    : '';

  // Broadcast hover telemetry data to background (which routes it to side panel)
  sendMessageToBackground(
    'ELEMENT_HOVERED',
    {
      tagName,
      className: classText,
      id: idText,
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      styles,
      typography,
      colors,
      layout
    },
    'content'
  ).catch((err) => {
    console.debug('[Design Inspector] Error routing element details:', err.message);
  });
}

/**
 * Intercepts document click events (capture phase) to lock selections.
 */
function handleMouseClick(e: MouseEvent) {
  if (!inspectModeEnabled || isSelectionFrozen) return;

  const target = e.target as HTMLElement;
  if (!target) return;

  // Do not intercept clicks on html/body or inside our overlay
  if (target.tagName === 'HTML' || target.tagName === 'BODY') return;
  if (overlayContainer && (target === overlayContainer || overlayContainer.contains(target))) {
    return;
  }

  // Freeze target and block click trigger propagation
  e.preventDefault();
  e.stopPropagation();
  
  isSelectionFrozen = true;
  currentElement = target;

  // Change overlay border/glow to purple to represent locked selection state
  if (overlayContainer) {
    overlayContainer.style.border = '2px solid #a855f7'; // Purple highlight
    overlayContainer.style.backgroundColor = 'rgba(168, 85, 247, 0.15)';
    overlayContainer.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.2) inset, 0 0 8px rgba(168, 85, 247, 0.4)';
  }

  updateOverlay(target);

  // Extract element telemetry including text content previews
  const rect = target.getBoundingClientRect();
  const styles = getElementStyles(target);
  const typography = extractTypography(target);
  const colors = extractElementColors(target);
  const layout = extractElementLayout(target);
  const textContent = target.textContent ? target.textContent.trim().substring(0, 150) : '';

  const tagName = target.tagName.toLowerCase();
  const idText = target.id ? `#${target.id}` : '';
  const classText = target.className && typeof target.className === 'string'
    ? `.${target.className.trim().split(/\s+/).filter(Boolean).join('.')}`
    : '';

  // Send selected element info to background worker (relays to sidepanel)
  sendMessageToBackground(
    'ELEMENT_SELECTED',
    {
      tagName,
      className: classText,
      id: idText,
      textContent,
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      styles,
      typography,
      colors,
      layout
    },
    'content'
  ).catch((err) => {
    console.debug('[Design Inspector] Error routing selection details:', err.message);
  });
}

function hideOverlay() {
  if (overlayContainer) {
    overlayContainer.style.display = 'none';
  }
  currentElement = null;
}

/**
 * Keeps overlay box aligned during scrolls or viewport resizes.
 */
function handleScrollResize() {
  if (inspectModeEnabled && currentElement) {
    updateOverlay(currentElement);
  }
}

/**
 * Dynamically builds the overlay frame and attaches event hooks.
 */
function initInspector() {
  if (overlayContainer) return;

  // Render high-priority container overlay
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'design-inspector-overlay';
  Object.assign(overlayContainer.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    border: '1.5px solid #3b82f6', // Chrome DevTools Blue
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    boxSizing: 'border-box',
    display: 'none',
    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1) inset',
    transition: 'width 0.04s linear, height 0.04s linear, left 0.04s linear, top 0.04s linear'
  });

  // Render tooltips badge
  tooltipBadge = document.createElement('div');
  tooltipBadge.id = 'design-inspector-tooltip';
  Object.assign(tooltipBadge.style, {
    position: 'absolute',
    left: '0px',
    backgroundColor: '#09090b',
    border: '1px solid #27272a',
    color: '#a1a1aa',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    fontSize: '9px',
    padding: '3px 6px',
    borderRadius: '4px',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.5), 0 2px 4px -2px rgba(0,0,0,0.5)',
    lineHeight: '1',
    letterSpacing: '0.02em'
  });

  overlayContainer.appendChild(tooltipBadge);
  document.documentElement.appendChild(overlayContainer);

  // Bind mouse, click, scroll, resize event listeners (capture phase: true)
  document.addEventListener('mouseover', handleMouseMove, true);
  document.addEventListener('click', handleMouseClick, true);
  window.addEventListener('scroll', handleScrollResize, true);
  window.addEventListener('resize', handleScrollResize, true);
}

/**
 * Unbinds events and completely removes overlay elements from DOM.
 */
function destroyInspector() {
  document.removeEventListener('mouseover', handleMouseMove, true);
  document.removeEventListener('click', handleMouseClick, true);
  window.removeEventListener('scroll', handleScrollResize, true);
  window.removeEventListener('resize', handleScrollResize, true);

  if (overlayContainer && overlayContainer.parentNode) {
    overlayContainer.parentNode.removeChild(overlayContainer);
  }
  
  overlayContainer = null;
  tooltipBadge = null;
  currentElement = null;
  isSelectionFrozen = false;
}

// Listen to inspect commands
listenForMessages((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    const pongResponse = createMessage(
      'PONG',
      {
        text: `Pong from Content Script on ${window.location.hostname}!`,
        sender: `Content Script (${window.location.host})`
      },
      'content'
    );
    sendResponse(pongResponse);
    return false;
  }

  if (message.type === 'TOGGLE_INSPECT') {
    inspectModeEnabled = message.payload.enabled;
    
    if (inspectModeEnabled) {
      initInspector();
    } else {
      destroyInspector();
    }

    sendResponse({ success: true, inspectModeEnabled });
    return false;
  }

  if (message.type === 'RESET_SELECTION') {
    if (inspectModeEnabled && isSelectionFrozen) {
      isSelectionFrozen = false;
      
      // Revert overlay styles back to hover states (blue borders)
      if (overlayContainer) {
        overlayContainer.style.border = '1.5px solid #3b82f6';
        overlayContainer.style.backgroundColor = 'rgba(59, 130, 246, 0.12)';
        overlayContainer.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.1) inset';
      }

      if (currentElement) {
        updateOverlay(currentElement);
      } else {
        hideOverlay();
      }
    }
    sendResponse({ success: true, isSelectionFrozen });
    return false;
  }

  return false;
});
