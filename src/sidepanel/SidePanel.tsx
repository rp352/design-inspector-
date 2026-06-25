import React, { useState, useEffect } from 'react';
import { InspectorCard } from '../components/InspectorCard';
import { CopyButton } from '../components/CopyButton';
import { BoxModel } from '../components/BoxModel';
import { identifyFont } from '../shared/fontUtils';
import { generateJSONReport, generateCleanCSS, generateTailwindSummary } from '../shared/exportUtils';
import { inferDesignTokens } from '../shared/tokenInference';
import { listenForMessages, sendMessageToBackground, sendMessageToTab } from '../shared/messaging';
import type { TabInfo, ElementHoverInfo, ElementSelectInfo, ParsedShadow } from '../shared/types';

interface DevLogEntry {
  id: string;
  time: string;
  direction: 'in' | 'out' | 'system';
  type: string;
  message: string;
}

const ColorRow: React.FC<{
  label: string;
  hex: string;
  rgb: string;
  isTransparent: boolean;
  isPlaceholder?: boolean;
}> = ({ label, hex, rgb, isTransparent, isPlaceholder = false }) => {
  return (
    <div className="flex flex-col gap-1.5 py-1.5 border-b border-[#1f1f23]/40 last:border-0">
      {/* Swatch & Label */}
      <div className="flex items-center gap-2">
        <div className="relative w-3.5 h-3.5 rounded border border-zinc-800 overflow-hidden shrink-0 checkerboard-bg">
          {!isPlaceholder && (
            <div 
              className="absolute inset-0" 
              style={{ backgroundColor: rgb }} 
            />
          )}
          {isPlaceholder && (
            <div 
              className="absolute inset-0" 
              style={{ backgroundColor: label === 'Background' ? '#09090b' : label === 'Text' ? '#fafafa' : '#1f1f23' }} 
            />
          )}
        </div>
        <span className="text-zinc-400 font-semibold">{label}</span>
        {isTransparent && !isPlaceholder && (
          <span className="text-[7.5px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-500 px-1 py-0.2 rounded uppercase tracking-wider">
            Transparent
          </span>
        )}
      </div>
      {/* Values Grid */}
      <div className="grid grid-cols-2 gap-2 pl-5.5">
        <div className="flex items-center justify-between bg-[#070708] px-2 py-0.5 rounded border border-[#1f1f23]/60">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-zinc-600 text-[8px] uppercase font-bold tracking-wider">Hex</span>
            <span className={`text-[9.5px] truncate font-semibold ${isPlaceholder ? 'text-zinc-500' : 'text-zinc-200'}`}>
              {isPlaceholder ? hex : hex.toUpperCase()}
            </span>
          </div>
          <CopyButton value={isPlaceholder ? '' : hex} />
        </div>
        <div className="flex items-center justify-between bg-[#070708] px-2 py-0.5 rounded border border-[#1f1f23]/60">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-zinc-600 text-[8px] uppercase font-bold tracking-wider">RGB</span>
            <span className={`text-[9.5px] truncate font-semibold ${isPlaceholder ? 'text-zinc-500' : 'text-[#00f0ff]'}`} title={rgb}>
              {rgb}
            </span>
          </div>
          <CopyButton value={isPlaceholder ? '' : rgb} />
        </div>
      </div>
    </div>
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

  // On mount: fetch active tab info & start extension message listener
  useEffect(() => {
    addDevLog('system', 'INIT', 'Side panel active.');

    // Fetch tab info
    sendMessageToBackground('GET_TAB_INFO', undefined, 'sidepanel')
      .then((tabInfo: any) => {
        if (tabInfo && !tabInfo.error) {
          setActiveTab(tabInfo);
          addDevLog('system', 'TAB_INFO', `Target attached: "${tabInfo.title}"`);
          
          // Request current tech stack from the page content script
          sendMessageToTab(tabInfo.tabId, 'DETECT_STACK', undefined, 'sidepanel')
            .then((res: any) => {
              if (res && res.stack) {
                setDetectedStack(res.stack);
                addDevLog('system', 'STACK', `Detected stack: ${res.stack.join(', ')}`);
              }
            })
            .catch(() => {
              // Ignore if content script is not injected yet (e.g. on load / system pages)
            });
        }
      })
      .catch((err) => {
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
        setStatus('ready');
        setStatusText('Tab navigated.');
        setDetectedStack(['MV3']);
        addDevLog('system', 'TAB_NAV', `Switched page: "${tabInfo.title}"`);
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
    if (inspectedElements.length === 0) return { fontName: '—', source: '—' };
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
      source: fontDetails[maxFont] || '—'
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
            disabled={!activeTab}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none border shrink-0 ${
              !activeTab ? 'opacity-40 cursor-not-allowed border-zinc-800' : 'cursor-pointer'
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
          {/* Card 1: Typography */}
          <InspectorCard
            title="Typography"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="4 7 4 4 20 4 20 7"></polyline>
                <line x1="9" y1="20" x2="15" y2="20"></line>
                <line x1="12" y1="4" x2="12" y2="20"></line>
              </svg>
            }
            emptyMessage="No typography data captured. Toggle inspect and hover over text elements."
            isEmpty={!activeElement}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono">
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-zinc-600">Family</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-sans font-semibold">Plus Jakarta Sans</span>
                    <CopyButton value="" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-zinc-600">Source</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8.5px] bg-[#064e3b]/30 border border-[#059669]/20 text-[#34d399]/40 font-bold px-1.5 py-0.2 rounded uppercase tracking-wider">
                      Google Fonts
                    </span>
                    <span className="text-[9px] text-[#00f0ff]/40 font-semibold cursor-not-allowed">
                      View Font
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-zinc-600">Size</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-semibold">14px</span>
                    <CopyButton value="" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-zinc-600">Weight</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-semibold">600 (SemiBold)</span>
                    <CopyButton value="" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-zinc-600">Line Height</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-semibold">20px (1.43)</span>
                    <CopyButton value="" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-zinc-600">Letter Spacing</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-semibold">normal</span>
                    <CopyButton value="" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-zinc-600">Color</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-semibold">rgb(250, 250, 250)</span>
                    <CopyButton value="" />
                  </div>
                </div>
              </div>
            }
          >
            {activeElement && (() => {
              const fontInfo = identifyFont(activeElement.typography.fontFamily);
              return (
                <div className="space-y-1.5 text-[10px] font-mono">
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="text-zinc-600">Family</span>
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className="text-zinc-200 font-sans font-semibold truncate max-w-[140px]" title={activeElement.typography.fontFamily}>
                        {fontInfo.fontName}
                      </span>
                      <CopyButton value={fontInfo.fontName} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="text-zinc-600">Source</span>
                    <div className="flex items-center gap-1.5">
                      {fontInfo.isGoogleFont ? (
                        <>
                          <span className="text-[8.5px] bg-[#064e3b]/80 border border-[#059669]/50 text-[#34d399] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider">
                            Google Fonts
                          </span>
                          <a 
                            href={fontInfo.googleFontUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-[9px] text-[#00f0ff] hover:underline font-semibold"
                          >
                            View Font
                          </a>
                        </>
                      ) : fontInfo.source === 'System Font' ? (
                        <span className="text-[8.5px] bg-[#18181b] border border-[#27272a] text-[#a1a1aa] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider">
                          System Font
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8.5px] bg-[#78350f]/80 border border-[#d97706]/50 text-[#fbbf24] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider">
                            Custom
                          </span>
                          <span className="text-[8.5px] text-zinc-500 italic">Custom or Licensed Font</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="text-zinc-600">Size</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#00f0ff] font-semibold">{activeElement.typography.fontSize}</span>
                      <CopyButton value={activeElement.typography.fontSize} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="text-zinc-600">Weight</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-300 font-semibold">{activeElement.typography.fontWeight}</span>
                      <CopyButton value={activeElement.typography.fontWeight} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="text-zinc-600">Line Height</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-300 font-semibold">{activeElement.typography.lineHeight}</span>
                      <CopyButton value={activeElement.typography.lineHeight} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="text-zinc-600">Letter Spacing</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-300 font-semibold">{activeElement.typography.letterSpacing}</span>
                      <CopyButton value={activeElement.typography.letterSpacing} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="text-zinc-600">Color</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-300 font-semibold">{activeElement.typography.color}</span>
                      <CopyButton value={activeElement.typography.color} />
                    </div>
                  </div>

                  {/* Text Content Preview (visible only on locked selection) */}
                  {selectedElement && selectedElement.textContent && (
                    <div className="mt-2.5 pt-2 border-t border-[#1f1f23] flex flex-col gap-1 text-[10px] font-sans">
                      <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">Text Preview</span>
                      <p className="text-zinc-300 italic truncate max-w-[200px]" title={selectedElement.textContent}>
                        "{selectedElement.textContent}"
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 2: Colors */}
          <InspectorCard
            title="Colors"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
                <circle cx="12" cy="7.5" r="1.5" fill="currentColor" />
                <circle cx="7.5" cy="11" r="1.5" fill="currentColor" />
                <circle cx="16.5" cy="11" r="1.5" fill="currentColor" />
                <circle cx="12" cy="15.5" r="1.5" fill="currentColor" />
              </svg>
            }
            emptyMessage="No color parameters identified. Hover over objects to review styling colors."
            isEmpty={!activeElement}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono">
                <ColorRow label="Background" hex="#09090b" rgb="rgb(9, 9, 11)" isTransparent={false} isPlaceholder={true} />
                <ColorRow label="Text" hex="#fafafa" rgb="rgb(250, 250, 250)" isTransparent={false} isPlaceholder={true} />
                <ColorRow label="Border" hex="#1f1f23" rgb="rgb(31, 31, 35)" isTransparent={false} isPlaceholder={true} />
              </div>
            }
          >
            {activeElement && activeElement.colors && (
              <div className="space-y-1.5 text-[10px] font-mono">
                {activeElement.colors.background && (
                  <ColorRow 
                    label="Background" 
                    hex={activeElement.colors.background.hex} 
                    rgb={activeElement.colors.background.rgb}
                    isTransparent={activeElement.colors.background.isTransparent}
                  />
                )}
                {activeElement.colors.text && (
                  <ColorRow 
                    label="Text" 
                    hex={activeElement.colors.text.hex} 
                    rgb={activeElement.colors.text.rgb}
                    isTransparent={activeElement.colors.text.isTransparent}
                  />
                )}
                {activeElement.colors.border && (
                  <ColorRow 
                    label="Border" 
                    hex={activeElement.colors.border.hex} 
                    rgb={activeElement.colors.border.rgb}
                    isTransparent={activeElement.colors.border.isTransparent}
                  />
                )}
                {activeElement.colors.shadows && activeElement.colors.shadows.length > 0 && (
                  <div className="space-y-1.5">
                    {activeElement.colors.shadows.map((shadowColor, index) => (
                      <ColorRow 
                        key={index}
                        label={`Shadow ${index + 1}`} 
                        hex={shadowColor.hex} 
                        rgb={shadowColor.rgb}
                        isTransparent={shadowColor.isTransparent}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </InspectorCard>

          {/* Card 3: Layout */}
          <InspectorCard
            title="Layout"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <rect x="9" y="9" width="6" height="6" />
              </svg>
            }
            emptyMessage="No grid or spacing metadata detected on the highlighted area."
            isEmpty={!activeElement}
            placeholderChildren={
              <div className="space-y-3">
                <BoxModel 
                  data={{
                    margin: { top: '0px', right: 'auto', bottom: '0px', left: 'auto' },
                    border: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
                    padding: { top: '0px', right: '16px', bottom: '0px', left: '16px' },
                    width: '320px',
                    height: '48px'
                  }}
                  isPlaceholder={true}
                />
                <div className="space-y-1.5 text-[10px] font-mono border-t border-[#1f1f23]/60 pt-2.5">
                  <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Display</span><span className="text-zinc-400 font-semibold">flex</span></div>
                  <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Position</span><span className="text-zinc-400 font-semibold">static</span></div>
                </div>
              </div>
            }
          >
            {activeElement && activeElement.layout && (
              <div className="space-y-3">
                {/* Live Box Model */}
                <BoxModel data={activeElement.layout.boxModel} />
                
                {/* Detailed layout settings */}
                <div className="space-y-1.5 text-[10px] font-mono border-t border-[#1f1f23]/60 pt-2.5">
                  <div className="flex justify-between text-zinc-500">
                    <span className="text-zinc-600">Display</span>
                    <span className="text-zinc-200 font-semibold">{activeElement.layout.display}</span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span className="text-zinc-600">Position</span>
                    <span className="text-zinc-200 font-semibold">{activeElement.layout.position}</span>
                  </div>
                  
                  {/* Offsets (if position is not static) */}
                  {activeElement.layout.position !== 'static' && (
                    <div className="flex justify-between text-zinc-500">
                      <span className="text-zinc-600">Offsets</span>
                      <span className="text-zinc-300 font-semibold">
                        T: {activeElement.layout.offsets.top} | R: {activeElement.layout.offsets.right} | B: {activeElement.layout.offsets.bottom} | L: {activeElement.layout.offsets.left}
                      </span>
                    </div>
                  )}
                  
                  {/* Flex settings */}
                  {activeElement.layout.display.includes('flex') && (
                    <>
                      <div className="flex justify-between text-zinc-500">
                        <span className="text-zinc-600">Flex Direction</span>
                        <span className="text-zinc-300 font-semibold">{activeElement.layout.flexGrid.flexDirection}</span>
                      </div>
                      <div className="flex justify-between text-zinc-500">
                        <span className="text-zinc-600">Flex Align / Justify</span>
                        <span className="text-zinc-300 font-semibold">
                          {activeElement.layout.flexGrid.alignItems} / {activeElement.layout.flexGrid.justifyContent}
                        </span>
                      </div>
                      {(activeElement.layout.flexGrid.flexGrow !== '0' || activeElement.layout.flexGrid.flexShrink !== '1' || activeElement.layout.flexGrid.flexBasis !== 'auto') && (
                        <div className="flex justify-between text-zinc-500">
                          <span className="text-zinc-600">Flex Sizing</span>
                          <span className="text-zinc-300 font-semibold">
                            grow: {activeElement.layout.flexGrid.flexGrow} | shrink: {activeElement.layout.flexGrid.flexShrink} | basis: {activeElement.layout.flexGrid.flexBasis}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Grid settings */}
                  {activeElement.layout.display.includes('grid') && (
                    <>
                      <div className="flex justify-between text-zinc-500">
                        <span className="text-zinc-600">Grid Template Columns</span>
                        <span className="text-zinc-300 font-semibold truncate max-w-[130px]" title={activeElement.layout.flexGrid.gridTemplateColumns}>
                          {activeElement.layout.flexGrid.gridTemplateColumns}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-500">
                        <span className="text-zinc-600">Grid Template Rows</span>
                        <span className="text-zinc-300 font-semibold truncate max-w-[130px]" title={activeElement.layout.flexGrid.gridTemplateRows}>
                          {activeElement.layout.flexGrid.gridTemplateRows}
                        </span>
                      </div>
                      {activeElement.layout.flexGrid.gridAutoFlow !== 'row' && (
                        <div className="flex justify-between text-zinc-500">
                          <span className="text-zinc-600">Grid Flow</span>
                          <span className="text-zinc-300 font-semibold">{activeElement.layout.flexGrid.gridAutoFlow}</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Gap settings */}
                  {activeElement.layout.flexGrid.gap && activeElement.layout.flexGrid.gap !== 'normal' && activeElement.layout.flexGrid.gap !== '0px' && (
                    <div className="flex justify-between text-zinc-500">
                      <span className="text-zinc-600">Gap</span>
                      <span className="text-zinc-200 font-semibold">{activeElement.layout.flexGrid.gap}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </InspectorCard>

          {/* Card 4: Effects */}
          <InspectorCard
            title="Effects"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10z" fill="currentColor" className="text-zinc-500" />
              </svg>
            }
            emptyMessage="No specialized rendering filters, shadows, or rounded corners found."
            isEmpty={!activeElement}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Opacity</span><span className="text-zinc-400 font-semibold">100%</span></div>
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Radius</span><span className="text-zinc-400 font-semibold">8px</span></div>
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Shadow</span><span className="text-zinc-400 font-semibold">none</span></div>
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Transition</span><span className="text-zinc-400 font-semibold">none</span></div>
              </div>
            }
          >
            {activeElement && (
              <div className="space-y-1.5 text-[10px] font-mono">
                <div className="flex justify-between text-zinc-500">
                  <span className="text-zinc-600">Opacity</span>
                  <span className="text-zinc-200 font-semibold">
                    {Math.round(parseFloat(activeElement.styles.opacity) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span className="text-zinc-600">Radius</span>
                  <span className="text-zinc-200 font-semibold">
                    {activeElement.styles.borderRadius !== '0px' ? activeElement.styles.borderRadius : 'none'}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span className="text-zinc-600">Shadow</span>
                  <span className="text-zinc-200 font-semibold truncate max-w-[130px]" title={activeElement.styles.boxShadow}>
                    {activeElement.styles.boxShadow !== 'none' ? 'active' : 'none'}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span className="text-zinc-600">Transition</span>
                  <span className="text-zinc-200 font-semibold truncate max-w-[130px]" title={activeElement.styles.transition}>
                    {activeElement.styles.transition.includes('0s') ? 'none' : 'active'}
                  </span>
                </div>
              </div>
            )}
          </InspectorCard>

          {/* Card 5: Assets */}
          <InspectorCard
            title="Assets"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            }
            emptyMessage="No linked images, SVG geometries, or backgrounds located."
            isEmpty={!activeElement}
            placeholderChildren={
              <div className="space-y-3">
                {/* Mock Preview Frame */}
                <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[100px] flex items-center justify-center overflow-hidden checkerboard-bg opacity-30 p-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-600">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <div className="space-y-1.5 text-[10px] font-mono border-t border-[#1f1f23]/60 pt-2.5">
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="text-zinc-600">Asset Type</span>
                    <span className="text-[#a1a1aa] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider text-[8px] bg-[#18181b] border border-[#27272a]">
                      unknown
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="text-zinc-600">Dimensions</span>
                    <span className="text-zinc-400 font-semibold">0 × 0 px</span>
                  </div>
                </div>
              </div>
            }
          >
            {activeElement && activeElement.asset && (() => {
              const asset = activeElement.asset;
              
              const getAssetTypeLabel = (t: string) => {
                switch (t) {
                  case 'image': return 'Image';
                  case 'svg-inline': return 'Inline SVG';
                  case 'svg-external': return 'External SVG';
                  case 'background-image': return 'Background Image';
                  case 'video': return 'Video';
                  case 'canvas': return 'HTML5 Canvas';
                  case 'lottie': return 'Lottie Animation';
                  case 'icon': return 'Icon Graphic';
                  default: return 'Unknown';
                }
              };

              // Preview renderer based on classification
              const renderPreview = () => {
                switch (asset.type) {
                  case 'image':
                  case 'svg-external':
                  case 'background-image':
                    return asset.url ? (
                      <img 
                        src={asset.url} 
                        alt="Asset preview" 
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : null;
                  case 'svg-inline':
                    return asset.svgContent ? (
                      <div 
                        dangerouslySetInnerHTML={{ __html: asset.svgContent }}
                        className="[&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:w-auto [&>svg]:h-auto [&>svg]:object-contain flex items-center justify-center h-full w-full"
                      />
                    ) : null;
                  case 'video':
                    return asset.url ? (
                      <video 
                        src={asset.url} 
                        muted 
                        loop 
                        autoPlay 
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : null;
                  case 'canvas':
                    return (
                      <div className="flex flex-col items-center gap-1.5 text-zinc-500">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                        <span className="text-[8px] font-mono uppercase tracking-wider">Canvas Element</span>
                      </div>
                    );
                  case 'lottie':
                    return (
                      <div className="flex flex-col items-center gap-1.5 text-rose-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        <span className="text-[8px] font-mono uppercase tracking-wider text-zinc-500">Lottie Animation</span>
                      </div>
                    );
                  case 'icon':
                    return (
                      <div className="flex flex-col items-center gap-1.5 text-purple-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        <span className="text-[8px] font-mono uppercase tracking-wider text-zinc-500">Vector / Font Icon</span>
                      </div>
                    );
                  default:
                    return (
                      <div className="flex flex-col items-center gap-1.5 text-zinc-600">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="text-[8px] font-mono uppercase tracking-wider">No Asset Loaded</span>
                      </div>
                    );
                }
              };

              const imageDetails = asset.imageDetails;
              if (imageDetails) {
                const getExtensionBadgeClass = (ext: string) => {
                  switch (ext.toUpperCase()) {
                    case 'PNG': return 'bg-cyan-950 border-cyan-800 text-cyan-400';
                    case 'JPEG': return 'bg-amber-950 border-amber-800 text-amber-400';
                    case 'WEBP': return 'bg-emerald-950 border-emerald-800 text-emerald-400';
                    case 'AVIF': return 'bg-indigo-950 border-indigo-800 text-indigo-400';
                    case 'GIF': return 'bg-pink-950 border-pink-800 text-pink-400';
                    case 'SVG': return 'bg-teal-950 border-teal-800 text-teal-400';
                    default: return 'bg-zinc-950 border-zinc-800 text-zinc-400';
                  }
                };

                return (
                  <div className="space-y-3">
                    {/* Live Checkerboard Preview Container */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[120px] flex items-center justify-center overflow-hidden checkerboard-bg p-2 relative shadow-inner">
                      {imageDetails.src ? (
                        <img 
                          src={imageDetails.src} 
                          alt={imageDetails.alt || 'Asset preview'} 
                          className="max-h-full max-w-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : null}
                    </div>

                    {/* Metadata fields */}
                    <div className="space-y-2 text-[10px] font-mono border-t border-[#1f1f23]/60 pt-2.5">
                      <div className="flex items-center justify-between text-zinc-500">
                        <span className="text-zinc-600">Asset Type</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${getExtensionBadgeClass(imageDetails.extension)}`}>
                            {imageDetails.extension}
                          </span>
                          <span className="text-zinc-500 text-[9px] uppercase font-bold">Image</span>
                        </div>
                      </div>

                      {imageDetails.source && (
                        <div className="flex items-center justify-between text-zinc-500">
                          <span className="text-zinc-600">Source Provider</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                              imageDetails.source.provider === 'Custom Hosted'
                                ? 'bg-zinc-950 border border-zinc-800 text-zinc-400'
                                : 'bg-purple-950 border border-purple-800 text-purple-300'
                            }`}>
                              {imageDetails.source.provider}
                            </span>
                            {imageDetails.source.confidence < 1.0 && (
                              <span className="text-[8.5px] text-zinc-500 font-semibold" title="Confidence Score">
                                ({Math.round(imageDetails.source.confidence * 100)}%)
                              </span>
                            )}
                            {imageDetails.source.documentationLink && (
                              <a
                                href={imageDetails.source.documentationLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[9px] text-[#00f0ff] hover:underline font-bold uppercase tracking-wider flex items-center gap-0.5 ml-1"
                              >
                                <span>Docs</span>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="inline-block mt-0.5">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-zinc-500">
                        <span className="text-zinc-600">Resolution</span>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-zinc-200 font-semibold">
                            {imageDetails.width} × {imageDetails.height} px <span className="text-zinc-500 text-[8.5px] font-normal">(Display)</span>
                          </span>
                          <span className="text-[#00f0ff] font-semibold">
                            {imageDetails.naturalWidth} × {imageDetails.naturalHeight} px <span className="text-zinc-500 text-[8.5px] font-normal">(Intrinsic)</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-zinc-500">
                        <span className="text-zinc-600">Strategies</span>
                        <div className="flex gap-1.5">
                          <span className="text-[9px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded">
                            loading: <span className="text-[#00f0ff] font-semibold">{imageDetails.loading}</span>
                          </span>
                          <span className="text-[9px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded">
                            decoding: <span className="text-[#00f0ff] font-semibold">{imageDetails.decoding}</span>
                          </span>
                        </div>
                      </div>

                      {/* Alt text field */}
                      <div className="flex flex-col gap-1 text-zinc-500 pt-1.5 border-t border-[#1f1f23]/40">
                        <span className="text-zinc-600">Alt Text</span>
                        <span className={`text-[9.5px] font-sans px-2.5 py-1 rounded bg-[#070708] border border-[#1f1f23]/60 leading-normal ${imageDetails.alt ? 'text-zinc-200' : 'text-zinc-600 italic'}`}>
                          {imageDetails.alt || 'none'}
                        </span>
                      </div>

                      {/* Srcset field if available */}
                      {imageDetails.srcset && (
                        <div className="flex flex-col gap-1 text-zinc-500 pt-1.5 border-t border-[#1f1f23]/40">
                          <span className="text-zinc-600">Srcset</span>
                          <div className="flex items-center justify-between bg-[#070708] border border-[#1f1f23]/60 rounded px-2.5 py-1">
                            <span className="text-zinc-400 truncate text-[9px] font-semibold max-w-[170px]" title={imageDetails.srcset}>
                              {imageDetails.srcset}
                            </span>
                            <CopyButton value={imageDetails.srcset} />
                          </div>
                        </div>
                      )}

                      {/* Copy URL and Open in New Tab Row */}
                      <div className="flex items-center gap-2 pt-2.5 border-t border-[#1f1f23]/60">
                        <div className="flex-1 flex items-center justify-between bg-[#070708] px-2.5 py-0.5 rounded border border-[#1f1f23]/60 overflow-hidden">
                          <div className="flex flex-col min-w-0">
                            <span className="text-zinc-600 text-[8px] uppercase font-bold tracking-wider leading-none mb-0.5">Asset URL</span>
                            <span className="text-zinc-400 truncate text-[9.5px] font-semibold max-w-[130px]" title={imageDetails.src}>
                              {imageDetails.src}
                            </span>
                          </div>
                          <CopyButton value={imageDetails.src} />
                        </div>
                        <button
                          onClick={() => window.open(imageDetails.src, '_blank')}
                          className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[9.5px] font-bold px-3 py-1.5 rounded flex items-center gap-1.5 cursor-pointer transition-all shrink-0 uppercase tracking-wider"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-400">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          <span>Open</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              const svgDetails = asset.svgDetails;
              const iconDetails = asset.iconDetails;
              if (iconDetails) {
                const getLibraryBadgeClass = (lib: string) => {
                  switch (lib) {
                    case 'Lucide': return 'bg-cyan-950 border-cyan-800 text-cyan-400';
                    case 'Heroicons': return 'bg-orange-950 border-orange-800 text-orange-400';
                    case 'Font Awesome': return 'bg-blue-950 border-blue-800 text-blue-400';
                    case 'Material Symbols': return 'bg-emerald-950 border-emerald-800 text-emerald-400';
                    case 'Bootstrap Icons': return 'bg-purple-950 border-purple-800 text-purple-400';
                    case 'Remix Icons': return 'bg-indigo-950 border-indigo-800 text-indigo-400';
                    case 'Tabler Icons': return 'bg-teal-950 border-teal-800 text-teal-400';
                    case 'Feather': return 'bg-pink-950 border-pink-800 text-pink-400';
                    case 'Ionicons': return 'bg-sky-950 border-sky-800 text-sky-400';
                    case 'Phosphor': return 'bg-amber-950 border-amber-800 text-amber-400';
                    default: return 'bg-zinc-950 border-zinc-800 text-zinc-400';
                  }
                };

                const downloadSVG = (content: string) => {
                  const blob = new Blob([content], { type: 'image/svg+xml' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${iconDetails.iconName || 'icon'}.svg`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                };

                const hasSvg = svgDetails && svgDetails.rawContent;

                return (
                  <div className="space-y-3">
                    {/* Preview Frame */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[120px] flex items-center justify-center overflow-hidden checkerboard-bg p-2 relative shadow-inner">
                      {hasSvg ? (
                        <div 
                          dangerouslySetInnerHTML={{ __html: svgDetails.rawContent }}
                          className="[&>svg]:max-h-12 [&>svg]:max-w-12 [&>svg]:w-auto [&>svg]:h-auto [&>svg]:object-contain flex items-center justify-center h-full w-full [&>svg]:text-white [&>svg]:fill-none [&>svg]:stroke-current"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-zinc-500">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-400">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                          <span className="text-[8.5px] font-mono uppercase tracking-wider">Font-based Icon</span>
                        </div>
                      )}
                    </div>

                    {/* Navigation Tabs (if SVG is available) */}
                    {hasSvg && (
                      <div className="flex border-b border-[#1f1f23] gap-4">
                        <button
                          onClick={() => setShowSvgMarkup(false)}
                          className={`text-[9.5px] font-bold uppercase tracking-wider pb-1.5 border-b-2 cursor-pointer transition-all ${
                            !showSvgMarkup
                              ? 'border-[#00f0ff] text-[#00f0ff]'
                              : 'border-transparent text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          Properties
                        </button>
                        <button
                          onClick={() => setShowSvgMarkup(true)}
                          className={`text-[9.5px] font-bold uppercase tracking-wider pb-1.5 border-b-2 cursor-pointer transition-all ${
                            showSvgMarkup
                              ? 'border-[#00f0ff] text-[#00f0ff]'
                              : 'border-transparent text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          Source Markup
                        </button>
                      </div>
                    )}

                    {(!hasSvg || !showSvgMarkup) ? (
                      /* Properties View */
                      <div className="space-y-2 text-[10px] font-mono">
                        {/* Library */}
                        <div className="flex items-center justify-between text-zinc-500">
                          <span className="text-zinc-600">Icon Library</span>
                          <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${getLibraryBadgeClass(iconDetails.library)}`}>
                            {iconDetails.library}
                          </span>
                        </div>

                        {/* Icon Name */}
                        <div className="flex items-center justify-between text-zinc-500">
                          <span className="text-zinc-600">Extracted Name</span>
                          <span className="text-zinc-200 font-semibold">{iconDetails.iconName || 'Custom Icon'}</span>
                        </div>

                        {/* Confidence */}
                        <div className="flex items-center justify-between text-zinc-500">
                          <span className="text-zinc-600">Confidence</span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-[#00f0ff]" 
                                style={{ width: `${iconDetails.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-zinc-300 font-semibold">{Math.round(iconDetails.confidence * 100)}%</span>
                          </div>
                        </div>

                        {/* Docs reference links */}
                        {iconDetails.documentation && (
                          <div className="flex items-center justify-between text-zinc-500">
                            <span className="text-zinc-600">Documentation</span>
                            <a
                              href={iconDetails.documentation}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[9px] text-[#00f0ff] hover:underline font-bold uppercase tracking-wider flex items-center gap-0.5"
                            >
                              <span>Docs Link</span>
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="mt-0.5">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                          </div>
                        )}

                        {/* SVG Properties if present */}
                        {svgDetails && (
                          <>
                            <div className="flex items-center justify-between text-zinc-500 pt-1.5 border-t border-[#1f1f23]/40">
                              <span className="text-zinc-600">viewBox</span>
                              <span className="text-zinc-300">{svgDetails.viewBox || '—'}</span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-500">
                              <span className="text-zinc-600">Fill / Stroke</span>
                              <span className="text-zinc-300">
                                {svgDetails.fill || 'none'} / {svgDetails.stroke || 'none'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      /* Source View */
                      <div className="space-y-2.5">
                        <div className="relative">
                          <pre className="bg-[#050506] border border-[#1f1f23] rounded-md p-3 font-mono text-[9px] text-zinc-300 overflow-x-auto max-h-[220px] whitespace-pre select-text leading-relaxed">
                            <code>{svgDetails.rawContent}</code>
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Actions Row */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#1f1f23]/60">
                      {hasSvg ? (
                        <>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(svgDetails.rawContent);
                              addDevLog('system', 'COPY_ICON', 'Icon SVG content copied.');
                            }}
                            className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[9.5px] font-bold py-1.5 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all uppercase tracking-wider"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-400">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            <span>Copy SVG</span>
                          </button>
                          <button
                            onClick={() => downloadSVG(svgDetails.rawContent)}
                            className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[9.5px] font-bold py-1.5 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all uppercase tracking-wider"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-400">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span>Download</span>
                          </button>
                        </>
                      ) : null}
                      
                      {iconDetails.documentation && (
                        <button
                          onClick={() => window.open(iconDetails.documentation, '_blank')}
                          className="flex-1 bg-[#a855f7]/10 hover:bg-[#a855f7]/20 border border-[#a855f7]/30 hover:border-[#a855f7]/60 text-[#a855f7] text-[9.5px] font-bold py-1.5 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all uppercase tracking-wider"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          <span>Open Docs</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              if (svgDetails) {
                const getSvgTypeLabel = (t: string) => {
                  switch (t) {
                    case 'inline': return 'Inline SVG';
                    case 'sprite': return 'Sprite SVG';
                    case 'external': return 'External SVG';
                    default: return 'SVG';
                  }
                };

                const getSvgTypeBadge = (t: string) => {
                  switch (t) {
                    case 'inline': return 'bg-teal-950 border-teal-800 text-teal-400';
                    case 'sprite': return 'bg-blue-950 border-blue-800 text-blue-400';
                    case 'external': return 'bg-emerald-950 border-emerald-800 text-emerald-400';
                    default: return 'bg-zinc-950 border-zinc-800 text-zinc-400';
                  }
                };

                const downloadSVG = (content: string) => {
                  const blob = new Blob([content], { type: 'image/svg+xml' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'vector.svg';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                };

                return (
                  <div className="space-y-3">
                    {/* Live Preview Container */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[120px] flex items-center justify-center overflow-hidden checkerboard-bg p-2 relative shadow-inner">
                      {svgDetails.rawContent ? (
                        <div 
                          dangerouslySetInnerHTML={{ __html: svgDetails.rawContent }}
                          className="[&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:w-auto [&>svg]:h-auto [&>svg]:object-contain flex items-center justify-center h-full w-full"
                        />
                      ) : (
                        <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-mono">No Preview</span>
                      )}
                    </div>

                    {/* Navigation Tabs (Properties / Source) */}
                    <div className="flex border-b border-[#1f1f23] gap-4">
                      <button
                        onClick={() => setShowSvgMarkup(false)}
                        className={`text-[9.5px] font-bold uppercase tracking-wider pb-1.5 border-b-2 cursor-pointer transition-all ${
                          !showSvgMarkup
                            ? 'border-[#00f0ff] text-[#00f0ff]'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Properties
                      </button>
                      <button
                        onClick={() => setShowSvgMarkup(true)}
                        className={`text-[9.5px] font-bold uppercase tracking-wider pb-1.5 border-b-2 cursor-pointer transition-all ${
                          showSvgMarkup
                            ? 'border-[#00f0ff] text-[#00f0ff]'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Source Markup
                      </button>
                    </div>

                    {!showSvgMarkup ? (
                      /* Properties View */
                      <div className="space-y-2 text-[10px] font-mono">
                        {/* Type badge */}
                        <div className="flex items-center justify-between text-zinc-500">
                          <span className="text-zinc-600">SVG Type</span>
                          <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${getSvgTypeBadge(svgDetails.type)}`}>
                            {getSvgTypeLabel(svgDetails.type)}
                          </span>
                        </div>

                        {/* viewBox */}
                        <div className="flex items-center justify-between text-zinc-500">
                          <span className="text-zinc-600">viewBox</span>
                          <span className="text-zinc-200 font-semibold">{svgDetails.viewBox || '—'}</span>
                        </div>

                        {/* Dimensions */}
                        <div className="flex items-center justify-between text-zinc-500">
                          <span className="text-zinc-600">Dimensions</span>
                          <span className="text-zinc-200 font-semibold">
                            {svgDetails.width || '—'} × {svgDetails.height || '—'}
                          </span>
                        </div>

                        {/* Styling Properties */}
                        <div className="flex items-center justify-between text-zinc-500">
                          <span className="text-zinc-600">Fill / Stroke</span>
                          <span className="text-zinc-200 font-semibold">
                            {svgDetails.fill || 'none'} / {svgDetails.stroke || 'none'}{svgDetails.strokeWidth ? ` (${svgDetails.strokeWidth})` : ''}
                          </span>
                        </div>

                        {/* Node counts grid */}
                        <div className="pt-2 border-t border-[#1f1f23]/40">
                          <span className="text-zinc-600 text-[8px] uppercase font-bold tracking-wider block mb-1.5">Elements Breakdown</span>
                          <div className="grid grid-cols-3 gap-1.5">
                            <div className="bg-[#070708] border border-[#1f1f23]/60 px-2 py-1.5 rounded flex flex-col">
                              <span className="text-zinc-600 text-[7.5px] uppercase font-bold tracking-wider leading-none mb-1">Paths</span>
                              <span className="text-zinc-200 font-semibold text-[11px] leading-none">{svgDetails.pathsCount}</span>
                            </div>
                            <div className="bg-[#070708] border border-[#1f1f23]/60 px-2 py-1.5 rounded flex flex-col">
                              <span className="text-zinc-600 text-[7.5px] uppercase font-bold tracking-wider leading-none mb-1">Groups</span>
                              <span className="text-zinc-200 font-semibold text-[11px] leading-none">{svgDetails.groupsCount}</span>
                            </div>
                            <div className="bg-[#070708] border border-[#1f1f23]/60 px-2 py-1.5 rounded flex flex-col">
                              <span className="text-zinc-600 text-[7.5px] uppercase font-bold tracking-wider leading-none mb-1">Masks</span>
                              <span className="text-zinc-200 font-semibold text-[11px] leading-none">{svgDetails.masksCount}</span>
                            </div>
                            <div className="bg-[#070708] border border-[#1f1f23]/60 px-2 py-1.5 rounded flex flex-col">
                              <span className="text-zinc-600 text-[7.5px] uppercase font-bold tracking-wider leading-none mb-1">Clip Paths</span>
                              <span className="text-zinc-200 font-semibold text-[11px] leading-none">{svgDetails.clipPathsCount}</span>
                            </div>
                            <div className="bg-[#070708] border border-[#1f1f23]/60 px-2 py-1.5 rounded flex flex-col">
                              <span className="text-zinc-600 text-[7.5px] uppercase font-bold tracking-wider leading-none mb-1">Filters</span>
                              <span className="text-zinc-200 font-semibold text-[11px] leading-none">{svgDetails.filtersCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Source View */
                      <div className="space-y-2.5">
                        <div className="relative">
                          <pre className="bg-[#050506] border border-[#1f1f23] rounded-md p-3 font-mono text-[9px] text-zinc-300 overflow-x-auto max-h-[220px] whitespace-pre select-text leading-relaxed">
                            <code>{svgDetails.rawContent}</code>
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Actions Row */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#1f1f23]/60">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(svgDetails.rawContent);
                          addDevLog('system', 'COPY_SVG', 'SVG raw content copied.');
                        }}
                        className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[9.5px] font-bold py-1.5 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all uppercase tracking-wider"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-400">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copy SVG</span>
                      </button>
                      <button
                        onClick={() => downloadSVG(svgDetails.rawContent)}
                        className="flex-1 bg-[#a855f7]/10 hover:bg-[#a855f7]/20 border border-[#a855f7]/30 hover:border-[#a855f7]/60 text-[#a855f7] text-[9.5px] font-bold py-1.5 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all uppercase tracking-wider"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {/* Live Checkerboard Preview Container */}
                  <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[100px] flex items-center justify-center overflow-hidden checkerboard-bg p-2 relative shadow-inner">
                    {renderPreview()}
                  </div>

                  {/* Metadata fields */}
                  <div className="space-y-1.5 text-[10px] font-mono border-t border-[#1f1f23]/60 pt-2.5">
                    <div className="flex items-center justify-between text-zinc-500">
                      <span className="text-zinc-600">Asset Type</span>
                      <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                        asset.type.includes('svg') || asset.type === 'icon'
                          ? 'bg-[#064e3b]/80 border border-[#059669]/50 text-[#34d399]'
                          : asset.type === 'video'
                          ? 'bg-[#0c4a6e]/80 border border-[#0284c7]/50 text-[#38bdf8]'
                          : asset.type === 'canvas' || asset.type === 'lottie'
                          ? 'bg-[#881337]/80 border border-[#e11d48]/50 text-[#fda4af]'
                          : asset.type === 'image' || asset.type === 'background-image'
                          ? 'bg-[#1e3a8a]/80 border border-[#3b82f6]/50 text-[#93c5fd]'
                          : 'bg-[#18181b] border border-[#27272a] text-[#a1a1aa]'
                      }`}>
                        {getAssetTypeLabel(asset.type)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-500">
                      <span className="text-zinc-600">Dimensions</span>
                      <span className="text-zinc-200 font-semibold">
                        {asset.dimensions ? `${asset.dimensions.width} × ${asset.dimensions.height} px` : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-500">
                      <span className="text-zinc-600">Source Mode</span>
                      <span className="text-zinc-300 font-semibold">
                        {asset.isInline ? 'Inline (Data / Code)' : 'External Resource'}
                      </span>
                    </div>

                    {asset.mimeType && (
                      <div className="flex items-center justify-between text-zinc-500">
                        <span className="text-zinc-600">MIME Type</span>
                        <span className="text-zinc-200 font-semibold">{asset.mimeType}</span>
                      </div>
                    )}

                    {asset.url && (
                      <div className="flex items-center justify-between text-zinc-500 pt-1">
                        <span className="text-zinc-600">Asset URL</span>
                        <div className="flex items-center gap-1.5 max-w-[150px] overflow-hidden">
                          <span className="text-zinc-400 truncate text-[9.5px] font-semibold" title={asset.url}>
                            {asset.url}
                          </span>
                          <CopyButton value={asset.url} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 6: Background */}
          <InspectorCard
            title="Background"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M3 9h18M3 15h18" />
              </svg>
            }
            emptyMessage="No background style detected on this element."
            isEmpty={!activeElement || !activeElement.background}
            placeholderChildren={
              <div className="space-y-3">
                <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[60px] flex items-center justify-center opacity-30 checkerboard-bg" />
                <div className="space-y-1.5 text-[10px] font-mono border-t border-[#1f1f23]/60 pt-2.5">
                  <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Base Color</span><span className="text-zinc-400 font-semibold">transparent</span></div>
                </div>
              </div>
            }
          >
            {activeElement && activeElement.background && (() => {
              const bg = activeElement.background;
              
              const getLayerTypeBadgeClass = (type: string) => {
                switch (type) {
                  case 'solid': return 'bg-zinc-950 border border-zinc-800 text-zinc-400';
                  case 'gradient': return 'bg-purple-950 border border-purple-800 text-purple-300';
                  case 'image': return 'bg-blue-950 border border-blue-800 text-blue-300';
                  default: return 'bg-zinc-950 border border-zinc-800 text-zinc-500';
                }
              };

              return (
                <div className="space-y-3.5">
                  {/* Live Visual Background Preview */}
                  <div className="relative border border-[#1f1f23] rounded-md h-[70px] overflow-hidden checkerboard-bg shadow-inner flex items-center justify-center">
                    <div 
                      className="absolute inset-0"
                      style={{
                        backgroundColor: bg.color,
                        backgroundImage: activeElement.styles.backgroundImage
                      }}
                    />
                    {/* Tiny overlay label representing size/repeat preview */}
                    <div className="absolute bottom-1 right-1 bg-black/75 px-1.5 py-0.5 rounded text-[7.5px] font-mono text-zinc-500 border border-zinc-800 leading-none">
                      {bg.multiple ? 'Multiple Layers' : bg.backgrounds[0]?.type.toUpperCase() || 'NONE'}
                    </div>
                  </div>

                  {/* Shorthand / Colors summary */}
                  <div className="space-y-2 text-[10px] font-mono">
                    <div className="flex items-center justify-between text-zinc-500">
                      <span className="text-zinc-600">Base Color</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-200 font-semibold">{bg.color || 'transparent'}</span>
                        {bg.color && bg.color !== 'transparent' && bg.color !== 'rgba(0, 0, 0, 0)' && (
                          <CopyButton value={bg.color} />
                        )}
                      </div>
                    </div>

                    {/* Shorthand display */}
                    {bg.shorthand && (
                      <div className="flex flex-col gap-1 text-zinc-500 pt-1.5 border-t border-[#1f1f23]/40">
                        <span className="text-zinc-600">CSS Shorthand</span>
                        <div className="flex items-center justify-between bg-[#070708] border border-[#1f1f23]/60 rounded px-2.5 py-1">
                          <span className="text-zinc-400 truncate text-[9px] font-semibold max-w-[170px]" title={bg.shorthand}>
                            {bg.shorthand}
                          </span>
                          <CopyButton value={bg.shorthand} />
                        </div>
                      </div>
                    )}

                    {/* Layers breakdown */}
                    <div className="space-y-2.5 pt-2 border-t border-[#1f1f23]/40">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold tracking-wider block">Layers Breakdown</span>
                      {bg.backgrounds.map((layer, idx) => (
                        <div key={idx} className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-400 text-[9px] font-bold">Layer {idx + 1}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${getLayerTypeBadgeClass(layer.type)}`}>
                              {layer.type}
                            </span>
                          </div>

                          <div className="space-y-1.5 text-[9px] pl-1.5 border-l border-zinc-800 text-zinc-400">
                            {layer.type === 'solid' && (
                              <div className="flex justify-between">
                                <span className="text-zinc-600">Solid Color</span>
                                <span className="text-zinc-200 font-semibold">{layer.color}</span>
                              </div>
                            )}

                            {layer.type === 'image' && (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex justify-between items-center">
                                  <span className="text-zinc-600">Image Source</span>
                                  <a 
                                    href={layer.imageUrl} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-[#00f0ff] hover:underline font-semibold"
                                  >
                                    View Image
                                  </a>
                                </div>
                                <span className="text-zinc-500 truncate text-[8.5px] max-w-[200px]" title={layer.imageUrl}>
                                  {layer.imageUrl}
                                </span>
                              </div>
                            )}

                            {layer.type === 'gradient' && layer.gradient && (
                              <div className="space-y-1.5">
                                <div className="flex justify-between">
                                  <span className="text-zinc-600">Gradient Type</span>
                                  <span className="text-zinc-300 font-semibold">{layer.gradient.type}-gradient</span>
                                </div>
                                {layer.gradient.direction && (
                                  <div className="flex justify-between">
                                    <span className="text-zinc-600">Direction / Angle</span>
                                    <span className="text-zinc-300">{layer.gradient.direction}</span>
                                  </div>
                                )}
                                
                                {/* Color stops display */}
                                <div className="space-y-1 pt-1.5 border-t border-zinc-900">
                                  <span className="text-zinc-600 text-[8px] uppercase font-bold tracking-wider block">Gradient Stops</span>
                                  <div className="space-y-1">
                                    {layer.gradient.stops.map((stop, sidx) => (
                                      <div key={sidx} className="flex items-center justify-between pl-1">
                                        <div className="flex items-center gap-1.5">
                                          <div 
                                            className="w-2 h-2 rounded-full border border-zinc-800 shrink-0" 
                                            style={{ backgroundColor: stop.color }}
                                          />
                                          <span className="text-zinc-300 font-mono text-[8.5px] truncate max-w-[130px]" title={stop.color}>
                                            {stop.color}
                                          </span>
                                        </div>
                                        <span className="text-zinc-500 font-semibold">{stop.position || 'auto'}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Shared layer params */}
                            {layer.type !== 'none' && (
                              <div className="pt-1.5 mt-1 border-t border-zinc-900 space-y-1 text-[8.5px]">
                                <div className="flex justify-between">
                                  <span className="text-zinc-600">Position / Size</span>
                                  <span className="text-zinc-300">{layer.position} | {layer.size}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-zinc-600">Repeat / Attachment</span>
                                  <span className="text-zinc-300">{layer.repeat} | {layer.attachment}</span>
                                </div>
                                {layer.blendMode !== 'normal' && (
                                  <div className="flex justify-between">
                                    <span className="text-zinc-600">Blend Mode</span>
                                    <span className="text-zinc-300 font-semibold uppercase">{layer.blendMode}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 7: Shadows */}
          <InspectorCard
            title="Shadows"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v20M2 12h20" strokeDasharray="3 3" />
                <rect x="5" y="5" width="10" height="10" rx="1.5" />
                <rect x="9" y="9" width="10" height="10" rx="1.5" strokeOpacity="0.4" fill="currentColor" fillOpacity="0.1" />
              </svg>
            }
            emptyMessage="No shadows (box-shadow or drop-shadow) detected on this element."
            isEmpty={!activeElement || !activeElement.effects || (activeElement.effects.boxShadows.length === 0 && activeElement.effects.dropShadows.length === 0)}
            placeholderChildren={
              <div className="space-y-2 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Shadow 1</span><span className="text-zinc-400">0px 4px 6px rgba(0, 0, 0, 0.1)</span></div>
              </div>
            }
          >
            {activeElement && activeElement.effects && (() => {
              const { boxShadows, dropShadows } = activeElement.effects;
              const allShadows = [...boxShadows, ...dropShadows];
              return (
                <div className="space-y-3">
                  {allShadows.map((shadow, sIdx) => (
                    <div key={sIdx} className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-2.5 space-y-2 font-mono text-[9px]">
                      {/* Header with Type & Full Copy */}
                      <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                            shadow.type === 'box-shadow'
                              ? shadow.inset
                                ? 'bg-cyan-950 border border-cyan-800 text-cyan-400'
                                : 'bg-blue-950 border border-blue-800 text-blue-400'
                              : 'bg-purple-950 border border-purple-800 text-purple-400'
                          }`}>
                            {shadow.type === 'box-shadow' ? (shadow.inset ? 'box-shadow (inset)' : 'box-shadow') : 'drop-shadow'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[7.5px] text-zinc-600 uppercase font-bold tracking-wider">Full CSS</span>
                          <CopyButton value={shadow.raw} />
                        </div>
                      </div>

                      {/* Values Grid */}
                      <div className="grid grid-cols-5 gap-1.5 text-center">
                        <div className="bg-[#070708] border border-[#1f1f23]/60 p-1 rounded flex flex-col items-center justify-center">
                          <span className="text-zinc-600 text-[7px] uppercase font-bold">X</span>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <span className="text-zinc-300 font-semibold text-[8px] truncate max-w-[32px]">{shadow.offsetX}</span>
                            <CopyButton value={shadow.offsetX} />
                          </div>
                        </div>

                        <div className="bg-[#070708] border border-[#1f1f23]/60 p-1 rounded flex flex-col items-center justify-center">
                          <span className="text-zinc-600 text-[7px] uppercase font-bold">Y</span>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <span className="text-zinc-300 font-semibold text-[8px] truncate max-w-[32px]">{shadow.offsetY}</span>
                            <CopyButton value={shadow.offsetY} />
                          </div>
                        </div>

                        <div className="bg-[#070708] border border-[#1f1f23]/60 p-1 rounded flex flex-col items-center justify-center">
                          <span className="text-zinc-600 text-[7px] uppercase font-bold">Blur</span>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <span className="text-zinc-300 font-semibold text-[8px] truncate max-w-[32px]">{shadow.blurRadius}</span>
                            <CopyButton value={shadow.blurRadius} />
                          </div>
                        </div>

                        <div className={`bg-[#070708] border border-[#1f1f23]/60 p-1 rounded flex flex-col items-center justify-center ${shadow.type === 'drop-shadow' ? 'opacity-25' : ''}`}>
                          <span className="text-zinc-600 text-[7px] uppercase font-bold">Spread</span>
                          {shadow.type === 'box-shadow' ? (
                            <div className="flex items-center gap-0.5 mt-0.5">
                              <span className="text-zinc-300 font-semibold text-[8px] truncate max-w-[32px]">{shadow.spreadRadius}</span>
                              <CopyButton value={shadow.spreadRadius} />
                            </div>
                          ) : (
                            <span className="text-zinc-500 font-semibold mt-0.5">—</span>
                          )}
                        </div>

                        <div className="bg-[#070708] border border-[#1f1f23]/60 p-1 rounded flex flex-col items-center justify-center col-span-1">
                          <span className="text-zinc-600 text-[7px] uppercase font-bold">Color</span>
                          <div className="flex items-center gap-1 mt-0.5 max-w-full overflow-hidden px-0.5">
                            <div 
                              className="w-1.5 h-1.5 rounded-full border border-zinc-800 shrink-0" 
                              style={{ backgroundColor: shadow.color }}
                            />
                            <CopyButton value={shadow.color} />
                          </div>
                        </div>
                      </div>
                      
                      {/* Color label footer */}
                      <div className="flex justify-between items-center text-[7.5px] text-zinc-500 px-1 pt-0.5">
                        <span>Computed Color</span>
                        <span className="text-zinc-400 font-semibold truncate max-w-[130px]">{shadow.color}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 8: Filters & Blending */}
          <InspectorCard
            title="Filters & Blending"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" fillOpacity="0.2" />
              </svg>
            }
            emptyMessage="No filters, blend modes, or opacity modifications detected."
            isEmpty={!activeElement || !activeElement.effects || (
              (activeElement.effects.filter === 'none' || !activeElement.effects.filter) &&
              (activeElement.effects.backdropFilter === 'none' || !activeElement.effects.backdropFilter) &&
              (activeElement.effects.opacity === '1' || !activeElement.effects.opacity) &&
              (activeElement.effects.mixBlendMode === 'normal' || !activeElement.effects.mixBlendMode) &&
              (activeElement.effects.isolation === 'auto' || !activeElement.effects.isolation)
            )}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Opacity</span><span className="text-zinc-400">1</span></div>
              </div>
            }
          >
            {activeElement && activeElement.effects && (() => {
              const eff = activeElement.effects;
              const hasOpacity = eff.opacity !== '1' && eff.opacity !== '';
              const hasFilter = eff.filter !== 'none' && eff.filter !== '';
              const hasBackdrop = eff.backdropFilter !== 'none' && eff.backdropFilter !== '';
              const hasBlend = eff.mixBlendMode !== 'normal' && eff.mixBlendMode !== '';
              const hasIsolation = eff.isolation !== 'auto' && eff.isolation !== '';

              return (
                <div className="space-y-2.5 text-[10px] font-mono">
                  {/* Opacity */}
                  {hasOpacity && (
                    <div className="flex items-center justify-between text-zinc-500">
                      <span className="text-zinc-600">Opacity</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-200 font-semibold">{eff.opacity} ({Math.round(parseFloat(eff.opacity) * 100)}%)</span>
                        <CopyButton value={eff.opacity} />
                      </div>
                    </div>
                  )}

                  {/* Mix Blend Mode */}
                  {hasBlend && (
                    <div className="flex items-center justify-between text-zinc-500">
                      <span className="text-zinc-600">Mix Blend Mode</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-200 font-semibold uppercase tracking-wider text-[9px] bg-zinc-950 border border-zinc-800 px-1 rounded">{eff.mixBlendMode}</span>
                        <CopyButton value={eff.mixBlendMode} />
                      </div>
                    </div>
                  )}

                  {/* Isolation */}
                  {hasIsolation && (
                    <div className="flex items-center justify-between text-zinc-500">
                      <span className="text-zinc-600">Isolation</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-200 font-semibold">{eff.isolation}</span>
                        <CopyButton value={eff.isolation} />
                      </div>
                    </div>
                  )}

                  {/* CSS Filter */}
                  {hasFilter && (
                    <div className="flex flex-col gap-1 text-zinc-500 pt-1.5 border-t border-zinc-900">
                      <span className="text-zinc-600">CSS Filter</span>
                      <div className="flex items-center justify-between bg-[#070708] border border-[#1f1f23]/60 rounded px-2.5 py-1">
                        <span className="text-zinc-400 truncate text-[9px] font-semibold max-w-[170px]" title={eff.filter}>
                          {eff.filter}
                        </span>
                        <CopyButton value={eff.filter} />
                      </div>
                      
                      {/* Sub-filter parameters */}
                      {Object.keys(eff.filters).length > 0 && (
                        <div className="grid grid-cols-2 gap-1.5 mt-1.5 pl-1.5 border-l border-zinc-800">
                          {Object.entries(eff.filters).map(([k, v]) => (
                            <div key={k} className="flex justify-between items-center text-[8.5px] bg-[#070708]/40 px-1.5 py-0.5 rounded">
                              <span className="text-zinc-600 capitalize">{k}</span>
                              <span className="text-zinc-300 font-semibold">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* CSS Backdrop Filter */}
                  {hasBackdrop && (
                    <div className="flex flex-col gap-1 text-zinc-500 pt-1.5 border-t border-zinc-900">
                      <span className="text-zinc-600">Backdrop Filter</span>
                      <div className="flex items-center justify-between bg-[#070708] border border-[#1f1f23]/60 rounded px-2.5 py-1">
                        <span className="text-zinc-400 truncate text-[9px] font-semibold max-w-[170px]" title={eff.backdropFilter}>
                          {eff.backdropFilter}
                        </span>
                        <CopyButton value={eff.backdropFilter} />
                      </div>

                      {/* Sub-backdrop filter parameters */}
                      {Object.keys(eff.backdropFilters).length > 0 && (
                        <div className="grid grid-cols-2 gap-1.5 mt-1.5 pl-1.5 border-l border-zinc-800">
                          {Object.entries(eff.backdropFilters).map(([k, v]) => (
                            <div key={k} className="flex justify-between items-center text-[8.5px] bg-[#070708]/40 px-1.5 py-0.5 rounded">
                              <span className="text-zinc-600 capitalize">{k}</span>
                              <span className="text-zinc-300 font-semibold">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 9: Border Radius */}
          <InspectorCard
            title="Border Radius"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 20V8a4 4 0 0 1 4-4h12" />
              </svg>
            }
            emptyMessage="No border radius detected on this element."
            isEmpty={!activeElement || !activeElement.effects || (
              activeElement.effects.borderRadius.topLeft === '0px' &&
              activeElement.effects.borderRadius.topRight === '0px' &&
              activeElement.effects.borderRadius.bottomRight === '0px' &&
              activeElement.effects.borderRadius.bottomLeft === '0px'
            )}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Border Radius</span><span className="text-zinc-400">0px</span></div>
              </div>
            }
          >
            {activeElement && activeElement.effects && (() => {
              const br = activeElement.effects.borderRadius;
              return (
                <div className="space-y-3 font-mono text-[10px]">
                  {/* Corner visualization block */}
                  <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[80px] flex items-center justify-center p-3 relative shadow-inner">
                    <div 
                      className="w-12 h-12 border-2 border-dashed border-zinc-700 bg-zinc-950 transition-all duration-300"
                      style={{
                        borderTopLeftRadius: br.topLeft,
                        borderTopRightRadius: br.topRight,
                        borderBottomRightRadius: br.bottomRight,
                        borderBottomLeftRadius: br.bottomLeft
                      }}
                    />
                    <div className="absolute top-1 left-2 text-[7px] text-zinc-600 uppercase font-bold">Top-Left</div>
                    <div className="absolute top-1 right-2 text-[7px] text-zinc-600 uppercase font-bold text-right">Top-Right</div>
                    <div className="absolute bottom-1 left-2 text-[7px] text-zinc-600 uppercase font-bold">Bottom-Left</div>
                    <div className="absolute bottom-1 right-2 text-[7px] text-zinc-600 uppercase font-bold text-right">Bottom-Right</div>
                  </div>

                  {/* Corners grid */}
                  <div className="grid grid-cols-2 gap-2 text-zinc-500">
                    <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-1.5 flex flex-col gap-0.5">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">Top Left</span>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-200 font-semibold">{br.topLeft}</span>
                        <CopyButton value={br.topLeft} />
                      </div>
                    </div>
                    
                    <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-1.5 flex flex-col gap-0.5">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">Top Right</span>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-200 font-semibold">{br.topRight}</span>
                        <CopyButton value={br.topRight} />
                      </div>
                    </div>

                    <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-1.5 flex flex-col gap-0.5">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">Bottom Left</span>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-200 font-semibold">{br.bottomLeft}</span>
                        <CopyButton value={br.bottomLeft} />
                      </div>
                    </div>

                    <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-1.5 flex flex-col gap-0.5">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">Bottom Right</span>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-200 font-semibold">{br.bottomRight}</span>
                        <CopyButton value={br.bottomRight} />
                      </div>
                    </div>
                  </div>

                  {/* Raw shorthand */}
                  <div className="flex flex-col gap-1 text-zinc-500 pt-1.5 border-t border-zinc-900">
                    <span className="text-zinc-600">Shorthand `border-radius`</span>
                    <div className="flex items-center justify-between bg-[#070708] border border-[#1f1f23]/60 rounded px-2.5 py-1">
                      <span className="text-zinc-400 truncate text-[9px] font-semibold max-w-[170px]" title={br.raw}>
                        {br.raw}
                      </span>
                      <CopyButton value={br.raw} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 10: Export Engine */}
          <InspectorCard
            title="Export Engine"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
            }
            emptyMessage="No active element selected to export."
            isEmpty={!activeElement}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Export Report</span><span className="text-zinc-400">Not Ready</span></div>
              </div>
            }
          >
            {activeElement && (() => {
              const handleCopyJSON = () => {
                const report = generateJSONReport(activeElement, activeTab?.url || '');
                navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                addDevLog('system', 'EXPORT_JSON', 'JSON report copied to clipboard.');
              };

              const handleDownloadJSON = () => {
                const report = generateJSONReport(activeElement, activeTab?.url || '');
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'design-inspector-export.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                addDevLog('system', 'DOWNLOAD_JSON', 'JSON report download triggered.');
              };

              const handleCopyCSS = () => {
                const cssStr = generateCleanCSS(activeElement);
                navigator.clipboard.writeText(cssStr);
                addDevLog('system', 'EXPORT_CSS', 'Clean CSS rules copied to clipboard.');
              };

              const handleCopyTailwind = () => {
                const twStr = generateTailwindSummary(activeElement);
                navigator.clipboard.writeText(twStr);
                addDevLog('system', 'EXPORT_TAILWIND', 'Tailwind-like classes copied to clipboard.');
              };

              const previewSnippet = {
                meta: {
                  url: activeTab?.url ? (activeTab.url.length > 25 ? activeTab.url.substring(0, 25) + '...' : activeTab.url) : 'unknown',
                  timestamp: new Date().toISOString()
                },
                element: {
                  tagName: activeElement.tagName,
                  id: activeElement.id || undefined,
                  className: activeElement.className || undefined
                }
              };

              return (
                <div className="space-y-3 font-mono text-[10px]">
                  {/* Visual JSON snippet preview */}
                  <div className="relative">
                    <span className="text-zinc-600 text-[8px] uppercase font-bold tracking-wider block mb-1">Export Preview</span>
                    <pre className="bg-[#050506] border border-[#1f1f23] rounded-md p-2.5 font-mono text-[8.5px] text-zinc-400 overflow-x-auto whitespace-pre select-text leading-relaxed">
                      <code>{JSON.stringify(previewSnippet, null, 2)}</code>
                    </pre>
                  </div>

                  {/* Action buttons grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={handleCopyJSON}
                      className="bg-zinc-950 hover:bg-zinc-900 border border-[#1f1f23] hover:border-[#00f0ff]/30 text-zinc-300 hover:text-white transition-all rounded py-2 px-2 text-[9px] font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-500">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy JSON</span>
                    </button>

                    <button
                      onClick={handleDownloadJSON}
                      className="bg-zinc-950 hover:bg-zinc-900 border border-[#1f1f23] hover:border-[#00f0ff]/30 text-zinc-300 hover:text-white transition-all rounded py-2 px-2 text-[9px] font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-500">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                      <span>Download JSON</span>
                    </button>

                    <button
                      onClick={handleCopyCSS}
                      className="bg-zinc-950 hover:bg-zinc-900 border border-[#1f1f23] hover:border-[#a855f7]/30 text-zinc-300 hover:text-white transition-all rounded py-2 px-2 text-[9px] font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-400/80">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                      <span>Copy CSS</span>
                    </button>

                    <button
                      onClick={handleCopyTailwind}
                      className="bg-[#38bdf8]/5 hover:bg-[#38bdf8]/10 border border-[#38bdf8]/20 hover:border-[#38bdf8]/60 text-[#38bdf8] transition-all rounded py-2 px-2 text-[9px] font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#38bdf8]">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
                        <path d="M12 6v12M6 12h12" />
                      </svg>
                      <span>Copy Tailwind</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 11: Design Tokens */}
          <InspectorCard
            title="Design Tokens"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            }
            emptyMessage="No active element selected to infer tokens."
            isEmpty={!activeElement}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Tokens inferred</span><span className="text-zinc-400">None</span></div>
              </div>
            }
          >
            {activeElement && (() => {
              const report = inferDesignTokens(activeElement, tokenSystem);
              return (
                <div className="space-y-3 font-mono text-[10px]">
                  {/* System Toggle Tabs */}
                  <div className="flex border-b border-[#1f1f23] gap-4">
                    {(['semantic', 'tailwind', 'material'] as const).map((sys) => (
                      <button
                        key={sys}
                        onClick={() => setTokenSystem(sys)}
                        className={`text-[9px] font-bold uppercase tracking-wider pb-1.5 border-b-2 cursor-pointer transition-all ${
                          tokenSystem === sys
                            ? 'border-[#00f0ff] text-[#00f0ff]'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {sys}
                      </button>
                    ))}
                  </div>

                  {/* Tokens list */}
                  <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                    {report.tokens.length === 0 ? (
                      <div className="text-zinc-600 text-center py-4 text-[9px] uppercase tracking-widest">No tokens inferred for this system.</div>
                    ) : (
                      report.tokens.map((token, idx) => (
                        <div key={idx} className="flex flex-col gap-1 py-1.5 border-b border-[#1f1f23]/40 last:border-0 text-[9.5px]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-[7.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                token.category === 'typography' ? 'bg-blue-950 border border-blue-900/60 text-blue-400' :
                                token.category === 'color' ? 'bg-emerald-950 border border-emerald-900/60 text-emerald-400' :
                                token.category === 'spacing' ? 'bg-amber-950 border border-amber-900/60 text-amber-400' :
                                token.category === 'radius' ? 'bg-purple-950 border border-purple-900/60 text-purple-400' :
                                token.category === 'shadow' ? 'bg-cyan-950 border border-cyan-900/60 text-cyan-400' :
                                'bg-zinc-950 border border-zinc-800 text-zinc-400'
                              }`}>
                                {token.category}
                              </span>
                              <span className="text-zinc-200 font-semibold">{token.tokenName}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-zinc-400 font-semibold">{token.value}</span>
                              <CopyButton value={token.value} />
                            </div>
                          </div>
                          <span className="text-zinc-500 text-[8.5px] pl-1.5 border-l border-zinc-800 leading-tight">
                            {token.role}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 12: Typography Intelligence */}
          <InspectorCard
            title="Typography Intelligence"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 7V4h16v3M9 20h6M12 4v16" />
              </svg>
            }
            emptyMessage={!activeElement ? "No active element selected to analyze typography." : "Computing typography intelligence..."}
            isEmpty={!activeElement || !activeElement.typographyIntelligence}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Typography Intelligence</span><span className="text-zinc-400">Not Ready</span></div>
              </div>
            }
          >
            {activeElement && activeElement.typographyIntelligence && (() => {
              const ti = activeElement.typographyIntelligence;
              const textContent = selectedElement?.textContent || '';
              return (
                <div className="space-y-3.5 font-mono text-[10px]">
                  {/* Style Preview & Classification */}
                  <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-3 flex flex-col gap-2 relative overflow-hidden">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-wider">Classification</span>
                      <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-blue-950/60 border border-blue-900/60 text-blue-400 font-mono">
                        {ti.classification}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-center py-4 bg-[#0a0a0c] rounded border border-[#1f1f23]/40 font-sans">
                      <span 
                        className="text-center truncate px-3"
                        style={{
                          fontFamily: activeElement.styles.fontFamily || 'inherit',
                          fontWeight: activeElement.styles.fontWeight || 'normal',
                          fontSize: '18px',
                          color: activeElement.styles.color || '#fafafa',
                          lineHeight: '1.2',
                          letterSpacing: activeElement.styles.letterSpacing || 'normal',
                        }}
                      >
                        {textContent ? (textContent.length > 25 ? textContent.substring(0, 25) + '...' : textContent) : 'Aa Preview'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[8px] text-zinc-500 mt-0.5 pt-1.5 border-t border-[#1f1f23]/40">
                      <span>Size: <strong className="text-zinc-300 font-semibold">{activeElement.styles.fontSize}</strong></span>
                      <span>Line-Height: <strong className="text-zinc-300 font-semibold">{activeElement.styles.lineHeight}</strong></span>
                      <span>Weight: <strong className="text-zinc-300 font-semibold">{activeElement.styles.fontWeight}</strong></span>
                    </div>
                  </div>

                  {/* Reading Comfort Progress Meter */}
                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-zinc-500 font-bold uppercase tracking-wider">Reading Comfort</span>
                      <span className={`font-bold ${
                        ti.readingComfort.level === 'Excellent' || ti.readingComfort.level === 'Good' ? 'text-emerald-400' :
                        ti.readingComfort.level === 'Moderate' ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        {ti.readingComfort.level} ({ti.readingComfort.score}%)
                      </span>
                    </div>
                    
                    <div className="h-1.5 w-full bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          ti.readingComfort.level === 'Excellent' || ti.readingComfort.level === 'Good' ? 'bg-emerald-500' :
                          ti.readingComfort.level === 'Moderate' ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${ti.readingComfort.score}%` }}
                      />
                    </div>
                    
                    <p className="text-[8.5px] text-zinc-500 leading-relaxed pl-1.5 border-l border-zinc-800 italic">
                      {ti.readingComfort.feedback}
                    </p>
                  </div>

                  {/* Accessibility & Contrast */}
                  <div className="space-y-2 pt-2.5 border-t border-[#1f1f23]/40">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-zinc-500 font-bold uppercase tracking-wider">Accessibility (WCAG)</span>
                      <span className="text-zinc-400 font-bold font-mono text-[9px]">
                        Ratio: <span className="text-[#00f0ff]">{ti.accessibility.contrastRatio}</span>
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <span className={`text-[7.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                        ti.accessibility.contrastLevel === 'AAA Passed' ? 'bg-emerald-950 border border-emerald-900/60 text-emerald-400' :
                        ti.accessibility.contrastLevel === 'AA Passed' ? 'bg-cyan-950 border border-cyan-900/60 text-cyan-400' :
                        ti.accessibility.contrastLevel === 'Failed' ? 'bg-rose-950 border border-rose-900/60 text-rose-400' :
                        'bg-zinc-950 border border-zinc-800 text-zinc-500'
                      }`}>
                        {ti.accessibility.contrastLevel}
                      </span>

                      <span className={`text-[7.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                        ti.accessibility.sizeCompliant 
                          ? 'bg-emerald-950/40 border border-emerald-900/40 text-emerald-500' 
                          : 'bg-rose-950/60 border border-rose-900/60 text-rose-400'
                      }`}>
                        {ti.accessibility.sizeCompliant ? 'Size Compliant (≥12px)' : 'Sizing Alert (<12px)'}
                      </span>
                    </div>

                    <p className="text-[8.5px] text-zinc-500 leading-relaxed pl-1.5 border-l border-zinc-800 italic">
                      {ti.accessibility.feedback}
                    </p>
                  </div>

                  {/* Visual Hierarchy Dominance Scale */}
                  <div className="space-y-2 pt-2.5 border-t border-[#1f1f23]/40">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Hierarchy Dominance</span>
                    <div className="flex gap-4 items-stretch bg-[#050506] border border-[#1f1f23] rounded-md p-3">
                      {/* Vertical bars representing levels */}
                      <div className="flex flex-col gap-0.5 w-4 shrink-0 select-none justify-between">
                        {Array.from({ length: 10 }, (_, i) => 10 - i).map((lvl) => {
                          const isActive = ti.hierarchyLevel >= lvl;
                          const activeBgColor = lvl > 7 ? 'bg-purple-500 shadow-[0_0_4px_rgba(168,85,247,0.4)]' : 
                                                lvl > 4 ? 'bg-indigo-500 shadow-[0_0_4px_rgba(99,102,241,0.4)]' : 
                                                'bg-cyan-500 shadow-[0_0_4px_rgba(6,182,212,0.4)]';
                          return (
                            <div 
                              key={lvl} 
                              className={`h-1 rounded transition-all duration-300 ${
                                isActive ? activeBgColor : 'bg-zinc-950 border border-zinc-900'
                              }`}
                              title={`Level ${lvl}`}
                            />
                          );
                        })}
                      </div>

                      {/* Explanation */}
                      <div className="flex flex-col justify-between py-0.5 text-[9px] flex-1">
                        <div>
                          <div className="flex items-center gap-1.5 font-bold">
                            <span className="text-zinc-200">Level {ti.hierarchyLevel}</span>
                            <span className="text-zinc-500">/ 10</span>
                            <span className={`text-[7.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                              ti.hierarchyLevel >= 8 ? 'bg-purple-950 border border-purple-900/60 text-purple-400' :
                              ti.hierarchyLevel >= 5 ? 'bg-indigo-950 border border-indigo-900/60 text-indigo-400' :
                              'bg-cyan-950 border border-cyan-900/60 text-cyan-400'
                            }`}>
                              {ti.hierarchyLevel >= 8 ? 'Dominant' :
                               ti.hierarchyLevel >= 5 ? 'Structural' :
                               'Supporting'}
                            </span>
                          </div>
                          <p className="text-zinc-500 mt-1 leading-relaxed text-[8.5px]">
                            {ti.hierarchyLevel >= 8 ? 'Strong visual anchor. Attracts immediate user focus on page load.' :
                             ti.hierarchyLevel >= 5 ? 'Defines section headers and layout structure.' :
                             'Supporting body text or auxiliary UI elements.'}
                          </p>
                        </div>

                        <div className="text-[7.5px] font-bold text-zinc-600 uppercase tracking-wider flex justify-between mt-2 pt-2 border-t border-zinc-900 w-full">
                          <span>10 - Peak Focus</span>
                          <span>1 - Min Focus</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 13: Color Intelligence */}
          <InspectorCard
            title="Color Intelligence"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M7.5 10.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-9 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
              </svg>
            }
            emptyMessage={!activeElement ? "No active element selected to analyze colors." : "Computing color intelligence..."}
            isEmpty={!activeElement || !activeElement.colorIntelligence}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Color Intelligence</span><span className="text-zinc-400">Not Ready</span></div>
              </div>
            }
          >
            {activeElement && activeElement.colorIntelligence && (() => {
              const ci = activeElement.colorIntelligence;
              return (
                <div className="space-y-4 font-mono text-[10px]">
                  {/* Colors List / Usage Grid */}
                  <div className="space-y-2">
                    <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-wider block">Element Color Usage</span>
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {ci.colors.map((item, idx) => (
                        <div key={idx} className="flex flex-col gap-1.5 p-2 bg-[#050506] border border-[#1f1f23] rounded-md text-[9.5px]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {/* Color Swatch */}
                              <div className="relative w-3.5 h-3.5 rounded border border-zinc-800 overflow-hidden shrink-0 checkerboard-bg">
                                <div 
                                  className="absolute inset-0" 
                                  style={{ backgroundColor: item.color.rgb }} 
                                />
                              </div>
                              <span className="text-zinc-400 font-bold uppercase text-[8px] tracking-wider px-1.5 py-0.2 bg-zinc-950 border border-zinc-900 rounded">
                                {item.usage}
                              </span>
                              <span className="text-zinc-200 font-semibold">{item.color.hex.toUpperCase()}</span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[8px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider bg-blue-950 border border-blue-900/60 text-blue-400">
                                {item.tokenName}
                              </span>
                              <CopyButton value={item.color.hex} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[8px] text-zinc-500 pl-1 border-l border-zinc-800 leading-tight">
                            <span className="truncate max-w-[170px]" title={item.description}>{item.description}</span>
                            <span>Conf: {item.confidence}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contrast Checker Section */}
                  {ci.contrast && (
                    <div className="space-y-2 pt-2.5 border-t border-[#1f1f23]/40">
                      <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-wider block">Contrast Compliance</span>
                      <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2.5 space-y-3">
                        {/* Live Comparison Box */}
                        <div 
                          className="rounded border border-zinc-900/80 p-3 text-center flex items-center justify-center font-sans text-xs transition-all duration-300"
                          style={{ 
                            backgroundColor: activeElement.colors.background?.rgb || '#000000',
                            color: activeElement.colors.text?.rgb || '#ffffff'
                          }}
                        >
                          <span className="font-semibold tracking-wide">Contrast Preview Sample</span>
                        </div>

                        {/* Ratio Display */}
                        <div className="flex justify-between items-center">
                          <span className="text-[8.5px] text-zinc-500">WCAG Contrast Ratio</span>
                          <span className="text-sm font-bold text-white font-mono">{ci.contrast.ratio}</span>
                        </div>

                        {/* Badges Grid */}
                        <div className="grid grid-cols-2 gap-2 text-[8px] font-bold uppercase tracking-wider">
                          <div className="flex flex-col gap-1 bg-[#0a0a0c] border border-zinc-900 p-1.5 rounded">
                            <span className="text-zinc-600">Normal Text</span>
                            <div className="flex gap-1.5 mt-0.5">
                              <span className={`px-1.5 py-0.2 rounded ${ci.contrast.normalTextCompliant.aa ? 'bg-emerald-950/60 border border-emerald-900/40 text-emerald-400' : 'bg-rose-950/60 border border-rose-900/40 text-rose-400'}`}>
                                AA {ci.contrast.normalTextCompliant.aa ? 'Pass' : 'Fail'}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded ${ci.contrast.normalTextCompliant.aaa ? 'bg-emerald-950/60 border border-emerald-900/40 text-emerald-400' : 'bg-rose-950/60 border border-rose-900/40 text-rose-400'}`}>
                                AAA {ci.contrast.normalTextCompliant.aaa ? 'Pass' : 'Fail'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 bg-[#0a0a0c] border border-zinc-900 p-1.5 rounded">
                            <span className="text-zinc-600">Large Text (18px+)</span>
                            <div className="flex gap-1.5 mt-0.5">
                              <span className={`px-1.5 py-0.2 rounded ${ci.contrast.largeTextCompliant.aa ? 'bg-emerald-950/60 border border-emerald-900/40 text-emerald-400' : 'bg-rose-950/60 border border-rose-900/40 text-rose-400'}`}>
                                AA {ci.contrast.largeTextCompliant.aa ? 'Pass' : 'Fail'}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded ${ci.contrast.largeTextCompliant.aaa ? 'bg-emerald-950/60 border border-emerald-900/40 text-emerald-400' : 'bg-rose-950/60 border border-rose-900/40 text-rose-400'}`}>
                                AAA {ci.contrast.largeTextCompliant.aaa ? 'Pass' : 'Fail'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Feedback Text */}
                        <p className="text-[8.5px] text-zinc-500 leading-relaxed pl-1.5 border-l border-zinc-800 italic">
                          {ci.contrast.feedback}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 14: Spacing Intelligence */}
          <InspectorCard
            title="Spacing Intelligence"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 16V8a2 2 0 0 0-2-2h-5M3 8v8a2 2 0 0 0 2 2h5" />
                <path d="M10 12h4" />
              </svg>
            }
            emptyMessage={!activeElement ? "No active element selected to analyze spacing." : "Computing spacing intelligence..."}
            isEmpty={!activeElement || !activeElement.spacingIntelligence}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Spacing Intelligence</span><span className="text-zinc-400">Not Ready</span></div>
              </div>
            }
          >
            {activeElement && activeElement.spacingIntelligence && (() => {
              const si = activeElement.spacingIntelligence;
              
              // Calculate consistency score dynamically against history
              const activeSpacing = si.spacingItems || [];
              let consistencyVal = 100;
              if (spacingHistory.length > 0 && activeSpacing.length > 0) {
                let matched = 0;
                activeSpacing.forEach((it) => {
                  if (spacingHistory.includes(it.valuePx)) {
                    matched++;
                  }
                });
                consistencyVal = Math.round((matched / activeSpacing.length) * 100);
              }

              return (
                <div className="space-y-4 font-mono text-[10px]">
                  {/* Spacing Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Grid Compliance */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2 flex flex-col gap-1">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">8pt Grid Compliance</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-sm font-bold text-white">{si.gridComplianceScore}%</span>
                        <span className={`text-[7.5px] font-bold px-1 py-0.2 rounded uppercase tracking-wider ${
                          si.gridComplianceScore === 100 ? 'bg-emerald-950/60 border border-emerald-900/40 text-emerald-400' :
                          si.gridComplianceScore >= 70 ? 'bg-cyan-950/60 border border-cyan-900/40 text-cyan-400' :
                          'bg-rose-950/60 border border-rose-900/40 text-rose-400'
                        }`}>
                          {si.gridComplianceScore === 100 ? 'Strict' :
                           si.gridComplianceScore >= 70 ? 'Partial' : 'Fluid'}
                        </span>
                      </div>
                    </div>

                    {/* Site Consistency */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2 flex flex-col gap-1">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">Spacing Consistency</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-sm font-bold text-white">{consistencyVal}%</span>
                        <span className={`text-[7.5px] font-bold px-1 py-0.2 rounded uppercase tracking-wider ${
                          consistencyVal >= 90 ? 'bg-emerald-950/60 border border-emerald-900/40 text-emerald-400' :
                          consistencyVal >= 60 ? 'bg-cyan-950/60 border border-cyan-900/40 text-cyan-400' :
                          'bg-amber-950/60 border border-amber-900/40 text-amber-400'
                        }`}>
                          {consistencyVal >= 90 ? 'High' :
                           consistencyVal >= 60 ? 'Moderate' : 'Draft'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Spacing Map / Strip Visualizer */}
                  <div className="space-y-2">
                    <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-wider block">Visual Spacing Map</span>
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2.5 space-y-3.5">
                      {activeSpacing.length === 0 ? (
                        <div className="text-center py-4 text-[9px] text-zinc-600 uppercase tracking-widest">No active spacing properties applied.</div>
                      ) : (
                        activeSpacing.map((item, idx) => {
                          // Calculate width percentage relative to 32px baseline
                          const pct = Math.min(100, Math.round((item.valuePx / 32) * 100));
                          
                          // Style color properties based on type
                          const barBg = item.type === 'margin' ? 'bg-amber-500/80 border-amber-500/30' :
                                        item.type === 'padding' ? 'bg-emerald-500/80 border-emerald-500/30' :
                                        'bg-cyan-500/80 border-cyan-500/30';
                          const typeLabel = item.type === 'margin' ? 'Margin' :
                                            item.type === 'padding' ? 'Padding' : 'Gap';
                          const dirLabel = item.direction === 'all' ? '' : ` ${item.direction}`;

                          return (
                            <div key={idx} className="space-y-1 text-[9px]">
                              {/* Spacing labels row */}
                              <div className="flex justify-between text-zinc-400 font-sans">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    item.type === 'margin' ? 'bg-amber-500' :
                                    item.type === 'padding' ? 'bg-emerald-500' : 'bg-cyan-500'
                                  }`} />
                                  <span className="font-semibold text-zinc-300 capitalize">{typeLabel}{dirLabel}</span>
                                </div>
                                <div className="flex items-center gap-1 font-mono text-[9.5px]">
                                  <span className="text-[#00f0ff] font-bold">{item.valuePx}px</span>
                                  <span className="text-zinc-600">/</span>
                                  <span className="text-zinc-400 font-semibold">{item.tokenName}</span>
                                </div>
                              </div>

                              {/* Relative Progress Strip */}
                              <div className="h-2 w-full bg-zinc-950 border border-zinc-900/60 rounded overflow-hidden relative">
                                <div 
                                  className={`h-full border-r transition-all duration-500 ${barBg}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Feedback Guidance */}
                  <p className="text-[8.5px] text-zinc-500 leading-relaxed pl-1.5 border-l border-zinc-800 italic pt-1">
                    {si.gridFeedback}
                  </p>
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 15: Border Radius Intelligence */}
          <InspectorCard
            title="Border Radius Intelligence"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="4" />
              </svg>
            }
            emptyMessage={!activeElement ? "No active element selected to analyze border-radius." : "Computing border-radius intelligence..."}
            isEmpty={!activeElement || !activeElement.borderRadiusIntelligence}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Border Radius Intelligence</span><span className="text-zinc-400">Not Ready</span></div>
              </div>
            }
          >
            {activeElement && activeElement.borderRadiusIntelligence && (() => {
              const bri = activeElement.borderRadiusIntelligence;

              // Calculate dynamic consistency score
              const currentRads = [bri.raw.topLeft, bri.raw.topRight, bri.raw.bottomRight, bri.raw.bottomLeft].filter(r => r !== '0px' && r !== '0');
              let consistencyVal = 100;
              if (radiusHistory.length > 0 && currentRads.length > 0) {
                let matched = 0;
                currentRads.forEach((rad) => {
                  if (radiusHistory.includes(rad)) {
                    matched++;
                  }
                });
                consistencyVal = Math.round((matched / currentRads.length) * 100);
              }

              return (
                <div className="space-y-3.5 font-mono text-[10px]">
                  {/* Style Preview & Classification */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-zinc-500 font-bold uppercase tracking-wider">Classification</span>
                      <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-blue-950/60 border border-blue-900/60 text-blue-400 font-mono">
                        {bri.classification}
                      </span>
                    </div>

                    {/* Preview Box */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[100px] flex items-center justify-center p-4 relative shadow-inner">
                      <div 
                        className="w-16 h-16 bg-gradient-to-tr from-cyan-500/10 to-purple-500/10 border-2 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-all duration-300"
                        style={{
                          borderTopLeftRadius: bri.raw.topLeft,
                          borderTopRightRadius: bri.raw.topRight,
                          borderBottomRightRadius: bri.raw.bottomRight,
                          borderBottomLeftRadius: bri.raw.bottomLeft
                        }}
                      />
                      <div className="absolute top-1 left-2 text-[7px] text-zinc-600 uppercase font-bold">Top-Left</div>
                      <div className="absolute top-1 right-2 text-[7px] text-zinc-600 uppercase font-bold text-right">Top-Right</div>
                      <div className="absolute bottom-1 left-2 text-[7px] text-zinc-600 uppercase font-bold">Bottom-Left</div>
                      <div className="absolute bottom-1 right-2 text-[7px] text-zinc-600 uppercase font-bold text-right">Bottom-Right</div>
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Compliance */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2 flex flex-col gap-1">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">Grid Scale Alignment</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-[11px] font-bold text-white">{bri.gridCompliance ? 'Standard (2px/4px)' : 'Non-Standard'}</span>
                        <span className={`text-[7px] font-bold px-1 py-0.2 rounded uppercase tracking-wider ${
                          bri.gridCompliance ? 'bg-emerald-950/60 border border-emerald-900/40 text-emerald-400' : 'bg-amber-950/60 border border-amber-900/40 text-amber-400'
                        }`}>
                          {bri.gridCompliance ? 'Pass' : 'Audit'}
                        </span>
                      </div>
                    </div>

                    {/* Consistency */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2 flex flex-col gap-1">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">Radius Consistency</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-sm font-bold text-white">{consistencyVal}%</span>
                        <span className={`text-[7px] font-bold px-1 py-0.2 rounded uppercase tracking-wider ${
                          consistencyVal >= 90 ? 'bg-emerald-950/60 border border-emerald-900/40 text-emerald-400' :
                          consistencyVal >= 60 ? 'bg-cyan-950/60 border border-cyan-900/40 text-cyan-400' :
                          'bg-amber-950/60 border border-amber-900/40 text-amber-400'
                        }`}>
                          {consistencyVal >= 90 ? 'High' :
                           consistencyVal >= 60 ? 'Moderate' : 'Fluid'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Corners List */}
                  <div className="space-y-1.5 pt-0.5">
                    <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-wider block">Individual Corners</span>
                    <div className="grid grid-cols-2 gap-2 text-zinc-500">
                      {[
                        { label: 'Top Left', value: bri.raw.topLeft, token: bri.corners.topLeft },
                        { label: 'Top Right', value: bri.raw.topRight, token: bri.corners.topRight },
                        { label: 'Bottom Left', value: bri.raw.bottomLeft, token: bri.corners.bottomLeft },
                        { label: 'Bottom Right', value: bri.raw.bottomRight, token: bri.corners.bottomRight }
                      ].map((item, idx) => (
                        <div key={idx} className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-1.5 flex flex-col gap-0.5 text-[9px]">
                          <span className="text-zinc-600 text-[7.5px] uppercase font-bold">{item.label}</span>
                          <div className="flex items-center justify-between mt-0.5">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-zinc-200 font-semibold truncate max-w-[45px]">{item.value}</span>
                              <span className={`text-[7px] font-bold px-1 py-0.2 rounded uppercase tracking-wider ${
                                item.token === 'Sharp' ? 'bg-zinc-950 border border-zinc-900 text-zinc-500' :
                                item.token === 'Small' ? 'bg-blue-950/40 border border-blue-900/40 text-blue-400' :
                                item.token === 'Medium' ? 'bg-cyan-950/40 border border-cyan-900/40 text-cyan-400' :
                                item.token === 'Large' ? 'bg-purple-950/40 border border-purple-900/40 text-purple-400' :
                                'bg-emerald-950/40 border border-emerald-900/40 text-emerald-400'
                              }`}>
                                {item.token}
                              </span>
                            </div>
                            <CopyButton value={item.value} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Feedback Guidance */}
                  <p className="text-[8.5px] text-zinc-500 leading-relaxed pl-1.5 border-l border-zinc-800 italic pt-1">
                    {bri.classification === 'Sharp' ? 'Zero rounding. Provides high precision and structural contrast.' :
                     bri.classification === 'Mixed' ? 'Asymmetric rounding is optimized for layout attachments or tab styling.' :
                     bri.classification === 'Circle' ? 'Circular clipping creates visual focal points, ideal for avatars.' :
                     bri.classification === 'Pill' ? 'High pill-rounding delivers soft visual flow, standard for badges.' :
                     'Standard rounded corners matching brand system scales.'}
                  </p>
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 16: Shadow Intelligence */}
          <InspectorCard
            title="Shadow Intelligence"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
            emptyMessage={!activeElement ? "No active element selected to analyze shadows." : "Computing shadow intelligence..."}
            isEmpty={!activeElement || !activeElement.shadowIntelligence}
            placeholderChildren={
              <div className="space-y-1.5 text-[10px] font-mono opacity-30">
                <div className="flex justify-between text-zinc-500"><span className="text-zinc-600">Shadow Intelligence</span><span className="text-zinc-400">Not Ready</span></div>
              </div>
            }
          >
            {activeElement && activeElement.shadowIntelligence && (() => {
              const si = activeElement.shadowIntelligence;
              return (
                <div className="space-y-3.5 font-mono text-[10px]">
                  {/* Style Preview & Classification */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-zinc-500 font-bold uppercase tracking-wider">Classification</span>
                      <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-blue-950/60 border border-blue-900/60 text-blue-400 font-mono">
                        {si.classification}
                      </span>
                    </div>

                    {/* Shadow Preview Box */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md h-[120px] flex items-center justify-center p-4 relative shadow-inner overflow-hidden">
                      <div 
                        className="w-24 h-12 bg-[#0c0c0e] border border-[#1f1f23] rounded-md transition-all duration-300 flex items-center justify-center text-[8px] text-zinc-600 font-sans"
                        style={{
                          boxShadow: activeElement.styles.boxShadow || 'none',
                          filter: activeElement.styles.filter || 'none',
                          borderRadius: activeElement.styles.borderRadius || '4px'
                        }}
                      >
                        Float Card
                      </div>
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Elevation Level */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2 flex flex-col gap-1">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">Elevation Level</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-sm font-bold text-white">Level {si.elevationLevel}</span>
                        <span className={`text-[7px] font-bold px-1 py-0.2 rounded uppercase tracking-wider ${
                          si.elevationLevel === 0 ? 'bg-zinc-950 border border-zinc-900 text-zinc-500' :
                          si.elevationLevel <= 2 ? 'bg-cyan-950/60 border border-cyan-900/40 text-cyan-400' :
                          'bg-purple-950/60 border border-purple-900/40 text-purple-400'
                        }`}>
                          {si.elevationLevel === 0 ? 'Flat' :
                           si.elevationLevel <= 2 ? 'Low' : 'High'}
                        </span>
                      </div>
                    </div>

                    {/* Glassmorphic Check */}
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2 flex flex-col gap-1">
                      <span className="text-zinc-600 text-[8px] uppercase font-bold">Glassmorphism Signature</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-[11px] font-bold text-white">{si.hasGlassEffect ? 'Detected' : 'Not Present'}</span>
                        {si.hasGlassEffect && (
                          <span className="text-[7px] font-bold px-1 py-0.2 rounded uppercase tracking-wider bg-purple-950 border border-purple-900/60 text-purple-400">
                            Glass
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Shadow Layers List */}
                  <div className="space-y-1.5 pt-0.5">
                    <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-wider block">Parsed Shadow Layers ({si.shadowsCount})</span>
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                      {si.layers.length === 0 ? (
                        <div className="text-center py-4 text-[9px] text-zinc-600 uppercase tracking-widest">No shadow layers found.</div>
                      ) : (
                        si.layers.map((layer, idx) => (
                          <div key={idx} className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-2 flex flex-col gap-1.5 text-[9.5px]">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[7px] font-bold px-1 py-0.2 rounded uppercase tracking-wider ${
                                  layer.type === 'box-shadow' ? 'bg-cyan-950 border border-cyan-900/60 text-cyan-400' : 'bg-purple-950 border border-purple-900/60 text-purple-400'
                                }`}>
                                  {layer.type === 'box-shadow' ? 'Box' : 'Drop'}
                                </span>
                                {layer.inset && (
                                  <span className="text-[7px] font-bold px-1 py-0.2 rounded uppercase tracking-wider bg-rose-950 border border-rose-900/60 text-rose-400">
                                    Inset
                                  </span>
                                )}
                                <span className="text-zinc-400 font-semibold">{layer.color}</span>
                              </div>
                              <CopyButton value={layer.raw} />
                            </div>
                            <div className="grid grid-cols-4 gap-1 text-[8.5px] text-zinc-500 font-mono pl-1 border-l border-zinc-800 leading-tight">
                              <div>X: <strong className="text-zinc-300 font-semibold">{layer.offsetX}</strong></div>
                              <div>Y: <strong className="text-zinc-300 font-semibold">{layer.offsetY}</strong></div>
                              <div>Blur: <strong className="text-zinc-300 font-semibold">{layer.blurRadius}</strong></div>
                              {layer.type === 'box-shadow' && (
                                <div>Spread: <strong className="text-zinc-300 font-semibold">{layer.spreadRadius}</strong></div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Feedback Guidance */}
                  <p className="text-[8.5px] text-zinc-500 leading-relaxed pl-1.5 border-l border-zinc-800 italic pt-1">
                    {si.classification === 'Glass Effect' ? 'Glassmorphic card detected. Uses soft backdrop blurring and layered opacity.' :
                     si.classification === 'None' ? 'Flat design style with zero shadow projection. Ideal for nested buttons or minimalist structures.' :
                     si.classification === 'Small' ? 'Subtle projection suitable for interactive elements like hover-states or input boxes.' :
                     si.classification === 'Medium' ? 'Balanced depth suitable for standard container cards and floating buttons.' :
                     si.classification === 'Floating Card' ? 'Pronounced depth suitable for dropdown select menus, popovers, or hover cards.' :
                     'Maximum depth. Projects high visual elevation suitable for popups and dialog modals.'}
                  </p>
                </div>
              );
            })()}
          </InspectorCard>

          {/* Card 17: Design System Summary */}
          {inspectedElements.length > 0 && (() => {
            const font = getPrimaryFont();
            const colors = getTopColors();
            const spacing = getTopSpacing();
            const radii = getTopRadii();
            const shadows = getTopShadows();

            return (
              <InspectorCard
                title="Design System Summary"
                icon={
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                }
                emptyMessage="No elements analyzed in this session. Start by inspecting elements."
                isEmpty={false}
              >
                <div className="space-y-4 font-mono text-[10px]">
                  {/* Dashboard Header */}
                  <div className="flex items-center justify-between border-b border-[#1f1f23]/60 pb-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-wider">Analyzed session pool</span>
                      <span className="text-zinc-200 font-bold text-[11px] font-sans">
                        {inspectedElements.length} {inspectedElements.length === 1 ? 'element' : 'elements'}
                      </span>
                    </div>
                    <button
                      onClick={() => setInspectedElements([])}
                      className="text-[8px] bg-red-950/20 border border-red-900/30 hover:bg-red-950/40 hover:border-red-500/50 text-red-400 font-bold px-2 py-0.5 rounded uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Clear Pool
                    </button>
                  </div>

                  {/* Typography Subsection */}
                  <div className="space-y-2">
                    <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-wider block">1. Typography Scale</span>
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-600">Primary Font</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#00f0ff] font-sans font-bold">{font.fontName}</span>
                          <CopyButton value={font.fontName} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[8.5px]">
                        <span className="text-zinc-600">Font Category</span>
                        <span className={`px-1.5 py-0.2 rounded uppercase font-bold text-[7.5px] border ${
                          font.source === 'Google Fonts' ? 'bg-[#064e3b]/80 border-[#059669]/50 text-[#34d399]' :
                          font.source === 'System Font' ? 'bg-[#18181b] border-[#27272a] text-[#a1a1aa]' :
                          'bg-[#78350f]/80 border-[#d97706]/50 text-[#fbbf24]'
                        }`}>
                          {font.source}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Colors Subsection */}
                  <div className="space-y-2">
                    <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-wider block">2. Inferred Color Palette</span>
                    <div className="space-y-1.5">
                      {colors.length === 0 ? (
                        <div className="text-zinc-600 text-center py-2 italic text-[8.5px]">No colors identified.</div>
                      ) : (
                        colors.map((c, idx) => (
                          <div key={idx} className="flex flex-col gap-1.5 p-2 bg-[#050506] border border-[#1f1f23] rounded-md text-[9px]">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="relative w-3 h-3 rounded border border-zinc-800 overflow-hidden shrink-0 checkerboard-bg">
                                  <div className="absolute inset-0" style={{ backgroundColor: c.rgb }} />
                                </div>
                                <span className="text-zinc-200 font-bold font-mono">{c.hex}</span>
                                <span className="text-[7.5px] font-bold px-1 py-0.2 rounded bg-zinc-950 border border-zinc-900 text-zinc-400">
                                  {c.token}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-[7.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                  c.compliance === 'AAA' ? 'bg-emerald-950 border border-emerald-900/60 text-emerald-400' :
                                  c.compliance === 'AA' || c.compliance === 'Pass' ? 'bg-cyan-950 border border-cyan-900/60 text-cyan-400' :
                                  c.compliance === 'Fail' ? 'bg-rose-950 border border-rose-900/60 text-rose-400' :
                                  'bg-zinc-950 border border-zinc-800 text-zinc-500'
                                }`}>
                                  {c.role === 'Text' || c.role === 'Background' ? `WCAG: ${c.contrast} (${c.compliance})` : `${c.role} contrast: ${c.contrast}`}
                                </span>
                                <CopyButton value={c.hex} />
                              </div>
                            </div>
                            <div className="text-[7.5px] text-zinc-600 font-sans leading-none">
                              Appears {c.count} {c.count === 1 ? 'time' : 'times'} (primarily as {c.role})
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Spacing Subsection */}
                  <div className="space-y-2">
                    <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-wider block">3. Spacing scale ({spacing.consistency}% consistency)</span>
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2.5 space-y-3">
                      <div className="flex items-center justify-between text-[8.5px] border-b border-[#1f1f23]/60 pb-1.5">
                        <span className="text-zinc-600">8pt Grid Compliance</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-200 font-bold">{spacing.compliance8pt}%</span>
                          <span className={`text-[7.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                            spacing.is8ptGrid === 'Strict' ? 'bg-emerald-950/60 border border-emerald-900/40 text-emerald-400' :
                            spacing.is8ptGrid === 'Mostly' ? 'bg-cyan-950/60 border border-cyan-900/40 text-cyan-400' :
                            'bg-rose-950/60 border border-rose-900/40 text-rose-400'
                          }`}>
                            {spacing.is8ptGrid}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[7.5px] text-zinc-600 uppercase font-bold tracking-wider block">Top Spacing Rules</span>
                        {spacing.scale.length === 0 ? (
                          <div className="text-zinc-600 italic text-center text-[8.5px] py-1">No spacing properties collected.</div>
                        ) : (
                          spacing.scale.map((item, idx) => {
                            const pct = Math.min(100, Math.round((item.valuePx / 32) * 100));
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex justify-between text-zinc-400 text-[8.5px]">
                                  <span className="font-semibold text-zinc-300">{item.tokenName}</span>
                                  <span className="font-mono text-[#00f0ff] font-bold">{item.valuePx}px ({item.count} occurrences)</span>
                                </div>
                                <div className="h-1.5 w-full bg-zinc-950 border border-zinc-900/60 rounded overflow-hidden">
                                  <div className="h-full bg-cyan-500/60" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Border Radius Subsection */}
                  <div className="space-y-2">
                    <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-wider block">4. Radius scale ({radii.consistency}% consistency)</span>
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2.5 space-y-2.5">
                      {radii.scale.length === 0 ? (
                        <div className="text-zinc-600 italic text-center text-[8.5px] py-1">No border radius collected.</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 text-zinc-500">
                          {radii.scale.map((item, idx) => (
                            <div key={idx} className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-1.5 flex flex-col gap-1 text-[8.5px]">
                              <span className="text-zinc-600 text-[7px] uppercase font-bold">Standard Size</span>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 truncate">
                                  <div 
                                    className="w-3.5 h-3.5 border border-zinc-700 bg-zinc-950 shrink-0" 
                                    style={{ borderRadius: item.value }}
                                  />
                                  <span className="text-zinc-200 font-semibold">{item.value}</span>
                                  <span className="text-[7px] font-bold px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                                    {item.tokenName}
                                  </span>
                                </div>
                                <CopyButton value={item.value} />
                              </div>
                              <span className="text-[7.5px] text-zinc-600 font-sans leading-none">
                                {item.count} {item.count === 1 ? 'element' : 'elements'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Shadows Subsection */}
                  <div className="space-y-2">
                    <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-wider block">5. Shadow scale ({shadows.consistency}% consistency)</span>
                    <div className="bg-[#050506] border border-[#1f1f23] rounded-md p-2.5 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-[8.5px] border-b border-[#1f1f23]/60 pb-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-zinc-600 text-[7px] uppercase font-bold">Avg Elevation</span>
                          <span className="text-zinc-200 font-bold text-[10px]">Level {shadows.avgElevation} / 5</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-zinc-600 text-[7px] uppercase font-bold">Glassmorphism</span>
                          <span className="text-zinc-200 font-bold text-[10px]">
                            {shadows.glassCount} {shadows.glassCount === 1 ? 'element' : 'elements'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {shadows.scale.length === 0 ? (
                          <div className="text-zinc-600 italic text-center text-[8.5px] py-1">No shadow properties collected.</div>
                        ) : (
                          shadows.scale.map((item, idx) => (
                            <div key={idx} className="bg-[#0c0c0e] border border-[#1f1f23] rounded p-2 space-y-1.5 text-[8.5px]">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[7px] font-bold px-1.5 py-0.2 rounded bg-purple-950 border border-purple-900 text-purple-400 uppercase">
                                    {item.classification}
                                  </span>
                                  <span className="text-zinc-400 font-mono text-[7px] truncate max-w-[80px]" title={item.raw}>
                                    {item.raw}
                                  </span>
                                </div>
                                <CopyButton value={item.raw} />
                              </div>
                              
                              <div className="py-2.5 flex items-center justify-center bg-[#070708] rounded border border-zinc-900/60 overflow-hidden">
                                <div 
                                  className="w-16 h-4 bg-[#0d0d10] border border-zinc-800 rounded flex items-center justify-center text-[6.5px] text-zinc-600 font-sans"
                                  style={{ boxShadow: item.raw }}
                                >
                                  Preview
                                </div>
                              </div>

                              <div className="text-[7.5px] text-zinc-600 font-sans leading-none">
                                Appears {item.count} {item.count === 1 ? 'time' : 'times'} in this session
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </InspectorCard>
            );
          })()}
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
