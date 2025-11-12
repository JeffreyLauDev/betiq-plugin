// Handle intercepted API responses
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  let debouncedGenerateTable = null;

  // Initialize with a safe no-op function
  window.betIQ.debouncedGenerateTable = function () {
    if (debouncedGenerateTable && typeof debouncedGenerateTable === "function") {
      return debouncedGenerateTable.apply(this, arguments);
    }
  };

  /**
   * Set the debounced table generation function
   */
  window.betIQ.setDebouncedGenerateTable = function (fn) {
    if (typeof fn !== "function") {
      console.warn(
        "[betIQ-Plugin] setDebouncedGenerateTable: Expected a function"
      );
      return;
    }
    debouncedGenerateTable = fn;
    window.betIQ.debouncedGenerateTable = fn;
  };

  /**
   * Handle intercepted API response
   */
  window.betIQ.handleAPIResponse = function (data) {
    if (Array.isArray(data) && data.length > 0) {
      window.betIQ.setCapturedBettingData(data);

      // Generate table from captured data (debounced to avoid excessive updates)
      if (debouncedGenerateTable) {
        debouncedGenerateTable();
      } else if (window.betIQ.generateBettingDataTable) {
        window.betIQ.generateBettingDataTable();
      } else {
        // Table generator not available yet, schedule a retry
        setTimeout(() => {
          if (window.betIQ.generateBettingDataTable) {
            window.betIQ.generateBettingDataTable();
          }
        }, 500);
      }
    }
  };
})();

