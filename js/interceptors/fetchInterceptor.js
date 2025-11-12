// Fetch API interception
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  let nativeFetch = null;
  let fetchCallCount = 0;

  // Store native fetch reference
  try {
    nativeFetch = window.fetch || globalThis.fetch || self.fetch;
  } catch (e) {
    if (window.betiqDebugEnabled) {
      console.warn("[betIQ-Plugin] Could not access window.fetch initially");
    }
  }

  /**
   * Extract URL and method from fetch arguments
   */
  function extractFetchArgs(args) {
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

    return { urlString, decodedUrl, method };
  }

  /**
   * Check if URL is our target endpoint
   */
  function isTargetEndpoint(urlString, decodedUrl) {
    return (
      (decodedUrl && decodedUrl.includes("betting_alerts")) ||
      (urlString && urlString.includes("betting_alerts"))
    );
  }

  /**
   * Process intercepted fetch response
   */
  async function processResponse(response, originalFetch, args) {
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

    try {
      const text = await clonedResponse.text();
      const data = JSON.parse(text);

      if (window.betiqDebugEnabled) {
        const contentType = response.headers.get("content-type");
        console.log("[betIQ-Plugin] Response content-type:", contentType);
        console.log("[betIQ-Plugin] Response text length:", text.length);
        console.log("[betIQ-Plugin] Response data length:", Array.isArray(data) ? data.length : "N/A");
      }

      if (window.betIQ.handleAPIResponse) {
        window.betIQ.handleAPIResponse(data);
      }

      return response;
    } catch (parseError) {
      console.error(
        "[betIQ-Plugin] Failed to parse JSON response:",
        parseError
      );
      return response;
    }
  }

  /**
   * Create fetch interceptor function
   */
  function createFetchInterceptor(originalFetch) {
    return async function (...args) {
      fetchCallCount++;

      const { urlString, decodedUrl, method } = extractFetchArgs(args);

      // Skip OPTIONS requests
      if (method === "OPTIONS") {
        return originalFetch.apply(this, args);
      }

      // Check if this is our target endpoint
      if (isTargetEndpoint(urlString, decodedUrl)) {
        if (window.betiqDebugEnabled) {
          console.log(
            "[betIQ-Plugin] Intercepted API call:",
            method,
            decodedUrl || urlString
          );
        }

        try {
          const response = await originalFetch.apply(this, args);
          return await processResponse(response, originalFetch, args);
        } catch (error) {
          console.error("[betIQ-Plugin] Error intercepting API:", error);
          return originalFetch.apply(this, args);
        }
      }

      return originalFetch.apply(this, args);
    };
  }

  /**
   * Intercept fetch on all global objects (for Next.js compatibility)
   */
  function interceptFetchEverywhere(fetchImpl) {
    const globalObjects = [
      window,
      globalThis,
      self,
      typeof global !== "undefined" ? global : null,
    ].filter(Boolean);

    globalObjects.forEach((globalObj) => {
      if (globalObj.fetch && globalObj.fetch !== fetchImpl) {
        try {
          globalObj.fetch = fetchImpl;
        } catch (e) {
          // Can't replace, that's okay
        }
      }
    });
  }

  /**
   * Setup early fetch interception (runs immediately on module load)
   */
  function setupEarlyInterception() {
    if (window.fetch && !window.fetch._betIQIntercepted) {
      const originalFetch = window.fetch;
      if (!nativeFetch) {
        nativeFetch = originalFetch;
      }

      const earlyFetch = createFetchInterceptor(originalFetch);
      earlyFetch._betIQIntercepted = true;
      earlyFetch._original = originalFetch;

      window.fetch = earlyFetch;
      interceptFetchEverywhere(earlyFetch);

      // Try to make fetch non-configurable
      try {
        Object.defineProperty(window, "fetch", {
          value: earlyFetch,
          writable: false,
          configurable: false,
        });
      } catch (e) {
        // Can't make it non-configurable, that's okay
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
  }

  /**
   * Setup full fetch interception
   */
  window.betIQ.setupFetchInterception = function () {
    if (window.fetch && window.fetch._betIQFullyIntercepted) {
      return;
    }

    let currentFetch = window.fetch;

    // Get the original fetch from the chain
    if (currentFetch._betIQIntercepted) {
      if (currentFetch._original) {
        currentFetch = currentFetch._original;
      } else {
        if (window.betiqDebugEnabled) {
          console.warn(
            "[betIQ-Plugin] Fetch is marked as intercepted but has no _original!"
          );
        }
        if (nativeFetch) {
          currentFetch = nativeFetch;
        }
      }
    } else {
      if (!currentFetch._original) {
        window.fetch._original = currentFetch;
      }
      if (!nativeFetch) {
        nativeFetch = currentFetch;
      }
    }

    const originalFetch = currentFetch;
    const newFetch = createFetchInterceptor(originalFetch);

    newFetch._betIQIntercepted = true;
    newFetch._original = originalFetch;
    newFetch._betIQFullyIntercepted = false;

    window.betIQ._newFetchFunction = newFetch;

    // Assign the new function to window.fetch
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, "fetch");
      if (descriptor && !descriptor.configurable) {
        // Already non-configurable, skip reassignment
      } else {
        window.fetch = newFetch;
        try {
          Object.defineProperty(window, "fetch", {
            value: newFetch,
            writable: false,
            configurable: false,
          });
        } catch (e) {
          // Can't make it non-configurable, that's okay
        }
      }
    } catch (e) {
      try {
        window.fetch = newFetch;
      } catch (assignError) {
        // Can't assign, that's okay
      }
    }

    interceptFetchEverywhere(newFetch);

    // Monitor if fetch gets replaced
    const checkFetchReplacement = () => {
      const currentFetch = window.fetch;
      const isOurFetch =
        currentFetch === newFetch ||
        (currentFetch &&
          currentFetch._betIQIntercepted &&
          currentFetch._original);

      if (!isOurFetch && currentFetch !== nativeFetch) {
        const replacedFetch = currentFetch;
        newFetch._original = replacedFetch;

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

    setInterval(checkFetchReplacement, 200);

    // Mark as fully intercepted
    if (window.fetch) {
      window.fetch._betIQFullyIntercepted = true;
    }
  };

  // Expose call count
  window.betIQ.getFetchCallCount = function () {
    return fetchCallCount;
  };

  // Expose native fetch
  window.betIQ.getNativeFetch = function () {
    return nativeFetch;
  };

  // Setup early interception immediately
  setupEarlyInterception();
})();

