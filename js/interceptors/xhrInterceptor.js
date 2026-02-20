// XMLHttpRequest interception
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  let xhrCallCount = 0;

  /**
   * Check if URL is our target endpoint (uses site config)
   */
  function isTargetEndpoint(url) {
    return window.betIQ && window.betIQ.isTargetEndpointUrl && window.betIQ.isTargetEndpointUrl(url);
  }

  /**
   * Process XHR response
   */
  function processXHRResponse(xhr) {
    try {
      const data = JSON.parse(xhr.responseText);
      if (window.betiqDebugEnabled) {
        console.log("[betIQ-Plugin] XHR API response received:", data);
      }
      if (window.betIQ.handleAPIResponse) {
        window.betIQ.handleAPIResponse(data);
      }
    } catch (error) {
      console.error("[betIQ-Plugin] Error parsing XHR response:", error);
    }
  }

  /**
   * Setup XHR interception
   */
  window.betIQ.setupXHRInterception = function () {
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
        xhrCallCount++;

        // Skip OPTIONS requests
        if (method === "OPTIONS") {
          return originalXHRSend.apply(this, args);
        }

        if (isTargetEndpoint(this._betIQUrl)) {
          if (window.betiqDebugEnabled) {
            console.log(
              "[betIQ-Plugin] Intercepted XHR API call:",
              method,
              this._betIQUrl
            );
          }

          // Handle onreadystatechange
          const originalOnReadyStateChange = this.onreadystatechange;
          this.onreadystatechange = function () {
            if (this.readyState === 4 && this.status === 200) {
              processXHRResponse(this);
            }
            if (originalOnReadyStateChange) {
              originalOnReadyStateChange.apply(this, arguments);
            }
          };

          // Handle addEventListener
          const originalAddEventListener = this.addEventListener;
          this.addEventListener = function (type, listener, options) {
            if (type === "loadend" || type === "load") {
              const wrappedListener = function (event) {
                if (this.readyState === 4 && this.status === 200) {
                  processXHRResponse(this);
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
  };

  // Expose call count
  window.betIQ.getXHRCallCount = function () {
    return xhrCallCount;
  };
})();

