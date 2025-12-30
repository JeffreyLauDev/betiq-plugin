// betIQ Extension - Main Content Script
// This file initializes all modules using global namespace

(function () {
  "use strict";
  
  // Early log to confirm content script is loading
  console.log("[betIQ-Plugin] Content script loaded on:", window.location.href);

  // Load Supabase from CDN for content scripts (runs in MAIN world)
  const loadSupabase = () => {
    return new Promise((resolve, reject) => {
      // Check if Supabase is already loaded
      if (window.supabase && window.supabase.createClient) {
        resolve();
        return;
      }

      // Inject Supabase CDN script
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.async = true;
      script.onload = () => {
        console.log("[betIQ-Plugin] Supabase loaded from CDN");
        resolve();
      };
      script.onerror = () => {
        console.error("[betIQ-Plugin] Failed to load Supabase from CDN");
        reject(new Error("Failed to load Supabase"));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  };

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
              
              if (url.includes('betting_alerts')) {
                console.log('[betIQ-MAIN] 🎯 Target endpoint detected!');
              }
            }
            
            // Call original fetch
            return nativeFetch.apply(this, args).then(response => {
              if (url.includes('betting_alerts')) {
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

  // Load Supabase first, then inject other scripts
  const initContentScripts = async () => {
    try {
      // Load Supabase if not already loaded
      await loadSupabase();
      
      // Inject fetch interception script
      if (document.documentElement) {
        injectScript();
      } else {
        document.addEventListener("DOMContentLoaded", injectScript);
      }
    } catch (error) {
      console.error("[betIQ-Plugin] Error initializing content scripts:", error);
    }
  };

  // Initialize immediately
  console.log("[betIQ-Plugin] Content script: Starting initialization...");
  if (document.documentElement) {
    console.log("[betIQ-Plugin] Content script: Document ready, initializing...");
    initContentScripts();
  } else {
    console.log("[betIQ-Plugin] Content script: Waiting for DOMContentLoaded...");
    document.addEventListener("DOMContentLoaded", () => {
      console.log("[betIQ-Plugin] Content script: DOMContentLoaded fired, initializing...");
      initContentScripts();
    });
  }

  // Listen for data from MAIN world
  window.addEventListener("betIQ-data", (event) => {
    // Only process data if user is logged in
    if (!window.betIQ.auth?.isLoggedIn()) {
      return;
    }

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

    // Initialize auth (will restore session if exists)
    console.log("[betIQ-Plugin] Checking for auth module...", {
      hasBetIQ: !!window.betIQ,
      hasAuth: !!(window.betIQ && window.betIQ.auth),
      hasInit: !!(window.betIQ && window.betIQ.auth && window.betIQ.auth.init)
    });
    
    if (window.betIQ && window.betIQ.auth && window.betIQ.auth.init) {
      console.log("[betIQ-Plugin] Calling auth.init()...");
      window.betIQ.auth.init().then(() => {
        // Sync will be initialized automatically if user is logged in
        console.log("[betIQ-Plugin] ✅ Auth initialized");
      }).catch((err) => {
        console.error("[betIQ-Plugin] ❌ Error initializing auth:", err);
      });
    } else {
      console.warn("[betIQ-Plugin] ⚠️ Auth module not available. Available modules:", Object.keys(window.betIQ || {}));
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
      ["config.bankroll", "config.kellyFraction"],
      (state, changedKey) => {
        const value = changedKey === "config.bankroll" 
          ? state.config?.bankroll 
          : state.config?.kellyFraction;
        console.log(
          `[betIQ-Plugin] State changed: ${changedKey} = ${value}. Recalculating stake amounts...`
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
    window.betIQ.state.addEffect("config.debugEnabled", (state, changedKey) => {
      const debugEnabled = state.config?.debugEnabled ?? true;
      console.log(
        `[betIQ-Plugin] Debug mode ${
          debugEnabled ? "enabled" : "disabled"
        }`
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
      // Only initialize features if user is logged in
      if (window.betIQ.auth?.isLoggedIn()) {
        // Initial column addition
        window.betIQ.addKellyStakeColumn();

        // Add configuration section
        window.betIQ.addConfigurationSection();

        // Set up observer for React/Next.js updates
        window.betIQ.setupTableObserver();

        // Periodic check as backup (every 500ms) - handles edge cases where observer might miss updates
        // Only run if user is logged in
        setInterval(() => {
          // Check login status before each periodic update
          if (!window.betIQ.auth?.isLoggedIn()) {
            return;
          }

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
      } else {
        console.log("[betIQ-Plugin] User not logged in - plugin features disabled. Please log in via popup.");
      }

      console.log("[betIQ-Plugin] Initialization complete");
    }, 1000);
  }
})();
