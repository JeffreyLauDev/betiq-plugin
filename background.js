// Background service worker for Chrome extension
// Handles chrome.storage access for content scripts running in MAIN world

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getStorage") {
    chrome.storage.local.get(request.key, (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ data: result[request.key] || null });
      }
    });
    return true; // Keep channel open for async response
  }

  if (request.action === "setStorage") {
    const data = {};
    data[request.key] = request.value;
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // Keep channel open for async response
  }

  if (request.action === "removeStorage") {
    chrome.storage.local.remove(request.key, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // Keep channel open for async response
  }

  if (request.action === "getAllStorage") {
    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ data: items });
      }
    });
    return true; // Keep channel open for async response
  }
});


