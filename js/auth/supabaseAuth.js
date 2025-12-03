// Supabase authentication module
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};
  window.betIQ.auth = window.betIQ.auth || {};

  // Supabase configuration - TO BE FILLED IN BY USER
  const SUPABASE_URL = window.betIQ.supabaseUrl || ""; // e.g., "https://xxxxx.supabase.co"
  const SUPABASE_ANON_KEY = window.betIQ.supabaseAnonKey || ""; // Your Supabase anon key

  let supabaseClient = null;
  let networkErrorCount = 0;
  const MAX_NETWORK_ERRORS = 3;
  let isNetworkError = false;

  /**
   * Check if error is a network/DNS resolution error
   */
  function isNetworkErrorType(error) {
    if (!error) return false;
    const errorMessage = error.message || error.toString() || "";
    const errorName = error.name || "";

    return (
      errorMessage.includes("ERR_NAME_NOT_RESOLVED") ||
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("NetworkError") ||
      errorMessage.includes("Network request failed") ||
      (errorName === "TypeError" && errorMessage.includes("fetch"))
    );
  }

  /**
   * Validate Supabase URL format
   */
  function validateSupabaseUrl(url) {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      return (
        (urlObj.protocol === "http:" || urlObj.protocol === "https:") &&
        urlObj.hostname.includes(".supabase.co")
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Get Chrome extension ID for redirect URLs
   */
  function getExtensionId() {
    return chrome.runtime.id;
  }

  /**
   * Get redirect URL for OAuth flows
   */
  function getRedirectUrl() {
    return `chrome-extension://${getExtensionId()}/popup.html`;
  }

  /**
   * Create Chrome storage adapter for Supabase
   */
  function createStorageAdapter() {
    // Use chrome.storage.local for session storage
    // Fallback to a simple adapter if chrome.storage is not available
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    ) {
      return {
        getItem: async function (key) {
          return new Promise((resolve, reject) => {
            try {
              chrome.storage.local.get(key, (result) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  const value = result[key];
                  resolve(value || null);
                }
              });
            } catch (error) {
              reject(error);
            }
          });
        },
        setItem: async function (key, value) {
          return new Promise((resolve, reject) => {
            try {
              const data = {};
              data[key] = value;
              chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve();
                }
              });
            } catch (error) {
              reject(error);
            }
          });
        },
        removeItem: async function (key) {
          return new Promise((resolve, reject) => {
            try {
              chrome.storage.local.remove(key, () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve();
                }
              });
            } catch (error) {
              reject(error);
            }
          });
        },
        isServer: false,
      };
    }
    // Fallback to localStorage if chrome.storage is not available (for testing)
    return {
      getItem: async function (key) {
        return localStorage.getItem(key);
      },
      setItem: async function (key, value) {
        localStorage.setItem(key, value);
      },
      removeItem: async function (key) {
        localStorage.removeItem(key);
      },
      isServer: false,
    };
  }

  /**
   * Wait for Supabase to be available (if loading from CDN)
   */
  async function waitForSupabase(maxWait = 5000) {
    if (window.supabase && window.supabase.createClient) {
      return true;
    }

    // If Supabase is not available, try to load it from CDN
    if (typeof window.supabase === "undefined") {
      return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        script.async = true;
        script.onload = () => {
          console.log("[betIQ-Plugin] Supabase loaded from CDN (auth module)");
          resolve(true);
        };
        script.onerror = () => {
          console.error("[betIQ-Plugin] Failed to load Supabase from CDN");
          resolve(false);
        };
        (document.head || document.documentElement).appendChild(script);

        // Timeout fallback
        setTimeout(() => {
          if (window.supabase && window.supabase.createClient) {
            resolve(true);
          } else {
            console.warn("[betIQ-Plugin] Supabase loading timeout");
            resolve(false);
          }
        }, maxWait);
      });
    }

    // Wait for existing load
    const startTime = Date.now();
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (window.supabase && window.supabase.createClient) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > maxWait) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Initialize Supabase client with Chrome storage adapter
   */
  async function initSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn(
        "[betIQ-Plugin] Supabase credentials not configured. Set window.betIQ.supabaseUrl and window.betIQ.supabaseAnonKey"
      );
      return null;
    }

    // Validate URL format
    if (!validateSupabaseUrl(SUPABASE_URL)) {
      console.error(
        "[betIQ-Plugin] Invalid Supabase URL format. Expected format: https://xxxxx.supabase.co"
      );
      return null;
    }

    // Wait for Supabase to be available
    const supabaseAvailable = await waitForSupabase();
    if (!supabaseAvailable) {
      console.error(
        "[betIQ-Plugin] Supabase client library not found. Please include @supabase/supabase-js"
      );
      return null;
    }

    try {
      // Create Chrome storage adapter
      const storageAdapter = createStorageAdapter();

      // Initialize Supabase client with Chrome storage and PKCE flow
      // Disable autoRefreshToken if we've had too many network errors
      const shouldAutoRefresh =
        !isNetworkError && networkErrorCount < MAX_NETWORK_ERRORS;

      supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
          auth: {
            storage: storageAdapter,
            autoRefreshToken: shouldAutoRefresh,
            persistSession: true,
            detectSessionInUrl: false, // Disable URL detection for extensions
            flowType: "pkce", // Use PKCE flow for better security
          },
        }
      );

      // Reset error count on successful initialization
      networkErrorCount = 0;
      isNetworkError = false;

      return supabaseClient;
    } catch (error) {
      console.error(
        "[betIQ-Plugin] Error initializing Supabase client:",
        error
      );

      if (isNetworkErrorType(error)) {
        isNetworkError = true;
        networkErrorCount++;
        console.error(
          `[betIQ-Plugin] Network error detected (${networkErrorCount}/${MAX_NETWORK_ERRORS}). ` +
            `Cannot resolve Supabase domain. Please check: ` +
            `1. The Supabase project exists and is active, ` +
            `2. The URL is correct: ${SUPABASE_URL}, ` +
            `3. Your internet connection is working.`
        );
      }

      return null;
    }
  }

  /**
   * Get Supabase client (initialize if needed)
   */
  async function getSupabaseClient() {
    if (!supabaseClient) {
      supabaseClient = await initSupabaseClient();
    }
    return supabaseClient;
  }

  /**
   * Login with email/username and password
   */
  async function login(email, password) {
    const client = await getSupabaseClient();
    if (!client) {
      throw new Error("Supabase client not initialized");
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        throw error;
      }

      // Session is automatically saved by Supabase using Chrome storage adapter
      if (data.session) {
        // Update auth state
        await saveSession(data.session);

        // Initialize sync after login
        if (window.betIQ.sync && window.betIQ.sync.initialize) {
          await window.betIQ.sync.initialize();
        }
      }

      return { user: data.user, session: data.session };
    } catch (error) {
      if (isNetworkErrorType(error)) {
        handleNetworkError(error);
        throw new Error(
          `Cannot connect to Supabase. Please verify the URL is correct: ${SUPABASE_URL}`
        );
      }
      console.error("[betIQ-Plugin] Login error:", error);
      throw error;
    }
  }

  /**
   * Logout
   */
  async function logout() {
    const client = await getSupabaseClient();
    if (!client) {
      return;
    }

    try {
      // Stop sync before logout
      if (window.betIQ.sync && window.betIQ.sync.stop) {
        await window.betIQ.sync.stop();
      }

      await client.auth.signOut();
      await clearSession();

      // Clear auth state
      if (window.betIQ.state) {
        window.betIQ.state.set("auth.user", null, { skipPersistence: true });
        window.betIQ.state.set("auth.session", null, { skipPersistence: true });
      }
    } catch (error) {
      console.error("[betIQ-Plugin] Logout error:", error);
      throw error;
    }
  }

  /**
   * Get current user
   */
  function getCurrentUser() {
    if (window.betIQ.state) {
      return window.betIQ.state.get("auth.user");
    }
    return null;
  }

  /**
   * Get current session
   */
  function getCurrentSession() {
    if (window.betIQ.state) {
      return window.betIQ.state.get("auth.session");
    }
    return null;
  }

  /**
   * Check if user is logged in
   */
  function isLoggedIn() {
    const session = getCurrentSession();
    return session !== null && session !== undefined;
  }

  /**
   * Restore session from storage
   * Note: With Chrome storage adapter, Supabase handles session restoration automatically
   */
  async function restoreSession() {
    try {
      const client = await getSupabaseClient();
      if (!client) {
        return null;
      }

      // Get current session (Supabase will read from Chrome storage automatically)
      const { data, error } = await client.auth.getSession();

      if (error) {
        if (isNetworkErrorType(error)) {
          handleNetworkError(error);
        } else {
          console.error("[betIQ-Plugin] Error restoring session:", error);
        }
        return null;
      }

      if (data.session) {
        // Update state
        if (window.betIQ.state) {
          window.betIQ.state.set("auth.user", data.user, {
            skipPersistence: true,
          });
          window.betIQ.state.set("auth.session", data.session, {
            skipPersistence: true,
          });
        }

        // Initialize sync if session restored
        if (window.betIQ.sync && window.betIQ.sync.initialize) {
          await window.betIQ.sync.initialize().catch((err) => {
            if (isNetworkErrorType(err)) {
              handleNetworkError(err);
            } else {
              console.error("[betIQ-Plugin] Error initializing sync:", err);
            }
          });
        }

        return data.session;
      }

      return null;
    } catch (error) {
      if (isNetworkErrorType(error)) {
        handleNetworkError(error);
      } else {
        console.error("[betIQ-Plugin] Error restoring session:", error);
      }
      return null;
    }
  }

  /**
   * Save session to storage
   * Note: With Chrome storage adapter, Supabase handles session saving automatically
   * This function is kept for backward compatibility but is no longer needed
   */
  async function saveSession(session) {
    // Session is automatically saved by Supabase using the Chrome storage adapter
    // This function is kept for backward compatibility
    if (window.betIQ.state) {
      window.betIQ.state.set("auth.user", session?.user || null, {
        skipPersistence: true,
      });
      window.betIQ.state.set("auth.session", session, {
        skipPersistence: true,
      });
    }
  }

  /**
   * Clear session from storage
   * Note: With Chrome storage adapter, Supabase handles session clearing automatically
   */
  async function clearSession() {
    // Session is automatically cleared by Supabase using the Chrome storage adapter
    // This function is kept for backward compatibility
    if (window.betIQ.state) {
      window.betIQ.state.set("auth.user", null, { skipPersistence: true });
      window.betIQ.state.set("auth.session", null, { skipPersistence: true });
    }
  }

  /**
   * Initialize auth (restore session on load)
   */
  async function init() {
    // Listen for auth state changes
    const client = await getSupabaseClient();
    if (client) {
      client.auth.onAuthStateChange(async (event, session) => {
        try {
          if (event === "SIGNED_IN" && session) {
            saveSession(session);
            if (window.betIQ.state) {
              window.betIQ.state.set("auth.user", session.user, {
                skipPersistence: true,
              });
              window.betIQ.state.set("auth.session", session, {
                skipPersistence: true,
              });
            }
            // Initialize sync
            if (window.betIQ.sync && window.betIQ.sync.initialize) {
              window.betIQ.sync.initialize().catch((err) => {
                if (isNetworkErrorType(err)) {
                  handleNetworkError(err);
                } else {
                  console.error("[betIQ-Plugin] Error initializing sync:", err);
                }
              });
            }
          } else if (event === "SIGNED_OUT") {
            clearSession();
            if (window.betIQ.state) {
              window.betIQ.state.set("auth.user", null, {
                skipPersistence: true,
              });
              window.betIQ.state.set("auth.session", null, {
                skipPersistence: true,
              });
            }
            // Stop sync
            if (window.betIQ.sync && window.betIQ.sync.stop) {
              window.betIQ.sync.stop().catch((err) => {
                console.error("[betIQ-Plugin] Error stopping sync:", err);
              });
            }
          } else if (event === "TOKEN_REFRESHED") {
            // Reset error count on successful token refresh
            networkErrorCount = 0;
            isNetworkError = false;
          }
        } catch (error) {
          if (isNetworkErrorType(error)) {
            handleNetworkError(error);
          } else {
            console.error("[betIQ-Plugin] Auth state change error:", error);
          }
        }
      });

      // Try to restore session with error handling
      try {
        await restoreSession();
      } catch (error) {
        if (isNetworkErrorType(error)) {
          handleNetworkError(error);
        } else {
          console.error("[betIQ-Plugin] Error restoring session:", error);
        }
      }
    }
  }

  /**
   * Handle network errors gracefully
   */
  function handleNetworkError(error) {
    networkErrorCount++;
    isNetworkError = true;

    if (networkErrorCount >= MAX_NETWORK_ERRORS) {
      console.error(
        `[betIQ-Plugin] Too many network errors (${networkErrorCount}). ` +
          `Supabase domain cannot be resolved: ${SUPABASE_URL}. ` +
          `Please verify: ` +
          `1. The Supabase project exists and is active at https://app.supabase.com, ` +
          `2. The URL in supabaseConfig.js is correct, ` +
          `3. Your internet connection is working. ` +
          `Auto-refresh has been disabled to prevent repeated errors.`
      );

      // Disable auto-refresh by reinitializing client
      if (supabaseClient) {
        try {
          const storageAdapter = createStorageAdapter();
          supabaseClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            {
              auth: {
                storage: storageAdapter,
                autoRefreshToken: false, // Disable to prevent retries
                persistSession: true,
                detectSessionInUrl: false,
                flowType: "pkce",
              },
            }
          );
        } catch (e) {
          console.error("[betIQ-Plugin] Error reinitializing client:", e);
        }
      }
    } else {
      console.warn(
        `[betIQ-Plugin] Network error (${networkErrorCount}/${MAX_NETWORK_ERRORS}):`,
        error.message || error
      );
    }
  }

  /**
   * Sign in with OAuth provider (PKCE flow)
   * @param {string} provider - OAuth provider (e.g., 'google', 'github', 'discord')
   * @param {Object} options - Additional options
   */
  async function signInWithOAuth(provider, options = {}) {
    const client = await getSupabaseClient();
    if (!client) {
      throw new Error("Supabase client not initialized");
    }

    try {
      const redirectUrl = getRedirectUrl();
      const { data, error } = await client.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: redirectUrl,
          queryParams: options.queryParams || {},
          ...options,
        },
      });

      if (error) {
        throw error;
      }

      // For OAuth, we need to handle the redirect
      // The user will be redirected to the OAuth provider, then back to the extension
      return data;
    } catch (error) {
      console.error("[betIQ-Plugin] OAuth sign-in error:", error);
      throw error;
    }
  }

  /**
   * Handle OAuth callback after redirect
   * Call this in popup.html or wherever the OAuth redirect lands
   */
  async function handleOAuthCallback() {
    const client = await getSupabaseClient();
    if (!client) {
      return null;
    }

    try {
      // Check if we have a code in the URL (OAuth callback)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const error = urlParams.get("error");
      const errorDescription = urlParams.get("error_description");

      if (error) {
        console.error("[betIQ-Plugin] OAuth error:", error, errorDescription);
        return { error, errorDescription };
      }

      if (code) {
        // Exchange code for session (PKCE flow handles this automatically)
        // Supabase will handle the code exchange when we call getSession
        const { data, error: sessionError } = await client.auth.getSession();

        if (sessionError) {
          console.error(
            "[betIQ-Plugin] Error getting session after OAuth:",
            sessionError
          );
          return { error: sessionError };
        }

        if (data.session) {
          // Update state
          await saveSession(data.session);

          // Initialize sync
          if (window.betIQ.sync && window.betIQ.sync.initialize) {
            window.betIQ.sync.initialize().catch((err) => {
              console.error("[betIQ-Plugin] Error initializing sync:", err);
            });
          }

          // Clean up URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          return { session: data.session, user: data.user };
        }
      }

      return null;
    } catch (error) {
      console.error("[betIQ-Plugin] Error handling OAuth callback:", error);
      return { error };
    }
  }

  /**
   * Get redirect URL for OAuth (useful for configuring Supabase dashboard)
   */
  function getOAuthRedirectUrl() {
    return getRedirectUrl();
  }

  // Expose API
  window.betIQ.auth = {
    login,
    logout,
    getCurrentUser,
    getCurrentSession,
    isLoggedIn,
    init,
    getSupabaseClient,
    signInWithOAuth,
    handleOAuthCallback,
    getOAuthRedirectUrl,
  };
})();
