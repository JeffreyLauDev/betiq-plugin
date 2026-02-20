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
  let cachedSession = null; // Cache session state for synchronous checks

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
   * In MAIN world, uses message passing to background script
   * In ISOLATED world (popup), uses chrome.storage directly
   */
  function createStorageAdapter() {
    // Check if we have direct access to chrome.storage (popup/ISOLATED world)
    let hasDirectAccess = false;
    let chromeStorage = null;

    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    ) {
      // We're in ISOLATED world (popup) - direct access available
      chromeStorage = chrome.storage.local;
      hasDirectAccess = true;
      console.log(
        "[betIQ-Plugin] 🔍 Using direct chrome.storage.local (ISOLATED world)"
      );
    } else if (typeof window !== "undefined") {
      // We're in MAIN world (content script) - use postMessage bridge
      console.log(
        "[betIQ-Plugin] 🔍 Using postMessage bridge to ISOLATED world (MAIN world)"
      );
    } else {
      console.warn(
        "[betIQ-Plugin] 🔍 No storage access available, falling back to localStorage"
      );
    }

    // Use direct access if available (popup)
    if (hasDirectAccess && chromeStorage) {
      return {
        getItem: async function (key) {
          return new Promise((resolve, reject) => {
            try {
              chromeStorage.get(key, (result) => {
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
              chromeStorage.set(data, () => {
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
              chromeStorage.remove(key, () => {
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

    // Use postMessage bridge for MAIN world (content script)
    // The storageBridge.js runs in ISOLATED world and handles chrome.storage
    if (typeof window !== "undefined") {
      return {
        getItem: async function (key) {
          return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(7);
            const timeout = setTimeout(() => {
              reject(new Error("Storage request timeout"));
            }, 5000);

            const handler = (event) => {
              if (
                event.data &&
                event.data.type === "betIQ-storage-response" &&
                event.data.requestId === requestId
              ) {
                window.removeEventListener("message", handler);
                clearTimeout(timeout);
                if (event.data.error) {
                  reject(new Error(event.data.error));
                } else {
                  resolve(event.data.data);
                }
              }
            };

            window.addEventListener("message", handler);
            window.postMessage(
              {
                type: "betIQ-storage-request",
                requestId,
                action: "getStorage",
                key: key,
              },
              "*"
            );
          });
        },
        setItem: async function (key, value) {
          return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(7);
            const timeout = setTimeout(() => {
              reject(new Error("Storage request timeout"));
            }, 5000);

            const handler = (event) => {
              if (
                event.data &&
                event.data.type === "betIQ-storage-response" &&
                event.data.requestId === requestId
              ) {
                window.removeEventListener("message", handler);
                clearTimeout(timeout);
                if (event.data.error) {
                  reject(new Error(event.data.error));
                } else {
                  resolve();
                }
              }
            };

            window.addEventListener("message", handler);
            window.postMessage(
              {
                type: "betIQ-storage-request",
                requestId,
                action: "setStorage",
                key: key,
                value: value,
              },
              "*"
            );
          });
        },
        removeItem: async function (key) {
          return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(7);
            const timeout = setTimeout(() => {
              reject(new Error("Storage request timeout"));
            }, 5000);

            const handler = (event) => {
              if (
                event.data &&
                event.data.type === "betIQ-storage-response" &&
                event.data.requestId === requestId
              ) {
                window.removeEventListener("message", handler);
                clearTimeout(timeout);
                if (event.data.error) {
                  reject(new Error(event.data.error));
                } else {
                  resolve();
                }
              }
            };

            window.addEventListener("message", handler);
            window.postMessage(
              {
                type: "betIQ-storage-request",
                requestId,
                action: "removeStorage",
                key: key,
              },
              "*"
            );
          });
        },
        isServer: false,
      };
    }

    // Fallback to localStorage if nothing else works (shouldn't happen)
    console.warn(
      "[betIQ-Plugin] 🔍 Falling back to localStorage (not recommended)"
    );
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
    console.log("[betIQ-Plugin] 🔐 initSupabaseClient() called");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn(
        "[betIQ-Plugin] 🔐 ⚠️ Supabase credentials not configured. Set window.betIQ.supabaseUrl and window.betIQ.supabaseAnonKey"
      );
      return null;
    }

    console.log(
      "[betIQ-Plugin] 🔐 Supabase URL:",
      SUPABASE_URL.substring(0, 30) + "..."
    );

    // Validate URL format
    if (!validateSupabaseUrl(SUPABASE_URL)) {
      console.error(
        "[betIQ-Plugin] 🔐 ❌ Invalid Supabase URL format. Expected format: https://xxxxx.supabase.co"
      );
      return null;
    }

    // Wait for Supabase to be available
    console.log("[betIQ-Plugin] 🔐 Waiting for Supabase library to load...");
    const supabaseAvailable = await waitForSupabase();
    if (!supabaseAvailable) {
      console.error(
        "[betIQ-Plugin] 🔐 ❌ Supabase client library not found. Please include @supabase/supabase-js"
      );
      return null;
    }
    console.log("[betIQ-Plugin] 🔐 ✅ Supabase library loaded");

    try {
      // Create Chrome storage adapter
      const storageAdapter = createStorageAdapter();

      // Initialize Supabase client with Chrome storage and PKCE flow
      // Disable autoRefreshToken if we've had too many network errors
      const shouldAutoRefresh =
        !isNetworkError && networkErrorCount < MAX_NETWORK_ERRORS;

      // Generate consistent storage key from Supabase URL
      // This ensures popup and content script use the same storage key
      const urlObj = new URL(SUPABASE_URL);
      const projectRef = urlObj.hostname.split(".")[0];
      const storageKey = `sb-${projectRef}-auth-token`;

      supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
          auth: {
            storage: storageAdapter,
            storageKey: storageKey, // Explicit storage key for consistency across contexts
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
      console.log("[betIQ-Plugin] 🔐 Initializing Supabase client...");
      supabaseClient = await initSupabaseClient();
      if (supabaseClient) {
        console.log("[betIQ-Plugin] 🔐 ✅ Supabase client initialized");
      } else {
        console.warn(
          "[betIQ-Plugin] 🔐 ⚠️ Failed to initialize Supabase client"
        );
      }
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
   * Check if user is logged in (synchronous)
   * Checks cached session, state, and Chrome storage
   * This works across both popup and content script contexts
   */
  function isLoggedIn() {
    // Check cached session first (fastest)
    if (cachedSession) {
      return true;
    }

    // Check state
    const sessionFromState = getCurrentSession();
    if (sessionFromState) {
      cachedSession = sessionFromState; // Update cache
      return true;
    }

    // Last resort: Check Chrome storage synchronously (for cross-context checks)
    // This is needed because popup and content script are separate contexts
    // but they share Chrome storage
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    ) {
      try {
        // Use synchronous access to check if session exists
        // Note: chrome.storage.local.get is async, but we can't use async here
        // So we'll rely on the cache being set by restoreSession()
        // If cache is not set, we assume not logged in (will be set on next restoreSession call)
      } catch (e) {
        // Silently fail
      }
    }

    return false;
  }

  /**
   * Force refresh the cached session from state
   * Call this if isLoggedIn() is returning false but you know a session exists
   * This is especially important for content scripts which run in a separate context
   */
  function refreshLoginCache() {
    const sessionFromState = getCurrentSession();
    if (sessionFromState) {
      cachedSession = sessionFromState;
      return true;
    }

    // Also check if Supabase client has a session (even if not in state yet)
    // This helps when session was restored but state wasn't updated
    if (supabaseClient && supabaseClient.auth) {
      // We can't check synchronously, but we can trigger a refresh
      // The next time restoreSession() is called, it will update the cache
    }

    cachedSession = null;
    return false;
  }

  /**
   * Restore session from storage
   * Note: With Chrome storage adapter, Supabase handles session restoration automatically
   */
  async function restoreSession() {
    try {
      const client = await getSupabaseClient();
      if (!client) {
        console.warn(
          "[betIQ-Plugin] ⚠️ Cannot restore session: Supabase client not initialized"
        );
        return null;
      }

      // Debug: Check Chrome storage directly to see if session exists
      console.log("[betIQ-Plugin] 🔍 Checking Chrome storage...");
      console.log(
        "[betIQ-Plugin] 🔍 Chrome available?",
        typeof chrome !== "undefined"
      );
      console.log(
        "[betIQ-Plugin] 🔍 chrome.runtime available?",
        typeof chrome !== "undefined" && !!chrome.runtime
      );

      // Try to read storage via postMessage bridge (works in MAIN world)
      if (typeof window !== "undefined") {
        try {
          const storageItems = await new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(7);
            const timeout = setTimeout(() => {
              reject(new Error("Storage request timeout"));
            }, 5000);

            const handler = (event) => {
              if (
                event.data &&
                event.data.type === "betIQ-storage-response" &&
                event.data.requestId === requestId
              ) {
                window.removeEventListener("message", handler);
                clearTimeout(timeout);
                if (event.data.error) {
                  reject(new Error(event.data.error));
                } else {
                  resolve(event.data.data || {});
                }
              }
            };

            window.addEventListener("message", handler);
            window.postMessage(
              {
                type: "betIQ-storage-request",
                requestId,
                action: "getAllStorage",
              },
              "*"
            );
          });

          const allKeys = Object.keys(storageItems);
          const supabaseKeys = allKeys.filter(
            (key) =>
              key.includes("supabase") ||
              key.includes("auth") ||
              key.includes("session") ||
              key.startsWith("sb-")
          );

          console.log(
            "[betIQ-Plugin] 🔍 All Chrome storage keys:",
            allKeys.length
          );
          if (supabaseKeys.length > 0) {
            console.log(
              "[betIQ-Plugin] 🔍 Found Supabase-related keys:",
              supabaseKeys
            );
            supabaseKeys.forEach((key) => {
              const value = storageItems[key];
              console.log(
                `[betIQ-Plugin] 🔍 Key "${key}":`,
                typeof value === "string"
                  ? value.substring(0, 100) + "..."
                  : value
              );
            });
          } else {
            console.log(
              "[betIQ-Plugin] 🔍 No Supabase keys found in Chrome storage"
            );
          }

          // Log the storage key we're using
          const urlObj = new URL(SUPABASE_URL);
          const projectRef = urlObj.hostname.split(".")[0];
          const expectedStorageKey = `sb-${projectRef}-auth-token`;
          console.log(
            "[betIQ-Plugin] 🔍 Expected storage key:",
            expectedStorageKey
          );
          console.log(
            "[betIQ-Plugin] 🔍 Storage key exists?",
            expectedStorageKey in storageItems
          );

          if (expectedStorageKey in storageItems) {
            const sessionData = storageItems[expectedStorageKey];
            console.log(
              "[betIQ-Plugin] 🔍 Session data in storage:",
              typeof sessionData
            );
            if (typeof sessionData === "string") {
              try {
                const parsed = JSON.parse(sessionData);
                console.log(
                  "[betIQ-Plugin] 🔍 Parsed session has access_token?",
                  !!parsed.access_token
                );
              } catch (e) {
                console.log(
                  "[betIQ-Plugin] 🔍 Failed to parse session data:",
                  e
                );
              }
            }
          }
        } catch (storageError) {
          console.error(
            "[betIQ-Plugin] 🔍 Error reading Chrome storage:",
            storageError
          );
        }
      } else if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local
      ) {
        // Direct access (ISOLATED world - popup)
        try {
          const storageItems = await new Promise((resolve, reject) => {
            chrome.storage.local.get(null, (items) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(items);
              }
            });
          });

          const allKeys = Object.keys(storageItems);
          const supabaseKeys = allKeys.filter(
            (key) =>
              key.includes("supabase") ||
              key.includes("auth") ||
              key.includes("session") ||
              key.startsWith("sb-")
          );

          console.log(
            "[betIQ-Plugin] 🔍 All Chrome storage keys:",
            allKeys.length
          );
          if (supabaseKeys.length > 0) {
            console.log(
              "[betIQ-Plugin] 🔍 Found Supabase-related keys:",
              supabaseKeys
            );
          }
        } catch (storageError) {
          console.error(
            "[betIQ-Plugin] 🔍 Error reading Chrome storage:",
            storageError
          );
        }
      } else {
        console.warn(
          "[betIQ-Plugin] 🔍 Chrome storage not available in this context"
        );
      }

      // Get current session (Supabase will read from Chrome storage automatically)
      const { data, error } = await client.auth.getSession();

      if (error) {
        console.error("[betIQ-Plugin] ❌ Error getting session:", error);
        if (isNetworkErrorType(error)) {
          handleNetworkError(error);
        }
        return null;
      }

      if (data.session) {
        console.log(
          "[betIQ-Plugin] ✅ Session restored for user:",
          data.user?.email || data.user?.id?.substring(0, 8)
        );

        // Update cache for synchronous isLoggedIn() checks
        cachedSession = data.session;

        // Update state
        if (window.betIQ.state) {
          window.betIQ.state.set("auth.user", data.user, {
            skipPersistence: true,
          });
          window.betIQ.state.set("auth.session", data.session, {
            skipPersistence: true,
          });
        }

        // Initialize sync if session restored (before returning)
        if (window.betIQ.sync && window.betIQ.sync.initialize) {
          console.log("[betIQ-Plugin] 🔄 Initializing sync...");
          await window.betIQ.sync.initialize().catch((err) => {
            if (isNetworkErrorType(err)) {
              handleNetworkError(err);
            } else {
              console.error("[betIQ-Plugin] ❌ Error initializing sync:", err);
            }
          });
        } else {
          console.warn(
            "[betIQ-Plugin] ⚠️ Sync module not available. Cannot initialize sync."
          );
        }

        return data.session;
      }

      console.log("[betIQ-Plugin] ℹ️ No session found. User not logged in.");
      console.log("[betIQ-Plugin] 🔍 Session data:", data);
      cachedSession = null; // Clear cache when no session found

      // Also clear state
      if (window.betIQ.state) {
        window.betIQ.state.set("auth.session", null, { skipPersistence: true });
        window.betIQ.state.set("auth.user", null, { skipPersistence: true });
      }

      return null;
    } catch (error) {
      console.error("[betIQ-Plugin] ❌ Exception in restoreSession:", error);
      if (isNetworkErrorType(error)) {
        handleNetworkError(error);
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
    // Update cache for synchronous isLoggedIn() checks
    cachedSession = session;

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
    // Clear cached session
    cachedSession = null;

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
    console.log("[betIQ-Plugin] 🔐 Auth init() called");

    // Listen for auth state changes
    const client = await getSupabaseClient();
    console.log(
      "[betIQ-Plugin] 🔐 Supabase client obtained:",
      client ? "✅" : "❌"
    );

    if (client) {
      console.log("[betIQ-Plugin] 🔐 Setting up auth state change listener...");
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
            // Re-enable plugin features when user logs in
            console.log(
              "[betIQ-Plugin] ✅ User logged in - enabling plugin features"
            );
            setTimeout(() => {
              if (window.betIQ.addKellyStakeColumn) {
                window.betIQ.addKellyStakeColumn();
              }
              if (window.betIQ.addConfigurationSection) {
                window.betIQ.addConfigurationSection();
              }
              if (window.betIQ.setupTableObserver) {
                window.betIQ.setupTableObserver();
              }
              if (window.betIQ.generateBettingDataTable) {
                window.betIQ.generateBettingDataTable();
              }
            }, 500);
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
            // Disable plugin features when user logs out
            console.log(
              "[betIQ-Plugin] ⚠️ User logged out - disabling plugin features"
            );
            // Remove config section
            const configSection = document.getElementById(
              "betiq-config-section"
            );
            if (configSection) {
              configSection.remove();
            }
            // Remove columns
            const tables = window.betIQ.getAllTablesOrContainers
              ? window.betIQ.getAllTablesOrContainers()
              : document.querySelectorAll("table");
            tables.forEach((table) => {
              const betIQCells = table.querySelectorAll
                ? table.querySelectorAll(
                    "[data-betiq-column], [data-betiq-cell]"
                  )
                : [];
              betIQCells.forEach((cell) => cell.remove());
              const rows = table.querySelectorAll
                ? table.querySelectorAll("tr[data-id]")
                : [];
              rows.forEach((row) => row.removeAttribute("data-id"));
            });
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
      // restoreSession() will initialize sync if session exists
      console.log("[betIQ-Plugin] 🔐 Attempting to restore session...");
      try {
        const session = await restoreSession();
        if (session) {
          console.log("[betIQ-Plugin] 🔐 ✅ Session restored successfully");
        } else {
          console.log("[betIQ-Plugin] 🔐 ⚠️ No session found to restore");
        }
      } catch (error) {
        console.error("[betIQ-Plugin] 🔐 ❌ Error restoring session:", error);
        if (isNetworkErrorType(error)) {
          handleNetworkError(error);
        }
      }
    } else {
      console.warn(
        "[betIQ-Plugin] 🔐 ⚠️ Cannot initialize auth: Supabase client is null"
      );
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
          // Generate consistent storage key from Supabase URL
          const urlObj = new URL(SUPABASE_URL);
          const projectRef = urlObj.hostname.split(".")[0];
          const storageKey = `sb-${projectRef}-auth-token`;

          supabaseClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            {
              auth: {
                storage: storageAdapter,
                storageKey: storageKey, // Explicit storage key for consistency
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
    refreshLoginCache,
    init,
    getSupabaseClient,
    signInWithOAuth,
    handleOAuthCallback,
    getOAuthRedirectUrl,
  };
})();
