import type { AnyExtensionMessage, ExtensionMessage, MessagePayloadMap, MessageSource } from './types';

/**
 * Creates a formatted ExtensionMessage.
 */
export function createMessage<T extends keyof MessagePayloadMap>(
  type: T,
  payload: MessagePayloadMap[T],
  source: MessageSource
): ExtensionMessage<T> {
  return {
    type,
    payload,
    source,
    timestamp: Date.now()
  };
}

/**
 * Sends a message to the Background service worker.
 */
export function sendMessageToBackground<T extends keyof MessagePayloadMap>(
  type: T,
  payload: MessagePayloadMap[T],
  source: MessageSource
): Promise<any> {
  const message = createMessage(type, payload, source);
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.warn('[Design Inspector Mock] chrome.runtime is undefined. Suppressing sendMessageToBackground:', message);
      if (type === 'GET_TAB_INFO') {
        resolve({
          tabId: 1,
          title: 'Local Dev Environment (http://localhost:5173)',
          url: 'http://localhost:5173/sidepanel.html'
        });
      } else {
        resolve({ error: 'chrome.runtime is undefined' });
      }
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        // Suppress expected errors during setup/teardown (e.g. background not ready)
        resolve({ error: err.message });
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Sends a message to a specific browser tab's content script.
 */
export function sendMessageToTab<T extends keyof MessagePayloadMap>(
  tabId: number,
  type: T,
  payload: MessagePayloadMap[T],
  source: MessageSource
): Promise<any> {
  const message = createMessage(type, payload, source);
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.tabs) {
      console.warn('[Design Inspector Mock] chrome.tabs/runtime is undefined. Suppressing sendMessageToTab:', message);
      resolve({ error: 'chrome.tabs is undefined' });
      return;
    }
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ error: err.message });
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Listens for incoming messages from anywhere in the extension.
 * Returns an unsubscribe/cleanup function.
 */
export function listenForMessages(
  callback: (
    message: AnyExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => void | boolean
): () => void {
  const listener = (
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => {
    if (message && typeof message === 'object' && 'type' in message && 'source' in message) {
      return callback(message as AnyExtensionMessage, sender, sendResponse);
    }
    return false;
  };
  
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) {
    console.warn('[Design Inspector Mock] chrome.runtime.onMessage is undefined. Skipping message listener.');
    return () => {};
  }
  
  chrome.runtime.onMessage.addListener(listener);
  return () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.removeListener(listener);
    }
  };
}
