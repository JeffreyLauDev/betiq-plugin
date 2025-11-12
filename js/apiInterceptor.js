// API interception for Supabase betting data
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};
  window.betIQ._newFetchFunction = null; // Will store our interceptor function

  let debouncedGenerateTable = null;
  let fetchCallCount = 0; // Track fetch calls for monitoring
  let xhrCallCount = 0; // Track XHR calls for monitoring

  // Initialize with a safe no-op function to prevent errors
  window.betIQ.debouncedGenerateTable = function () {
    // No-op until the real function is set
    if (
      debouncedGenerateTable &&
      typeof debouncedGenerateTable === "function"
    ) {
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
    // Also expose it on window.betIQ for easy access
    window.betIQ.debouncedGenerateTable = fn;
  };

  // Store a reference to the original native fetch
  let nativeFetch = null;
  try {
    // Try to get the native fetch before anything else
    // For Next.js, we need to be even more aggressive
    nativeFetch = window.fetch;

    // Also try to get fetch from globalThis and self
    if (!nativeFetch) {
      nativeFetch = globalThis.fetch || self.fetch;
    }
  } catch (e) {
    console.warn("[betIQ-Plugin] Could not access window.fetch initially");
  }

  // Next.js specific: Try to intercept fetch at the global scope level
  // Next.js might be using fetch from a different scope
  const interceptFetchEverywhere = (fetchImpl) => {
    // Try all possible global objects
    const globalObjects = [
      window,
      globalThis,
      self,
      typeof global !== "undefined" ? global : null,
    ].filter(Boolean);

    globalObjects.forEach((globalObj) => {
      if (globalObj.fetch && globalObj.fetch !== fetchImpl) {
        try {
          const original = globalObj.fetch;
          globalObj.fetch = fetchImpl;
        } catch (e) {
          // Can't replace, that's okay
        }
      }
    });
  };

  // Set up interception immediately when this module loads
  // This ensures we catch API calls that happen before content.js initializes
  (function setupEarlyInterception() {
    if (window.fetch && !window.fetch._betIQIntercepted) {
      const originalFetch = window.fetch;
      if (!nativeFetch) {
        nativeFetch = originalFetch;
      }

      // Create the early interceptor function
      const earlyFetch = async function (...args) {
        fetchCallCount++;

        let urlString = null;
        let method = "GET";

        if (typeof args[0] === "string") {
          urlString = args[0];
          if (args[1] && args[1].method) {
            method = args[1].method.toUpperCase();
          }
        } else if (args[0] instanceof Request) {
          urlString = args[0].url;
          method = args[0].method.toUpperCase();
        }

        // Decode URL safely
        let decodedUrl = urlString;
        if (urlString) {
          try {
            decodedUrl = decodeURIComponent(urlString);
          } catch (e) {
            decodedUrl = urlString;
          }
        }

        // Skip OPTIONS requests
        if (method === "OPTIONS") {
          return originalFetch.apply(this, args);
        }

        // Check if this is our target endpoint
        const isTargetEndpoint =
          (decodedUrl && decodedUrl.includes("betting_alerts")) ||
          (urlString && urlString.includes("betting_alerts"));

        if (isTargetEndpoint) {
          try {
            const response = await originalFetch.apply(this, args);

            // Only process successful responses
            if (!response.ok) {
              return response;
            }

            const clonedResponse = response.clone();

            // Parse the response
            let data;
            try {
              const text = await clonedResponse.text();
              data = JSON.parse(text);
            } catch (parseError) {
              console.error(
                "[betIQ-Plugin] Failed to parse JSON response:",
                parseError
              );
              return response;
            }

            // Handle the response
            handleAPIResponse(data);

            return response;
          } catch (error) {
            console.error("[betIQ-Plugin] Error intercepting API:", error);
            return originalFetch.apply(this, args);
          }
        }

        return originalFetch.apply(this, args);
      };

      // Set properties on the new function
      earlyFetch._betIQIntercepted = true;
      earlyFetch._original = originalFetch;

      // Replace window.fetch
      window.fetch = earlyFetch;

      // Next.js: Also intercept on other global objects
      interceptFetchEverywhere(earlyFetch);

      // Try to make fetch non-configurable to prevent replacement
      try {
        Object.defineProperty(window, "fetch", {
          value: earlyFetch,
          writable: false,
          configurable: false,
        });
      } catch (e) {
        // If we can't make it non-configurable, that's okay
      }

      if (window.betiqDebugEnabled) {
        console.log("[betIQ-Plugin] Early fetch interception set up");
      }
    } else if (window.fetch && window.fetch._betIQIntercepted) {
      // Already intercepted, skip
    } else {
      if (window.betiqDebugEnabled) {
        console.warn(
          "[betIQ-Plugin] window.fetch not available for early interception"
        );
      }
    }
  })();

  /**
   * Handle intercepted API response
   */
  function handleAPIResponse(data) {
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
  }

  /**
   * Intercept fetch calls to Supabase API
   */
  window.betIQ.interceptSupabaseAPI = function () {
    // Prevent double setup - if already fully set up, just return
    if (window.fetch && window.fetch._betIQFullyIntercepted) {
      return;
    }

    // Get the current fetch (might already be intercepted)
    let currentFetch = window.fetch;

    // Check if fetch is still our intercepted version
    if (currentFetch._betIQIntercepted) {
      if (currentFetch._original) {
        // If already intercepted, use the stored original
        currentFetch = window.fetch._original;
      } else {
        if (window.betiqDebugEnabled) {
          console.warn(
            "[betIQ-Plugin] Fetch is marked as intercepted but has no _original!"
          );
        }
        // Try to use native fetch if we have it
        if (nativeFetch) {
          currentFetch = nativeFetch;
        }
      }
    } else {
      // Not intercepted yet, store as original
      if (!currentFetch._original) {
        window.fetch._original = currentFetch;
      }
      // Also store as native if we don't have it
      if (!nativeFetch) {
        nativeFetch = currentFetch;
      }
    }

    const originalFetch = currentFetch;

    // Create the new fetch function
    const newFetch = async function (...args) {
      fetchCallCount++;

      let urlString = null;
      let method = "GET";

      // Handle both string URLs and Request objects
      if (typeof args[0] === "string") {
        urlString = args[0];
        // Check if second argument has method
        if (args[1] && args[1].method) {
          method = args[1].method.toUpperCase();
        }
      } else if (args[0] instanceof Request) {
        urlString = args[0].url;
        method = args[0].method.toUpperCase();
      }

      // Decode URL to handle encoded characters (safely)
      let decodedUrl = urlString;
      if (urlString) {
        try {
          decodedUrl = decodeURIComponent(urlString);
        } catch (e) {
          // If decoding fails, use original URL
          decodedUrl = urlString;
        }
      }

      // Skip OPTIONS requests (preflight CORS requests)
      if (method === "OPTIONS") {
        return originalFetch.apply(this, args);
      }

      // Check if this is a call to the betting alert confidence endpoint
      // Check both original and decoded URL to handle encoding
      const isTargetEndpoint =
        (decodedUrl && decodedUrl.includes("betting_alerts")) ||
        (urlString && urlString.includes("betting_alerts"));

      if (isTargetEndpoint) {
        if (window.betiqDebugEnabled) {
          console.log(
            "[betIQ-Plugin] Intercepted API call:",
            method,
            decodedUrl || urlString
          );
        }

        try {
          const response = await originalFetch.apply(this, args);

          // Only process successful responses
          if (!response.ok) {
            if (window.betiqDebugEnabled) {
              console.warn(
                "[betIQ-Plugin] API response not OK:",
                response.status,
                response.statusText
              );
            }
            return response;
          }

          const clonedResponse = response.clone();

          // Check content type
          const contentType = response.headers.get("content-type");
          if (window.betiqDebugEnabled) {
            console.log("[betIQ-Plugin] Response content-type:", contentType);
          }

          // Parse the response
          let data;
          try {
            const text = await clonedResponse.text();
            if (window.betiqDebugEnabled) {
              console.log("[betIQ-Plugin] Response text length:", text.length);
              console.log(
                "[betIQ-Plugin] Response text preview:",
                text.substring(0, 200)
              );
            }
            data = JSON.parse(text);
          } catch (parseError) {
            console.error(
              "[betIQ-Plugin] Failed to parse JSON response:",
              parseError
            );
            return response;
          }

          if (window.betiqDebugEnabled) {
            console.log("[betIQ-Plugin] API response received:", data);
            console.log(
              "[betIQ-Plugin] Response data type:",
              Array.isArray(data) ? "array" : typeof data
            );
            console.log(
              "[betIQ-Plugin] Response data length:",
              Array.isArray(data) ? data.length : "N/A"
            );
          }

          handleAPIResponse(data);

          return response;
        } catch (error) {
          console.error("[betIQ-Plugin] Error intercepting API:", error);
          return originalFetch.apply(this, args);
        }
      }

      return originalFetch.apply(this, args);
    };

    // Set properties on the new fetch function
    newFetch._betIQIntercepted = true;
    newFetch._original = originalFetch;
    newFetch._betIQFullyIntercepted = false; // Will be set to true after XHR setup

    // Store reference for monitoring
    window.betIQ._newFetchFunction = newFetch;

    // Assign the new function to window.fetch
    // Check if fetch is already non-configurable (read-only)
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, "fetch");
      if (descriptor && !descriptor.configurable) {
        // Already non-configurable, skip reassignment
        // The early interceptor already set it up
      } else {
        // Can be reassigned
        window.fetch = newFetch;

        // Try to make fetch non-configurable to prevent replacement
        try {
          Object.defineProperty(window, "fetch", {
            value: newFetch,
            writable: false,
            configurable: false,
          });
        } catch (e) {
          // If we can't make it non-configurable, that's okay
        }
      }
    } catch (e) {
      // Fallback: try to assign anyway
      try {
        window.fetch = newFetch;
      } catch (assignError) {
        // Can't assign, that's okay - early interceptor already set it
      }
    }

    // Next.js: Also intercept on other global objects
    interceptFetchEverywhere(newFetch);

    // Monitor if fetch gets replaced - check periodically
    const checkFetchReplacement = () => {
      const currentFetch = window.fetch;
      const isOurFetch =
        currentFetch === newFetch ||
        (currentFetch &&
          currentFetch._betIQIntercepted &&
          currentFetch._original);

      if (!isOurFetch && currentFetch !== nativeFetch) {
        // Something replaced our fetch, try to re-intercept it
        const replacedFetch = currentFetch;
        newFetch._original = replacedFetch;

        // Check if we can reassign
        try {
          const descriptor = Object.getOwnPropertyDescriptor(window, "fetch");
          if (!descriptor || descriptor.configurable) {
            window.fetch = newFetch;
            newFetch._betIQIntercepted = true;
            interceptFetchEverywhere(newFetch);
          }
        } catch (e) {
          // Can't reassign, that's okay
        }
      }
    };

    // Check every 200ms if fetch is still ours (more frequent for Next.js)
    setInterval(checkFetchReplacement, 200);

    // Also intercept XMLHttpRequest as a fallback
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._betIQUrl = url;
      this._betIQMethod = method ? method.toUpperCase() : "GET";
      return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      if (this._betIQUrl && typeof this._betIQUrl === "string") {
        const method = this._betIQMethod || "GET";

        // Track XHR calls
        xhrCallCount++;

        // Skip OPTIONS requests
        if (method === "OPTIONS") {
          return originalXHRSend.apply(this, args);
        }

        // Decode URL safely
        let decodedUrl = this._betIQUrl;
        try {
          decodedUrl = decodeURIComponent(this._betIQUrl);
        } catch (e) {
          decodedUrl = this._betIQUrl;
        }

        const isTargetEndpoint =
          decodedUrl.includes("betting_alerts") ||
          this._betIQUrl.includes("betting_alerts");

        if (isTargetEndpoint) {
          if (window.betiqDebugEnabled) {
            console.log(
              "[betIQ-Plugin] Intercepted XHR API call:",
              method,
              decodedUrl || this._betIQUrl
            );
          }

          const originalOnReadyStateChange = this.onreadystatechange;
          this.onreadystatechange = function () {
            if (this.readyState === 4 && this.status === 200) {
              try {
                const data = JSON.parse(this.responseText);
                if (window.betiqDebugEnabled) {
                  console.log(
                    "[betIQ-Plugin] XHR API response received:",
                    data
                  );
                }
                handleAPIResponse(data);
              } catch (error) {
                console.error(
                  "[betIQ-Plugin] Error parsing XHR response:",
                  error
                );
              }
            }
            if (originalOnReadyStateChange) {
              originalOnReadyStateChange.apply(this, arguments);
            }
          };

          // Also handle addEventListener
          const originalAddEventListener = this.addEventListener;
          this.addEventListener = function (type, listener, options) {
            if (type === "loadend" || type === "load") {
              const wrappedListener = function (event) {
                if (this.readyState === 4 && this.status === 200) {
                  try {
                    const data = JSON.parse(this.responseText);
                    if (window.betiqDebugEnabled) {
                      console.log(
                        "[betIQ-Plugin] XHR API response received (event):",
                        data
                      );
                    }
                    handleAPIResponse(data);
                  } catch (error) {
                    console.error(
                      "[betIQ-Plugin] Error parsing XHR response:",
                      error
                    );
                  }
                }
                if (listener) {
                  listener.apply(this, arguments);
                }
              };
              return originalAddEventListener.call(
                this,
                type,
                wrappedListener,
                options
              );
            }
            return originalAddEventListener.apply(this, arguments);
          };
        }
      }

      return originalXHRSend.apply(this, args);
    };

    // Mark as fully intercepted (update the flag on the fetch function)
    if (window.fetch) {
      window.fetch._betIQFullyIntercepted = true;
    }
  };

  /**
   * Test function to verify interception is working
   * https://bbvlgmogzngtlzhmvegn.supabase.co/rest/v1/betting_alerts
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

  // Expose call counts for monitoring
  window.betIQ.getFetchCallCount = function () {
    return fetchCallCount;
  };
  window.betIQ.getXHRCallCount = function () {
    return xhrCallCount;
  };

  // Alternative approach: Try to hook into Supabase client if it's exposed
  const tryHookSupabaseClient = () => {
    // Check for common Supabase client locations
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
      possibleClients.forEach((client, index) => {
        // Try to intercept the client's fetch method
        if (client.fetch) {
          const originalClientFetch = client.fetch;
          client.fetch = function (...args) {
            return originalClientFetch.apply(this, args).then((response) => {
              if (args[0] && args[0].includes("betting_alerts")) {
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
                    handleAPIResponse(data);
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
  };

  // Try immediately and after a delay (client might load later)
  tryHookSupabaseClient();
  setTimeout(tryHookSupabaseClient, 1000);
  setTimeout(tryHookSupabaseClient, 3000);

  // Also monitor window for Supabase client
  let supabaseCheckInterval = setInterval(() => {
    if (window.supabase && !window.supabase._betIQHooked) {
      tryHookSupabaseClient();
      window.supabase._betIQHooked = true;
      clearInterval(supabaseCheckInterval);
    }
  }, 500);

  // Stop checking after 10 seconds
  setTimeout(() => clearInterval(supabaseCheckInterval), 10000);

  // Check after a delay if any calls were made (only log if there's an issue)
  setTimeout(() => {
    const totalCalls = fetchCallCount + xhrCallCount;

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
})();
