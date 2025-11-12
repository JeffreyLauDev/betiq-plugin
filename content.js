// betIQ Extension - Main Content Script
// This file initializes all modules using global namespace

(function () {
  "use strict";

  // For Manifest V3, inject a script into the page context (MAIN world) if we're in ISOLATED world
  // This ensures we intercept fetch in the same context as Next.js
  const injectScript = () => {
    const script = document.createElement("script");
    script.textContent = `
      (function() {
        // This code runs in the MAIN world (same as Next.js)
        if (!window.betIQ_INJECTED) {
          window.betIQ_INJECTED = true;
          
          // Store original fetch
          const nativeFetch = window.fetch;
          
          // Intercept fetch
          window.fetch = function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            
            // Log all Supabase calls
            if (url.includes('supabase.co')) {
              console.log('[betIQ-MAIN] Fetch to Supabase:', url);
              
              if (url.includes('v_betting_alert_confidence_optimized')) {
                console.log('[betIQ-MAIN] 🎯 Target endpoint detected!');
              }
            }
            
            // Call original fetch
            return nativeFetch.apply(this, args).then(response => {
              if (url.includes('v_betting_alert_confidence_optimized')) {
                response.clone().json().then(data => {
                  // Send data to content script via custom event
                  window.dispatchEvent(new CustomEvent('betIQ-data', { 
                    detail: data 
                  }));
                  console.log('[betIQ-MAIN] Data sent to content script:', data.length);
                }).catch(e => console.error('[betIQ-MAIN] Error:', e));
              }
              return response;
            });
          };
          
          console.log('[betIQ-MAIN] Fetch interception installed in MAIN world');
        }
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  };

  // Inject immediately
  if (document.documentElement) {
    injectScript();
  } else {
    document.addEventListener("DOMContentLoaded", injectScript);
  }

  // Listen for data from MAIN world
  window.addEventListener("betIQ-data", (event) => {
    console.log("[betIQ-Plugin] Received data from MAIN world:", event.detail);
    if (window.betIQ && window.betIQ.handleAPIResponse) {
      window.betIQ.handleAPIResponse(event.detail);
    } else if (window.betIQ && window.betIQ.setCapturedBettingData) {
      window.betIQ.setCapturedBettingData(event.detail);
      if (window.betIQ.generateBettingDataTable) {
        window.betIQ.generateBettingDataTable();
      }
    }
  });

  // Set up API interception immediately - don't wait
  if (window.betIQ && window.betIQ.interceptSupabaseAPI) {
    window.betIQ.interceptSupabaseAPI();
    console.log("[betIQ-Plugin] API interception set up (early)");
  }

  // Wait a bit to ensure all modules are loaded
  setTimeout(() => {
    // Initialize state management system
    if (window.betIQ && window.betIQ.state && window.betIQ.state.init) {
      window.betIQ.state.init();
      console.log("[betIQ-Plugin] State management system initialized");

      // Set up chain effects for state changes
      setupStateEffects();
    }

    // Initialize debounced table generation
    if (!window.betIQ.debounce) {
      console.error("[betIQ-Plugin] window.betIQ.debounce is not available!");
      return;
    }
    if (!window.betIQ.generateBettingDataTable) {
      console.error(
        "[betIQ-Plugin] window.betIQ.generateBettingDataTable is not available!"
      );
      return;
    }

    const debouncedGenerateTable = window.betIQ.debounce(
      window.betIQ.generateBettingDataTable,
      300
    );
    window.betIQ.setDebouncedGenerateTable(debouncedGenerateTable);
    console.log("[betIQ-Plugin] Debounced table generation function set");

    // Initialize the extension
    initialize();
  }, 100);

  /**
   * Set up chain effects for state changes
   * When bankroll or kellyFraction changes, trigger recalculations
   */
  function setupStateEffects() {
    if (!window.betIQ || !window.betIQ.state) {
      return;
    }

    // Effect: When bankroll or kellyFraction changes, recalculate stake amounts
    window.betIQ.state.addEffect(
      ["bankroll", "kellyFraction"],
      (state, changedKey) => {
        console.log(
          `[betIQ-Plugin] State changed: ${changedKey} = ${state[changedKey]}. Recalculating stake amounts...`
        );

        // Trigger recalculation of stake amounts in the table
        if (window.betIQ.recalculateStakeAmounts) {
          window.betIQ.recalculateStakeAmounts();
        } else {
          // Fallback: re-render columns which should recalculate values
          if (window.betIQ.debouncedAddColumn) {
            window.betIQ.debouncedAddColumn();
          }
        }
      }
    );

    // Effect: When debug mode changes, log it
    window.betIQ.state.addEffect("debugEnabled", (state, changedKey) => {
      console.log(
        `[betIQ-Plugin] Debug mode ${state.debugEnabled ? "enabled" : "disabled"}`
      );
    });
  }

  /**
   * Initialize when page loads
   */
  function initialize() {
    console.log("[betIQ-Plugin] Extension initializing...");

    // API interception is already set up above, but verify it's still active
    if (window.betIQ && window.betIQ.interceptSupabaseAPI) {
      // Re-setup to ensure it's active (in case page reloaded fetch)
      window.betIQ.interceptSupabaseAPI();
      console.log("[betIQ-Plugin] API interception verified");
    }

    // Wait a bit for Next.js/React to render initial content
    setTimeout(() => {
      // Initial column addition
      window.betIQ.addKellyStakeColumn();

      // Add configuration section
      window.betIQ.addConfigurationSection();

      // Set up observer for React/Next.js updates
      window.betIQ.setupTableObserver();

      // Periodic check as backup (every 500ms) - handles edge cases where observer might miss updates
      setInterval(() => {
        if (window.betIQ.debouncedAddColumn) {
          window.betIQ.debouncedAddColumn();
        }
        if (window.betIQ.debouncedAddConfigSection) {
          window.betIQ.debouncedAddConfigSection();
        }
        // Re-apply IDs in case Next.js removed them during re-render
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
      }, 500);

      console.log("[betIQ-Plugin] Initialization complete");
    }, 1000);
  }
})();
