import React, { useState, useEffect } from 'react';
import { identifyFont } from '../shared/fontUtils';
import { listenForMessages, sendMessageToBackground, sendMessageToTab } from '../shared/messaging';
import type { TabInfo, ElementHoverInfo, ElementSelectInfo, ParsedShadow } from '../shared/types';
import { moduleRegistryInstance } from './registry';
import { inspectorEngineInstance } from './engine';
import type { InspectorContext } from './modules';
import './modules';

interface DevLogEntry {
  id: string;
  time: string;
  direction: 'in' | 'out' | 'system';
  type: string;
  message: string;
}

const isDisallowedUrl = (url?: string): boolean => {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.startsWith('chrome://') ||
    lowerUrl.startsWith('chrome-extension://') ||
    lowerUrl.startsWith('chrome-search://') ||
    lowerUrl.startsWith('about:') ||
    lowerUrl.startsWith('edge://') ||
    lowerUrl.startsWith('view-source:') ||
    lowerUrl.includes('chrome.google.com/webstore') ||
    lowerUrl.includes('chromewebstore.google.com')
  );
};

export const SidePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabInfo | null>(null);
  const [inspectEnabled, setInspectEnabled] = useState(false);
  const [status, setStatus] = useState<'ready' | 'inspecting' | 'error'>('ready');
  const [statusText, setStatusText] = useState('Panel initialized.');
  const [devLogs, setDevLogs] = useState<DevLogEntry[]>([]);
  const [hoveredElement, setHoveredElement] = useState<ElementHoverInfo | null>(null);
  const [selectedElement, setSelectedElement] = useState<ElementSelectInfo | null>(null);
  const [detectedStack, setDetectedStack] = useState<string[]>(['MV3']);
  const [showSvgMarkup, setShowSvgMarkup] = useState(false);
  const [tokenSystem, setTokenSystem] = useState<'semantic' | 'tailwind' | 'material'>('semantic');
  const [spacingHistory, setSpacingHistory] = useState<number[]>([]);
  const [radiusHistory, setRadiusHistory] = useState<string[]>([]);
  const [inspectedElements, setInspectedElements] = useState<ElementSelectInfo[]>([]);
  const [card17Tab, setCard17Tab] = useState<'summary' | 'export'>('summary');

  // Add dev log entries for messaging verification
  const addDevLog = (direction: 'in' | 'out' | 'system', type: string, message: string) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    const newEntry: DevLogEntry = {
      id: Math.random().toString(36).substring(2, 11),
      time: timeStr,
      direction,
      type,
      message
    };
    setDevLogs((prev) => [...prev, newEntry]);
  };

  const syncTabState = (tabId: number, url: string) => {
    if (isDisallowedUrl(url)) {
      setStatus('ready');
      setStatusText('Inspector disabled on Chrome system pages.');
      setDetectedStack(['MV3']);
      setInspectEnabled(false);
      setHoveredElement(null);
      setSelectedElement(null);
      return;
    }

    // Request current tech stack from the page content script
    sendMessageToTab(tabId, 'DETECT_STACK', undefined, 'sidepanel')
      .then((res: any) => {
        if (res && res.stack) {
          setDetectedStack(res.stack);
          addDevLog('system', 'STACK', `Detected stack: ${res.stack.join(', ')}`);
        }
      })
      .catch(() => {
        // Ignore if content script is not injected yet
      });

    // Request current inspector state from the page content script to synchronize UI
    sendMessageToTab(tabId, 'GET_INSPECTOR_STATE', undefined, 'sidepanel')
      .then((res: any) => {
        if (res) {
          setInspectEnabled(res.inspectModeEnabled);
          setStatus(res.inspectModeEnabled ? 'inspecting' : 'ready');
          setStatusText(res.inspectModeEnabled ? 'Inspect mode active. Hover over elements.' : 'Inspector connected.');
          
          if (res.selectedElement) {
            setSelectedElement(res.selectedElement);
            
            // Also append spacing/radius history from the restored element if applicable
            const items = res.selectedElement.spacingIntelligence?.spacingItems || [];
            if (items.length > 0) {
              const newVals = items.map((it: any) => it.valuePx);
              setSpacingHistory((prev) => [...prev, ...newVals]);
            }
            const bri = res.selectedElement.borderRadiusIntelligence;
            if (bri) {
              const newRads = [bri.raw.topLeft, bri.raw.topRight, bri.raw.bottomRight, bri.raw.bottomLeft].filter(r => r !== '0px' && r !== '0');
              setRadiusHistory((prev) => [...prev, ...newRads]);
            }
            
            // Add to inspected elements pool
            setInspectedElements((prev) => {
              const isDuplicate = prev.some(
                (el) =>
                  el.tagName === res.selectedElement.tagName &&
                  el.id === res.selectedElement.id &&
                  el.className === res.selectedElement.className &&
                  el.rect.x === res.selectedElement.rect.x &&
                  el.rect.y === res.selectedElement.rect.y
              );
              if (isDuplicate) return prev;
              return [...prev, res.selectedElement];
            });
          } else {
            setSelectedElement(null);
          }
          
          addDevLog('system', 'SYNC', `Synchronized state: inspectEnabled=${res.inspectModeEnabled}, locked=${res.isSelectionFrozen}`);
        }
      })
      .catch(() => {
        // Ignore if content script is not injected yet
      });
  };

  // On mount: fetch active tab info & start extension message listener
  useEffect(() => {
    addDevLog('system', 'INIT', 'Side panel active.');

    // Fetch tab info
    sendMessageToBackground('GET_TAB_INFO', undefined, 'sidepanel')
      .then((tabInfo: any) => {
        if (tabInfo && !tabInfo.error) {
          setActiveTab(tabInfo);
          addDevLog('system', 'TAB_INFO', `Target attached: "${tabInfo.title}"`);
          syncTabState(tabInfo.tabId, tabInfo.url);
        }
      })
      .catch((err) => {
        setStatus('error');
        setStatusText(`Attachment failed: ${err.message}`);
        addDevLog('system', 'ERROR', `Failed to attach tab: ${err.message}`);
      });

    // Listen for incoming messages
    const unsubscribe = listenForMessages((message, _sender, sendResponse) => {
      // Print packets to log console (suppress telemetry to avoid spam)
      if (message.type !== 'ELEMENT_HOVERED' && message.type !== 'ELEMENT_SELECTED') {
        addDevLog('in', message.type, `From ${message.source}: ${JSON.stringify(message.payload)}`);
      }

      if (message.type === 'TAB_CHANGED') {
        const tabInfo = message.payload;
        setActiveTab(tabInfo);
        setInspectEnabled(false);
        setHoveredElement(null);
        setSelectedElement(null);
        setShowSvgMarkup(false);
        setInspectedElements([]);
        setDetectedStack(['MV3']);
        addDevLog('system', 'TAB_NAV', `Switched page: "${tabInfo.title}"`);
        
        syncTabState(tabInfo.tabId, tabInfo.url);
        
        sendResponse({ ack: true });
        return false;
      }

      if (message.type === 'STATUS_UPDATE') {
        const { status: newStatus, message: statusMsg, detectedStack: newStack } = message.payload;
        setStatus(newStatus);
        if (statusMsg) {
          setStatusText(statusMsg);
        }
        if (newStack) {
          setDetectedStack(newStack);
        }
        sendResponse({ ack: true });
        return false;
      }

      if (message.type === 'ELEMENT_HOVERED') {
        setHoveredElement(message.payload);
        const items = message.payload.spacingIntelligence?.spacingItems || [];
        if (items.length > 0) {
          const newVals = items.map((it: any) => it.valuePx);
          setSpacingHistory((prev) => [...prev, ...newVals]);
        }
        const bri = message.payload.borderRadiusIntelligence;
        if (bri) {
          const newRads = [bri.raw.topLeft, bri.raw.topRight, bri.raw.bottomRight, bri.raw.bottomLeft].filter(r => r !== '0px' && r !== '0');
          setRadiusHistory((prev) => [...prev, ...newRads]);
        }
        sendResponse({ ack: true });
        return false;
      }

      if (message.type === 'ELEMENT_SELECTED') {
        setSelectedElement(message.payload);
        const items = message.payload.spacingIntelligence?.spacingItems || [];
        if (items.length > 0) {
          const newVals = items.map((it: any) => it.valuePx);
          setSpacingHistory((prev) => [...prev, ...newVals]);
        }
        const bri = message.payload.borderRadiusIntelligence;
        if (bri) {
          const newRads = [bri.raw.topLeft, bri.raw.topRight, bri.raw.bottomRight, bri.raw.bottomLeft].filter(r => r !== '0px' && r !== '0');
          setRadiusHistory((prev) => [...prev, ...newRads]);
        }
        setInspectedElements((prev) => {
          const isDuplicate = prev.some(
            (el) =>
              el.tagName === message.payload.tagName &&
              el.id === message.payload.id &&
              el.className === message.payload.className &&
              el.rect.x === message.payload.rect.x &&
              el.rect.y === message.payload.rect.y
          );
          if (isDuplicate) return prev;
          return [...prev, message.payload];
        });
        addDevLog('in', 'SELECT', `Element selected: ${message.payload.tagName}${message.payload.id}`);
        sendResponse({ ack: true });
        return false;
      }

      return false;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggleInspect = async () => {
    if (!activeTab) return;
    const nextState = !inspectEnabled;
    addDevLog('out', 'TOGGLE_INSPECT', `Requesting inspect mode: ${nextState ? 'ON' : 'OFF'}`);

    try {
      const response = await sendMessageToBackground(
        'TOGGLE_INSPECT',
        { enabled: nextState },
        'sidepanel'
      );

      if (response && response.success) {
        setInspectEnabled(nextState);
        setStatus(nextState ? 'inspecting' : 'ready');
        setStatusText(nextState ? 'Inspect mode active. Hover over elements.' : 'Inspect mode stopped.');
        addDevLog('system', 'INSPECT', `Inspect mode updated: ${nextState ? 'ENABLED' : 'DISABLED'}`);
        if (!nextState) {
          setHoveredElement(null);
          setSelectedElement(null);
          setShowSvgMarkup(false);
        }
      } else if (response && response.error) {
        setStatus('error');
        const isConnectionError = response.error.includes('Could not establish connection');
        const errorMsg = isConnectionError 
          ? 'Cannot connect to webpage. Please refresh the page tab and try again.' 
          : `Failed: ${response.error}`;
        setStatusText(errorMsg);
        addDevLog('system', 'ERROR', `Failed toggling inspect: ${response.error}`);
      }
    } catch (err: any) {
      setStatus('error');
      setStatusText(`Error: ${err.message}`);
      addDevLog('system', 'ERROR', `Failed toggling inspect: ${err.message}`);
    }
  };

  const handleResetSelection = async () => {
    addDevLog('out', 'RESET_SELECTION', 'Sending unfreeze select request...');
    try {
      const response = await sendMessageToBackground('RESET_SELECTION', undefined, 'sidepanel');
      if (response && response.success) {
        setSelectedElement(null);
        setShowSvgMarkup(false);
        addDevLog('system', 'RESET', 'Selection un-frozen. Resumed hover inspector.');
      } else if (response && response.error) {
        setStatus('error');
        setStatusText(`Reset failed: ${response.error}`);
        addDevLog('system', 'ERROR', `Failed to reset selection: ${response.error}`);
      }
    } catch (err: any) {
      setStatus('error');
      setStatusText(`Reset error: ${err.message}`);
      addDevLog('system', 'ERROR', `Failed to reset selection: ${err.message}`);
    }
  };

  const handlePingWorker = async () => {
    addDevLog('out', 'PING', 'Sending packet to Service Worker...');
    try {
      const response = await sendMessageToBackground('PING', { text: 'Manual Ping from UI' }, 'sidepanel');
      if (response && response.type === 'PONG') {
        addDevLog('in', 'PONG', response.payload.text);
      }
    } catch (err: any) {
      addDevLog('system', 'ERROR', `Worker unreachable: ${err.message}`);
    }
  };

  const handlePingContent = async () => {
    if (!activeTab) return;
    addDevLog('out', 'PING', 'Sending packet to Content Script...');
    try {
      const response = await sendMessageToTab(activeTab.tabId, 'PING', { text: 'Manual Ping from UI' }, 'sidepanel');
      if (response && response.type === 'PONG') {
        addDevLog('in', 'PONG', response.payload.text);
      }
    } catch (err: any) {
      addDevLog('system', 'ERROR', `Content Script unreachable: ${err.message}`);
    }
  };

  // Determine element values to render (selection takes priority over hover)
  const activeElement = selectedElement || hoveredElement;

  // Design System Analyzer statistical inference helpers
  const hexToHsl = (hex: string) => {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  };

  const inferSemanticName = (hex: string, role: string) => {
    const upperHex = hex.toUpperCase().trim();
    if (upperHex === '#2563EB') return 'Primary';
    if (upperHex === '#DC2626') return 'Danger';
    if (upperHex === '#16A34A') return 'Success';
    if (upperHex === '#F8FAFC') return 'Surface';
    if (upperHex === '#0F172A') return 'Text Primary';

    const { h, s, l } = hexToHsl(hex);

    if (role === 'Text') {
      if (l < 25) return 'Text Primary';
      if (l > 75) return 'Text Inverse';
      return 'Text Secondary';
    }
    if (role === 'Background') {
      if (l > 93) return 'Surface';
      if (l < 15) return 'Surface (Dark)';
      if (h >= 195 && h <= 245 && s > 40) return 'Primary/Bg';
      return 'Surface/Muted';
    }
    
    if (h >= 190 && h <= 250 && s > 30) {
      return 'Primary';
    }
    if ((h >= 345 || h <= 15) && s > 30) {
      return 'Danger';
    }
    if (h >= 80 && h <= 145 && s > 30) {
      return 'Success';
    }
    if (h >= 16 && h <= 60 && s > 30) {
      return 'Warning';
    }
    
    return role;
  };

  const parseColorToRgb = (colorStr: string) => {
    if (!colorStr) return null;
    const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3])
      };
    }
    let hex = colorStr.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
      };
    }
    return null;
  };

  const getLuminance = (r: number, g: number, b: number) => {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  };

  const calculateContrastRatio = (fg: string, bg: string) => {
    const rgb1 = parseColorToRgb(fg);
    const rgb2 = parseColorToRgb(bg);
    if (!rgb1 || !rgb2) return 1;
    const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const brightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    return (brightest + 0.05) / (darkest + 0.05);
  };

  const getPrimaryFont = () => {
    if (inspectedElements.length === 0) return { fontName: '—', source: '—', isGoogleFont: false };
    const counts: Record<string, number> = {};
    const fontDetails: Record<string, string> = {};
    
    inspectedElements.forEach((el) => {
      const rawFam = el.typography?.fontFamily;
      if (rawFam) {
        const { fontName, source } = identifyFont(rawFam);
        counts[fontName] = (counts[fontName] || 0) + 1;
        fontDetails[fontName] = source;
      }
    });

    let maxFont = '—';
    let maxCount = 0;
    for (const font in counts) {
      if (counts[font] > maxCount) {
        maxCount = counts[font];
        maxFont = font;
      }
    }

    return {
      fontName: maxFont,
      source: fontDetails[maxFont] || '—',
      isGoogleFont: fontDetails[maxFont] === 'Google Fonts'
    };
  };

  const getTopColors = () => {
    if (inspectedElements.length === 0) return [];
    const colorCounts: Record<string, { count: number; roles: Record<string, number>; rgb: string }> = {};

    inspectedElements.forEach((el) => {
      const cols = el.colors;
      if (!cols) return;

      const addColor = (info: any, role: string) => {
        if (info && !info.isTransparent && info.hex && info.hex !== 'transparent') {
          const hex = info.hex.toUpperCase();
          if (!colorCounts[hex]) {
            colorCounts[hex] = { count: 0, roles: {}, rgb: info.rgb };
          }
          colorCounts[hex].count++;
          colorCounts[hex].roles[role] = (colorCounts[hex].roles[role] || 0) + 1;
        }
      };

      addColor(cols.background, 'Background');
      addColor(cols.text, 'Text');
      addColor(cols.border, 'Border');
      if (cols.shadows && Array.isArray(cols.shadows)) {
        cols.shadows.forEach((sh) => addColor(sh, 'Shadow'));
      }
    });

    const sortedColors = Object.entries(colorCounts)
      .map(([hex, data]) => {
        let topRole = 'Unknown';
        let maxRoleCount = 0;
        Object.entries(data.roles).forEach(([role, count]) => {
          if (count > maxRoleCount) {
            maxRoleCount = count;
            topRole = role;
          }
        });

        const token = inferSemanticName(hex, topRole);
        return {
          hex,
          rgb: data.rgb,
          count: data.count,
          role: topRole,
          token
        };
      })
      .sort((a, b) => b.count - a.count);

    const top5 = sortedColors.slice(0, 5);

    const primaryBg = top5.find(c => c.role === 'Background')?.rgb || '#FFFFFF';
    const primaryText = top5.find(c => c.role === 'Text')?.rgb || '#09090B';

    return top5.map((c) => {
      let contrast = '—';
      let compliance = 'N/A';

      if (c.role === 'Text') {
        const ratio = calculateContrastRatio(c.rgb, primaryBg);
        contrast = ratio.toFixed(1);
        compliance = ratio >= 7.0 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'Fail';
      } else if (c.role === 'Background') {
        const ratio = calculateContrastRatio(primaryText, c.rgb);
        contrast = ratio.toFixed(1);
        compliance = ratio >= 7.0 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'Fail';
      } else {
        const ratio = calculateContrastRatio(c.rgb, primaryBg);
        contrast = ratio.toFixed(1);
        compliance = ratio >= 3.0 ? 'Pass' : 'Low';
      }

      return {
        ...c,
        contrast,
        compliance
      };
    });
  };

  const getSpacingTokenName = (px: number) => {
    if (px % 4 === 0) {
      return `Space ${px / 4}`;
    }
    return `Space ${(px / 4).toFixed(1)}`;
  };

  const getTopSpacing = () => {
    const allSpacingItems = inspectedElements.flatMap(el => el.spacingIntelligence?.spacingItems || []);
    const allSpacingValues = allSpacingItems.map(item => item.valuePx).filter(v => v > 0);

    if (allSpacingValues.length === 0) return { scale: [], consistency: 100, is8ptGrid: '—', compliance8pt: 0 };

    const counts: Record<number, number> = {};
    allSpacingValues.forEach((val) => {
      counts[val] = (counts[val] || 0) + 1;
    });

    const sortedSpacing = Object.entries(counts)
      .map(([valStr, count]) => {
        const val = parseInt(valStr);
        return {
          valuePx: val,
          count,
          tokenName: getSpacingTokenName(val)
        };
      })
      .sort((a, b) => b.count - a.count);

    const scale = sortedSpacing.slice(0, 5);
    const topValues = scale.map(s => s.valuePx);

    const consistentCount = allSpacingValues.filter(v => topValues.includes(v)).length;
    const consistency = Math.round((consistentCount / allSpacingValues.length) * 100);

    const divisibleBy8Count = allSpacingValues.filter(v => v % 8 === 0).length;
    const compliance8pt = Math.round((divisibleBy8Count / allSpacingValues.length) * 100);

    let is8ptGrid = 'Custom';
    if (compliance8pt >= 90) is8ptGrid = 'Strict';
    else if (compliance8pt >= 60) is8ptGrid = 'Mostly';

    return {
      scale,
      consistency,
      is8ptGrid,
      compliance8pt
    };
  };

  const getRadiusTokenName = (valStr: string) => {
    const px = parseFloat(valStr);
    if (isNaN(px) || px <= 0) return 'Sharp';
    if (valStr.includes('%') || px >= 9999) return 'Circle';
    if (px <= 3) return 'Small';
    if (px <= 6) return 'Medium';
    if (px <= 12) return 'Large';
    if (px <= 32) return 'Pill';
    return 'Circle';
  };

  const getTopRadii = () => {
    const allRadii = inspectedElements.flatMap(el => {
      const bri = el.borderRadiusIntelligence;
      return bri ? [bri.raw.topLeft, bri.raw.topRight, bri.raw.bottomRight, bri.raw.bottomLeft] : [];
    }).filter(r => r !== '0px' && r !== '0' && r !== '');

    if (allRadii.length === 0) return { scale: [], consistency: 100 };

    const counts: Record<string, number> = {};
    allRadii.forEach((val) => {
      counts[val] = (counts[val] || 0) + 1;
    });

    const sortedRadii = Object.entries(counts)
      .map(([val, count]) => {
        return {
          value: val,
          count,
          tokenName: getRadiusTokenName(val)
        };
      })
      .sort((a, b) => b.count - a.count);

    const scale = sortedRadii.slice(0, 5);
    const topValues = scale.map(s => s.value);

    const consistentCount = allRadii.filter(r => topValues.includes(r)).length;
    const consistency = Math.round((consistentCount / allRadii.length) * 100);

    return {
      scale,
      consistency
    };
  };

  const getTopShadows = () => {
    const allShadows = inspectedElements.flatMap(el => [
      ...(el.effects?.boxShadows || []),
      ...(el.effects?.dropShadows || [])
    ]);

    if (allShadows.length === 0) return { scale: [], consistency: 100, avgElevation: '0.0', glassCount: 0 };

    const counts: Record<string, { count: number; shadow: ParsedShadow }> = {};
    allShadows.forEach((sh) => {
      if (!counts[sh.raw]) {
        counts[sh.raw] = { count: 0, shadow: sh };
      }
      counts[sh.raw].count++;
    });

    const sortedShadows = Object.values(counts)
      .sort((a, b) => b.count - a.count);

    const scale = sortedShadows.slice(0, 3).map((item) => {
      const sh = item.shadow;
      const blur = parseFloat(sh.blurRadius) || 0;
      
      let classification = 'Medium';
      if (sh.inset) classification = 'Inset';
      else if (blur <= 2) classification = 'Sharp';
      else if (blur <= 6) classification = 'Small';
      else if (blur > 16) classification = 'Large';

      return {
        raw: sh.raw,
        count: item.count,
        classification,
        shadow: sh
      };
    });

    const topRawValues = scale.map(s => s.raw);
    const consistentCount = allShadows.filter(s => topRawValues.includes(s.raw)).length;
    const consistency = Math.round((consistentCount / allShadows.length) * 100);

    const elementsWithShadowIntelligence = inspectedElements.filter(el => el.shadowIntelligence);
    const totalElevation = elementsWithShadowIntelligence.reduce((sum, el) => sum + (el.shadowIntelligence?.elevationLevel || 0), 0);
    const avgElevation = elementsWithShadowIntelligence.length > 0 ? (totalElevation / elementsWithShadowIntelligence.length).toFixed(1) : '0.0';

    const glassCount = inspectedElements.filter(el => el.shadowIntelligence?.hasGlassEffect).length;

    return {
      scale,
      consistency,
      avgElevation,
      glassCount
    };
  };

  const downloadTokenFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addDevLog('system', 'DOWNLOAD_TOKENS', `Downloaded ${filename}`);
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-[#fafafa] font-sans antialiased select-none">
      {/* Vercel/Linear Style Header */}
      <header className="h-[48px] border-b border-[#1f1f23] bg-[#09090b] px-4 flex items-center justify-between shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-2">
          {/* Vercel Triangle Logo */}
          <svg width="12" height="12" viewBox="0 0 116 100" fill="currentColor" className="text-white">
            <path d="M57.5 0L115 100H0L57.5 0Z" />
          </svg>
          <span className="text-xs font-mono font-bold tracking-widest uppercase text-white">
            Design Inspector
          </span>
        </div>

        {/* Toggle Inspector Switch */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase">
            {inspectEnabled ? 'Inspecting' : 'Inspect'}
          </span>
          <button
            onClick={handleToggleInspect}
            disabled={!activeTab || isDisallowedUrl(activeTab.url)}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none border shrink-0 ${
              !activeTab || isDisallowedUrl(activeTab.url) ? 'opacity-40 cursor-not-allowed border-zinc-800' : 'cursor-pointer'
            } ${
              inspectEnabled ? 'bg-white border-white' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full transform transition-transform duration-200 ${
                inspectEnabled ? 'translate-x-4 bg-black' : 'translate-x-0 bg-zinc-500'
              }`}
            />
          </button>
        </div>
      </header>

      {/* Sidebar Content Body */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Tab Card */}
        <div className="border border-[#1f1f23] bg-[#0c0c0e] rounded-lg p-3 shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[8px] font-mono font-bold tracking-widest text-zinc-500 uppercase">
              Target Environment
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                selectedElement ? 'bg-[#a855f7]' : status === 'inspecting' ? 'bg-[#00f0ff] pulse-dot' : status === 'error' ? 'bg-rose-500' : 'bg-emerald-500'
              }`} />
              <span className="text-[9px] font-mono font-semibold tracking-wider text-zinc-400 uppercase">
                {selectedElement ? 'locked' : status}
              </span>
            </div>
          </div>
          <div className="overflow-hidden">
            <h4 className="text-[11px] font-bold text-zinc-200 truncate">
              {activeTab ? activeTab.title : 'No connection'}
            </h4>
            <p className="text-[9px] font-mono text-zinc-500 truncate mt-0.5">
              {activeTab ? activeTab.url : 'Awaiting host website attachment...'}
            </p>
            {activeElement && (
              <div className="mt-2.5 pt-2 border-t border-[#1f1f23] flex items-center gap-1.5 overflow-hidden">
                <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest shrink-0">Selector:</span>
                <span className="text-[9px] font-mono text-[#00f0ff] truncate font-semibold">
                  {activeElement.tagName}
                  <span className="text-amber-400">{activeElement.id}</span>
                  <span className="text-zinc-400">{activeElement.className}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Selection Locked Banner */}
        {selectedElement && (
          <div className="border border-purple-900/40 bg-purple-950/20 rounded-lg p-3 flex items-center justify-between shadow-[0_1.5px_3px_rgba(0,0,0,0.5)] transition-all duration-300">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-pulse" />
              <span className="text-[10px] font-mono font-bold text-[#a855f7] uppercase tracking-widest">
                Selection Locked
              </span>
            </div>
            <button
              onClick={handleResetSelection}
              className="bg-[#a855f7]/10 hover:bg-[#a855f7]/20 border border-[#a855f7]/30 hover:border-[#a855f7]/60 text-[#a855f7] text-[9px] font-mono font-bold px-2 py-0.5 rounded transition-all cursor-pointer uppercase tracking-wider"
            >
              Reset
            </button>
          </div>
        )}

        {/* Categories Section */}
        <div className="space-y-3.5">
          {!activeElement ? (
            <>
              {/* Premium Welcome / Onboarding Screen */}
              <div className="flex flex-col items-center justify-center text-center p-6 py-10 border border-[#1f1f23]/60 bg-gradient-to-b from-[#0c0c0e] to-[#060607] rounded-xl shadow-2xl relative overflow-hidden group">
                <div className="absolute -top-12 -left-12 w-24 h-24 bg-[#00f0ff]/10 rounded-full blur-xl pointer-events-none transition-all group-hover:scale-150 duration-500" />
                <div className="absolute -bottom-12 -right-12 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none transition-all group-hover:scale-150 duration-500" />
                
                <div className="relative w-16 h-16 mb-5 flex items-center justify-center rounded-2xl bg-gradient-to-tr from-zinc-900 to-zinc-950 border border-zinc-800/80 shadow-lg">
                  <div className="absolute inset-0.5 rounded-[14px] bg-[#0c0c0e] flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#logo-grad)" strokeWidth="2.2" className="animate-pulse">
                      <defs>
                        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#00f0ff" />
                          <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                      </defs>
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                </div>

                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-widest mb-2 font-sans bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
                  Design System Analyzer
                </h3>
                
                <p className="text-[10px] text-zinc-400 max-w-[240px] leading-relaxed mb-6 font-sans">
                  Hover over or click any element on the page to extract typography, colors, layout, and visual spacing tokens in real-time.
                </p>

                {!inspectEnabled ? (
                  <button
                    onClick={handleToggleInspect}
                    disabled={!activeTab || isDisallowedUrl(activeTab.url)}
                    className="w-full bg-gradient-to-r from-[#00f0ff] to-[#a855f7] hover:from-[#00f7ff] hover:to-[#b566ff] text-zinc-950 font-sans font-bold text-[10px] uppercase tracking-wider py-2.5 px-4 rounded-lg shadow-[0_0_15px_rgba(0,240,255,0.25)] hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all duration-300 transform active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <span>Start Inspecting</span>
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-3 w-full bg-[#050506] border border-zinc-900 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-[#00f0ff]">
                      <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-ping" />
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider">
                        Inspector Active
                      </span>
                    </div>
                    <p className="text-[9px] text-zinc-500 font-sans">
                      Move your mouse over the page to highlight and inspect components. Click to lock selection.
                    </p>
                    <button
                      onClick={handleToggleInspect}
                      className="mt-1 w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-sans font-semibold text-[9px] uppercase tracking-wider py-1.5 px-3 rounded transition-all cursor-pointer"
                    >
                      Stop Inspecting
                    </button>
                  </div>
                )}
              </div>

              {/* If history exists but no element is currently hovered/selected, show Design System Summary below welcome banner */}
              {inspectedElements.length > 0 && (() => {
                const summaryModule = moduleRegistryInstance.getAllModules().find((m) => m.id === 'designSystemSummary');
                if (summaryModule) {
                  const contextValue: InspectorContext = {
                    activeElement: inspectedElements[inspectedElements.length - 1],
                    activeTab,
                    selectedElement,
                    hoveredElement,
                    inspectedElements,
                    setInspectedElements,
                    showSvgMarkup,
                    setShowSvgMarkup,
                    tokenSystem,
                    setTokenSystem,
                    addDevLog,
                    spacingHistory,
                    radiusHistory,
                    card17Tab,
                    setCard17Tab,
                    downloadTokenFile,
                    getPrimaryFont,
                    getTopColors,
                    getTopSpacing,
                    getTopRadii,
                    getTopShadows
                  };
                  return summaryModule.render(contextValue);
                }
                return null;
              })()}
            </>
          ) : (
            (() => {
              const { modules } = inspectorEngineInstance.inspectElement(activeElement);
              const contextValue: InspectorContext = {
                activeElement,
                activeTab,
                selectedElement,
                hoveredElement,
                inspectedElements,
                setInspectedElements,
                showSvgMarkup,
                setShowSvgMarkup,
                tokenSystem,
                setTokenSystem,
                addDevLog,
                spacingHistory,
                radiusHistory,
                card17Tab,
                setCard17Tab,
                downloadTokenFile,
                getPrimaryFont,
                getTopColors,
                getTopSpacing,
                getTopRadii,
                getTopShadows
              };
              
              return (
                <>
                  {modules.map((mod) => (
                    <React.Fragment key={mod.id}>
                      {mod.render(contextValue)}
                    </React.Fragment>
                  ))}
                </>
              );
            })()
          )}
        </div>

        {/* Collapsible Developer Console to preserve messaging logging capability */}
        <details className="border-t border-[#1f1f23] pt-2 mt-4 font-mono group">
          <summary className="text-[9px] text-zinc-600 cursor-pointer list-none flex items-center justify-between hover:text-zinc-400 transition-colors uppercase tracking-widest font-bold">
            <span>Developer Packets</span>
            <span className="text-[8px] text-zinc-700 bg-zinc-950 px-1.5 py-0.5 border border-zinc-800 rounded group-open:hidden">Show Console</span>
            <span className="text-[8px] text-zinc-700 bg-zinc-950 px-1.5 py-0.5 border border-zinc-800 rounded hidden group-open:inline">Hide Console</span>
          </summary>
          <div className="mt-2 space-y-2.5">
            <div className="flex gap-2">
              <button
                onClick={handlePingWorker}
                className="flex-1 bg-zinc-950 hover:bg-zinc-900 border border-[#1f1f23] hover:border-zinc-700 transition-all rounded py-1 px-2 text-[9px] text-zinc-400 font-bold uppercase tracking-wider cursor-pointer"
              >
                Ping Worker
              </button>
              <button
                onClick={handlePingContent}
                disabled={!activeTab}
                className="flex-1 bg-zinc-950 hover:bg-zinc-900 border border-[#1f1f23] hover:border-zinc-700 transition-all rounded py-1 px-2 text-[9px] text-zinc-400 font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Ping Content
              </button>
            </div>
            
            <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[120px] overflow-y-auto p-2 space-y-1.5 text-[9px]">
              {devLogs.length === 0 ? (
                <div className="text-zinc-700 text-center py-8">Console empty.</div>
              ) : (
                devLogs.map((log) => (
                  <div key={log.id} className="flex gap-1.5 leading-tight">
                    <span className="text-zinc-600">[{log.time}]</span>
                    <span className={`font-bold ${
                      log.direction === 'in' ? 'text-cyan-500' : log.direction === 'out' ? 'text-emerald-500' : 'text-zinc-500'
                    }`}>
                      {log.direction === 'in' ? '←' : log.direction === 'out' ? '→' : '•'}
                    </span>
                    <span className="text-zinc-400 truncate max-w-[60px]">[{log.type}]</span>
                    <span className="text-zinc-500 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </details>
      </main>

      {/* Vercel/Linear Style Footer */}
      <footer className="border-t border-[#1f1f23] bg-[#09090b] px-4 py-3 shrink-0 flex flex-col gap-2 shadow-[0_-1px_2px_rgba(0,0,0,0.3)]">
        {/* Stack Detection badges */}
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-mono font-bold tracking-widest text-zinc-500 uppercase">
            Detected Stack
          </span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {detectedStack.map((tech) => (
              <span key={tech} className="text-[9px] font-mono bg-zinc-950 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded leading-none">
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Connection Status line */}
        <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-[#1f1f23]">
          <span className="text-[9px] font-mono text-zinc-600">
            {statusText}
          </span>
          <span className="text-[8px] font-mono text-zinc-700">
            v1.0.0
          </span>
        </div>
      </footer>
    </div>
  );
};
