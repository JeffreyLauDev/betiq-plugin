// Supabase client hooking (alternative interception method)
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  /**
   * Try to hook into Supabase client if it's exposed
   */
  function tryHookSupabaseClient() {
    const possibleClients = [
      window.supabase,
      window.__SUPABASE__,
      window.__NEXT_DATA__?.props?.supabase,
    ].filter(Boolean);

    if (possibleClients.length > 0) {
      if (window.betiqDebugEnabled) {
        console.log(
          "[betIQ-Plugin] Found Supabase client(s):",
          possibleClients.length
        );
      }

      possibleClients.forEach((client) => {
        if (client.fetch) {
          const originalClientFetch = client.fetch;
          client.fetch = function (...args) {
            return originalClientFetch.apply(this, args).then((response) => {
              const urlOrPath = args[0];
              const isTarget = urlOrPath && window.betIQ && window.betIQ.isTargetEndpointUrl && window.betIQ.isTargetEndpointUrl(typeof urlOrPath === "string" ? urlOrPath : (urlOrPath.url || ""));
              if (isTarget) {
                if (window.betiqDebugEnabled) {
                  console.log(
                    "[betIQ-Plugin] 🎯 Supabase client fetch intercepted target endpoint!"
                  );
                }
                response
                  .clone()
                  .json()
                  .then((data) => {
                    if (window.betiqDebugEnabled) {
                      console.log(
                        `[betIQ-Plugin] Supabase client response: ${
                          Array.isArray(data) ? data.length : "N/A"
                        } items`
                      );
                    }
                    if (window.betIQ.handleAPIResponse) {
                      window.betIQ.handleAPIResponse(data);
                    }
                  })
                  .catch((e) =>
                    console.error("[betIQ-Plugin] Error parsing response:", e)
                  );
              }
              return response;
            });
          };
        }
      });
    }
  }

  /**
   * Setup Supabase client monitoring
   */
  window.betIQ.setupSupabaseClientHook = function () {
    // Try immediately and after delays (client might load later)
    tryHookSupabaseClient();
    setTimeout(tryHookSupabaseClient, 1000);
    setTimeout(tryHookSupabaseClient, 3000);

    // Monitor window for Supabase client
    let supabaseCheckInterval = setInterval(() => {
      if (window.supabase && !window.supabase._betIQHooked) {
        tryHookSupabaseClient();
        window.supabase._betIQHooked = true;
        clearInterval(supabaseCheckInterval);
      }
    }, 500);

    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(supabaseCheckInterval), 10000);
  };
})();

