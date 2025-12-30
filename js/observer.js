// MutationObserver for React/Next.js updates
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  // Enhanced table observer for React/Next.js updates
  let tableObserver = null;

  /**
   * Set up mutation observer for React/Next.js updates
   */
  window.betIQ.setupTableObserver = function () {
    // Find table or observe the body for table changes
    const observeTarget = document.querySelector("table") || document.body;

    if (tableObserver) {
      tableObserver.disconnect();
    }

    tableObserver = new MutationObserver((mutations) => {
      // Don't process mutations if user is not logged in
      if (!window.betIQ.auth?.isLoggedIn()) {
        return;
      }

      let shouldUpdate = false;

      mutations.forEach((mutation) => {
        // Check for added/removed nodes
        if (
          mutation.addedNodes.length > 0 ||
          mutation.removedNodes.length > 0
        ) {
          mutation.addedNodes.forEach((node) => {
            if (
              node.nodeType === 1 &&
              (node.tagName === "TABLE" ||
                node.tagName === "TR" ||
                node.tagName === "TD" ||
                node.tagName === "TH" ||
                node.querySelector?.("table") ||
                node.querySelector?.("tr"))
            ) {
              shouldUpdate = true;
            }
            // Check if target element for config section was added
            if (
              node.nodeType === 1 &&
              (node.matches?.("main > main > div > div:nth-child(2)") ||
                node.querySelector?.("main > main > div > div:nth-child(2)"))
            ) {
              window.betIQ.debouncedAddConfigSection();
            }
          });

          mutation.removedNodes.forEach((node) => {
            if (
              node.nodeType === 1 &&
              (node.tagName === "TR" ||
                node.tagName === "TD" ||
                node.querySelector?.("[data-betiq-cell]") ||
                node.hasAttribute?.("data-betiq-cell") ||
                node.hasAttribute?.("data-betiq-column"))
            ) {
              shouldUpdate = true;
            }
            // Check if config section was removed
            if (node.nodeType === 1 && node.id === "betiq-config-section") {
              window.betIQ.debouncedAddConfigSection();
            }
          });
        }

        // Check for attribute changes (React/Next.js often changes attributes)
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (
            target.tagName === "TABLE" ||
            target.tagName === "TR" ||
            target.tagName === "TD" ||
            target.tagName === "TH"
          ) {
            // Check if data-id was removed (Next.js re-render might have removed it)
            if (target.tagName === "TR" && mutation.attributeName === "data-id") {
              // If a row's data-id was removed, we need to re-apply IDs
              if (
                window.betIQ.debouncedGenerateTable &&
                typeof window.betIQ.debouncedGenerateTable === "function"
              ) {
                window.betIQ.debouncedGenerateTable();
              } else if (
                window.betIQ.generateBettingDataTable &&
                typeof window.betIQ.generateBettingDataTable === "function"
              ) {
                window.betIQ.generateBettingDataTable();
              }
            }
            // Only update if our custom cells might be affected
            if (
              !target.hasAttribute("data-betiq-cell") &&
              !target.hasAttribute("data-betiq-column") &&
              !target.closest("[data-betiq-cell]") &&
              !target.closest("[data-betiq-column]")
            ) {
              shouldUpdate = true;
            }
          }
        }

        // Check for child list changes in table rows
        if (mutation.type === "childList" && mutation.target.tagName === "TR") {
          shouldUpdate = true;
        }
      });

      if (shouldUpdate) {
        if (window.betIQ.debouncedAddColumn) {
          window.betIQ.debouncedAddColumn();
        }
        // Also re-apply IDs when rows are re-added (Next.js might have removed data-id attributes)
        if (
          window.betIQ.debouncedGenerateTable &&
          typeof window.betIQ.debouncedGenerateTable === "function"
        ) {
          window.betIQ.debouncedGenerateTable();
        } else if (
          window.betIQ.generateBettingDataTable &&
          typeof window.betIQ.generateBettingDataTable === "function"
        ) {
          window.betIQ.generateBettingDataTable();
        }
        // Re-initialize selection overlay when table changes (only if logged in)
        if (window.betIQ.auth?.isLoggedIn() && window.betIQ.initSelectionOverlay) {
          setTimeout(() => {
            window.betIQ.initSelectionOverlay();
          }, 200);
        }
      }
    });

    tableObserver.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-id"], // React/Next.js often changes these, and we need to watch for data-id removal
    });
  };
})();
