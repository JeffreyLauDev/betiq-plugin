// Storage bridge for MAIN world content scripts
// This script runs in ISOLATED world and provides chrome.storage access via postMessage

(function() {
  "use strict";
  
  // Listen for storage requests from MAIN world
  window.addEventListener("message", (event) => {
    // Only accept messages from same origin
    if (event.source !== window) return;
    
    if (event.data && event.data.type === "betIQ-storage-request") {
      const { requestId, action, key, value } = event.data;
      
      if (action === "getStorage") {
        chrome.storage.local.get(key, (result) => {
          window.postMessage({
            type: "betIQ-storage-response",
            requestId,
            data: result[key] || null,
            error: chrome.runtime.lastError ? chrome.runtime.lastError.message : null
          }, "*");
        });
      } else if (action === "setStorage") {
        const data = {};
        data[key] = value;
        chrome.storage.local.set(data, () => {
          window.postMessage({
            type: "betIQ-storage-response",
            requestId,
            data: null,
            error: chrome.runtime.lastError ? chrome.runtime.lastError.message : null
          }, "*");
        });
      } else if (action === "removeStorage") {
        chrome.storage.local.remove(key, () => {
          window.postMessage({
            type: "betIQ-storage-response",
            requestId,
            data: null,
            error: chrome.runtime.lastError ? chrome.runtime.lastError.message : null
          }, "*");
        });
      } else if (action === "getAllStorage") {
        chrome.storage.local.get(null, (items) => {
          window.postMessage({
            type: "betIQ-storage-response",
            requestId,
            data: items,
            error: chrome.runtime.lastError ? chrome.runtime.lastError.message : null
          }, "*");
        });
      }
    }
  });
  
  console.log("[betIQ-Plugin] Storage bridge initialized in ISOLATED world");
})();


