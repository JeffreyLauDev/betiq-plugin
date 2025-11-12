// Main API interception orchestration
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  /**
   * Intercept Supabase API calls
   * Sets up all interception methods: fetch, XHR, and Supabase client
   */
  window.betIQ.interceptSupabaseAPI = function () {
    // Setup fetch interception (if not already done)
    if (window.betIQ.setupFetchInterception) {
      window.betIQ.setupFetchInterception();
    }

    // Setup XHR interception
    if (window.betIQ.setupXHRInterception) {
      window.betIQ.setupXHRInterception();
    }

    // Setup Supabase client hooking
    if (window.betIQ.setupSupabaseClientHook) {
      window.betIQ.setupSupabaseClientHook();
    }

    // Check after a delay if any calls were made (only log if there's an issue)
    setTimeout(() => {
      const fetchCount = window.betIQ.getFetchCallCount
        ? window.betIQ.getFetchCallCount()
        : 0;
      const xhrCount = window.betIQ.getXHRCallCount
        ? window.betIQ.getXHRCallCount()
        : 0;
      const totalCalls = fetchCount + xhrCount;

      // Only log if there's a problem (no calls detected)
      if (totalCalls === 0) {
        const isOurFetch =
          window.fetch &&
          (window.fetch._betIQIntercepted ||
            window.fetch === window.betIQ._newFetchFunction);

        if (!isOurFetch) {
          console.warn(
            "[betIQ-Plugin] ⚠️ window.fetch was REPLACED! Re-interception may be needed."
          );
        }
      }
    }, 3000);
  };

  /**
   * Test function to verify interception is working
   */
  window.betIQ.testInterception = function () {
    if (window.betiqDebugEnabled) {
      console.log("[betIQ-Plugin] Testing interception with a test URL");
    }
    fetch("https://bbvlgmogzngtlzhmvegn.supabase.co/rest/v1/betting_alerts")
      .then((response) => {
        if (window.betiqDebugEnabled) {
          console.log("[betIQ-Plugin] Test fetch succeeded:", response.status);
        }
        return response.json();
      })
      .then((data) => {
        if (window.betiqDebugEnabled) {
          console.log("[betIQ-Plugin] Test fetch data:", data);
        }
      })
      .catch((error) => {
        console.error("[betIQ-Plugin] Test fetch error:", error);
      });
  };
})();
