import { listenForMessages, createMessage } from '../shared/messaging';
import type { TabInfo } from '../shared/types';

// Configure the side panel to open when clicking the extension icon
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting panel behavior:', error));
});

/**
 * Gets the current active tab information.
 */
async function getActiveTab(): Promise<TabInfo | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && tab.id !== undefined) {
        resolve({
          tabId: tab.id,
          url: tab.url || '',
          title: tab.title || ''
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Broadcasts the current active tab's information to the Side Panel.
 */
async function broadcastTabChange() {
  const tabInfo = await getActiveTab();
  if (tabInfo) {
    const message = createMessage('TAB_CHANGED', tabInfo, 'background');
    // Send to side panel (chrome.runtime.sendMessage reaches all extension views)
    chrome.runtime.sendMessage(message, () => {
      // Reference lastError to prevent unused compiler warning
      if (chrome.runtime.lastError) {
        // Suppress
      }
    });
  }
}

// Track active tab changes
chrome.tabs.onActivated.addListener(() => {
  broadcastTabChange();
});

// Track page reloads or URL changes
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    broadcastTabChange();
  }
});

// Set up background message router
listenForMessages((message, _sender, sendResponse) => {
  console.log('[Background] Routing message:', message);

  // Handle request for current tab info
  if (message.type === 'GET_TAB_INFO') {
    getActiveTab().then((tabInfo) => {
      if (tabInfo) {
        sendResponse(tabInfo);
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    return true; // Keep channel open for async response
  }

  // Relay TOGGLE_INSPECT from Side Panel to Content Script
  if (message.type === 'TOGGLE_INSPECT' && message.source === 'sidepanel') {
    getActiveTab().then((tabInfo) => {
      if (tabInfo) {
        chrome.tabs.sendMessage(tabInfo.tabId, message, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            sendResponse({ error: err.message });
          } else {
            sendResponse(response || { status: 'acknowledged' });
          }
        });
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    return true; // Keep channel open
  }

  // Relay ELEMENT_HOVERED from Content Script to Side Panel
  if (message.type === 'ELEMENT_HOVERED' && message.source === 'content') {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Suppress
      }
    });
    sendResponse({ status: 'relayed' });
    return false;
  }

  // Relay ELEMENT_SELECTED from Content Script to Side Panel
  if (message.type === 'ELEMENT_SELECTED' && message.source === 'content') {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Suppress
      }
    });
    sendResponse({ status: 'relayed' });
    return false;
  }

  // Relay RESET_SELECTION from Side Panel to Content Script
  if (message.type === 'RESET_SELECTION' && message.source === 'sidepanel') {
    getActiveTab().then((tabInfo) => {
      if (tabInfo) {
        chrome.tabs.sendMessage(tabInfo.tabId, message, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            sendResponse({ error: err.message });
          } else {
            sendResponse(response || { status: 'acknowledged' });
          }
        });
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    return true; // Keep channel open
  }

  // Relay STATUS_UPDATE (e.g., content script signaling readiness) to Side Panel
  if (message.type === 'STATUS_UPDATE' && message.source === 'content') {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Suppress
      }
    });
    sendResponse({ status: 'relayed' });
    return false;
  }

  // Handle PING from side panel or content script for demonstration
  if (message.type === 'PING') {
    const response = createMessage(
      'PONG',
      { text: `Hello from background service worker! Received: "${message.payload.text}"`, sender: 'Background Service Worker' },
      'background'
    );
    sendResponse(response);
    return false;
  }

  return false;
});
