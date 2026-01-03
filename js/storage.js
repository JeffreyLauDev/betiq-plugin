// Data storage and centralized state management
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  // ============================================
  // UNIFIED STATE MANAGEMENT SYSTEM
  // ============================================

  /**
   * Helper function to get nested value from object using path
   * @param {Object} obj - Object to traverse
   * @param {string|string[]} path - Path as string ("a.b.c") or array (["a", "b", "c"])
   * @returns {*} Value at path or undefined
   */
  function getNestedValue(obj, path) {
    const keys = Array.isArray(path) ? path : path.split(".");
    let current = obj;
    for (const key of keys) {
      if (current == null || typeof current !== "object") {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  /**
   * Helper function to set nested value in object using path
   * @param {Object} obj - Object to modify
   * @param {string|string[]} path - Path as string ("a.b.c") or array (["a", "b", "c"])
   * @param {*} value - Value to set
   * @returns {*} Old value at path
   */
  function setNestedValue(obj, path, value) {
    const keys = Array.isArray(path) ? path : path.split(".");
    const lastKey = keys.pop();
    let current = obj;

    // Navigate/create path
    for (const key of keys) {
      if (current[key] == null || typeof current[key] !== "object") {
        current[key] = {};
      }
      current = current[key];
    }

    const oldValue = current[lastKey];
    current[lastKey] = value;
    return oldValue;
  }

  /**
   * Unified State Manager
   * Manages all application state with reactive updates
   */
  const unifiedState = {
    // Current state values - unified tree structure
    _state: {
      config: {
        bankroll: null,
        kellyFraction: null,
        debugEnabled: true,
      },
      betting: {
        dataCache: {}, // { betId: betData }
        stakeUsage: {}, // { betId: { userId: amount } } - nested structure for multi-user visibility
        mixBetCombinations: [], // ["id1,id2", "id3,id4"]
      },
      ui: {
        selectionOverlay: {
          dragState: { isDragging: false, dragOffset: { x: 0, y: 0 } },
          lastSelectedBetIds: null,
          manualStakeInputValue: "",
        },
        columns: {
          lastTableHash: "",
          columnProcessing: false,
        },
      },
      auth: {
        user: null, // Current logged-in user
        session: null, // Current session
      },
    },

    // Subscribers (listeners for state changes)
    _subscribers: new Set(),

    // Effects (functions that run when specific state keys change)
    _effects: new Map(), // Map<path, Set<effectFunction>>

    // localStorage key mapping for persistence
    // Only non-synced UI preferences use localStorage
    // All synced data (bankroll, kelly, stakes, mix bets) comes from Supabase only
    _localStorageKeys: {
      "config.debugEnabled": "betiq-debug-enabled", // Local preference, not synced
      // All other data synced to Supabase - no localStorage
    },

    // Whitelist of state paths that should be synced to Supabase
    // Only user data should sync, NOT UI state (popups, modals, drag state, etc.)
    _syncWhitelist: new Set([
      "config.bankroll", // ✅ User config - should sync
      "config.kellyFraction", // ✅ User config - should sync
      "betting.stakeUsage", // ✅ User data - should sync
      "betting.mixBetCombinations", // ✅ User data - should sync
      // ❌ NOT synced (UI state):
      // - config.debugEnabled (local preference)
      // - betting.dataCache (read-only from API)
      // - ui.selectionOverlay.* (all UI state - popups, drag, selections)
      // - ui.columns.* (all UI state - table processing)
    ]),

    /**
     * Check if a state path should be synced to Supabase
     * @param {string} path - State path to check
     * @returns {boolean} True if path should be synced
     */
    shouldSync(path) {
      return this._syncWhitelist.has(path);
    },

    /**
     * Migrate stake usage from old flat structure to new nested structure
     * Old: { betId: amount }
     * New: { betId: { userId: amount } }
     * @private
     */
    _migrateStakeUsage(stakeUsage) {
      if (!stakeUsage || typeof stakeUsage !== "object") {
        return {};
      }

      // Check if already in new format (nested structure)
      const firstKey = Object.keys(stakeUsage)[0];
      if (
        firstKey &&
        stakeUsage[firstKey] &&
        typeof stakeUsage[firstKey] === "object"
      ) {
        // Already in new format
        return stakeUsage;
      }

      // Migrate from old format to new format
      const migrated = {};
      const currentUserId =
        window.betIQ.auth?.getCurrentUser()?.id || "unknown_user";

      for (const [betId, amount] of Object.entries(stakeUsage)) {
        if (typeof amount === "number" && amount > 0) {
          migrated[betId] = { [currentUserId]: amount };
        }
      }

      if (Object.keys(migrated).length > 0) {
        console.log(
          "[betIQ-Plugin] Migrated stake usage from old format to new nested format"
        );
        // Don't save to localStorage - data comes from Supabase only
      }

      return migrated;
    },

    /**
     * Initialize state
     * Note: Synced data (bankroll, kelly, stakes, mix bets) is loaded from Supabase, not localStorage
     * Only local preferences (debugEnabled) use localStorage
     */
    init() {
      // Load only local preferences from localStorage
      // All synced data will be loaded from Supabase when sync initializes
      const savedDebug = localStorage.getItem("betiq-debug-enabled");

      if (savedDebug !== null) {
        this._state.config.debugEnabled = savedDebug === "true";
        window.betiqDebugEnabled = this._state.config.debugEnabled;
      } else {
        // Default to true if not set
        this._state.config.debugEnabled = true;
        window.betiqDebugEnabled = true;
      }

      // Don't load bankroll, kelly, stakes, or mix bets from localStorage
      // They will be loaded from Supabase when sync initializes

      // Trigger initial effects
      this._notifySubscribers();
      this._runEffects(["config.debugEnabled"]);
    },

    /**
     * Get state value by path
     * @param {string|string[]} path - Path to state value (e.g., "config.bankroll" or ["config", "bankroll"])
     * @returns {*} State value
     */
    get(path) {
      return getNestedValue(this._state, path);
    },

    /**
     * Get all state (deep clone)
     * @returns {Object} Complete state tree
     */
    getAll() {
      return JSON.parse(JSON.stringify(this._state));
    },

    /**
     * Set state value by path and trigger updates
     * @param {string|string[]} path - Path to state value
     * @param {*} value - Value to set
     * @param {Object} options - Options { fromRemote: boolean, skipPersistence: boolean }
     */
    set(path, value, options = {}) {
      const pathStr = Array.isArray(path) ? path.join(".") : path;
      const oldValue = getNestedValue(this._state, path);
      setNestedValue(this._state, path, value);

      // Persist to localStorage (unless skipped)
      if (!options.skipPersistence) {
        this._persistToLocalStorage(pathStr, value);
      }

      // Only notify if value actually changed
      if (oldValue !== value) {
        this._notifySubscribers(pathStr, value, oldValue, options);
        this._runEffects([pathStr]);
      }
    },

    /**
     * Update multiple state values at once
     * @param {Object} updates - Object with path keys and values
     * @param {Object} options - Options { fromRemote: boolean, skipPersistence: boolean }
     */
    setMultiple(updates, options = {}) {
      const changedPaths = [];
      for (const [path, value] of Object.entries(updates)) {
        const pathStr = Array.isArray(path) ? path.join(".") : path;
        const oldValue = getNestedValue(this._state, path);
        setNestedValue(this._state, path, value);

        // Persist to localStorage
        if (!options.skipPersistence) {
          this._persistToLocalStorage(pathStr, value);
        }

        if (oldValue !== value) {
          changedPaths.push(pathStr);
        }
      }

      if (changedPaths.length > 0) {
        this._notifySubscribers(changedPaths, null, null, options);
        this._runEffects(changedPaths);
      }
    },

    /**
     * Persist state value to localStorage
     * Only persists non-synced data (like debugEnabled)
     * All synced data is stored in Supabase only
     * @private
     */
    _persistToLocalStorage(path, value) {
      const storageKey = this._localStorageKeys[path];
      if (!storageKey) return;

      // Only persist non-synced preferences
      if (path === "config.debugEnabled") {
        localStorage.setItem(storageKey, value.toString());
        window.betiqDebugEnabled = value;
      }
      // All other paths (bankroll, kelly, stakes, mix bets) are synced to Supabase only
      // No localStorage persistence for synced data
    },

    /**
     * Subscribe to state changes
     * @param {Function} callback - Function to call when state changes
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
      this._subscribers.add(callback);
      return () => {
        this._subscribers.delete(callback);
      };
    },

    /**
     * Add an effect that runs when specific paths change
     * @param {string|string[]} paths - State path(s) to watch
     * @param {Function} effect - Function to run when paths change
     * @returns {Function} Remove effect function
     */
    addEffect(paths, effect) {
      const pathArray = Array.isArray(paths) ? paths : [paths];
      pathArray.forEach((path) => {
        const pathStr = Array.isArray(path) ? path.join(".") : path;
        if (!this._effects.has(pathStr)) {
          this._effects.set(pathStr, new Set());
        }
        this._effects.get(pathStr).add(effect);
      });

      // Return function to remove effect
      return () => {
        pathArray.forEach((path) => {
          const pathStr = Array.isArray(path) ? path.join(".") : path;
          if (this._effects.has(pathStr)) {
            this._effects.get(pathStr).delete(effect);
          }
        });
      };
    },

    /**
     * Notify all subscribers of state changes
     * @private
     */
    _notifySubscribers(changedPaths, newValue, oldValue, options = {}) {
      // Normalize changedPaths to array
      const paths = Array.isArray(changedPaths) ? changedPaths : [changedPaths];
      this._subscribers.forEach((callback) => {
        try {
          callback(this._state, paths, newValue, oldValue, options);
        } catch (error) {
          console.error("[betIQ-Plugin] Error in state subscriber:", error);
        }
      });
    },

    /**
     * Run effects for changed paths
     * @private
     */
    _runEffects(changedPaths) {
      const pathArray = Array.isArray(changedPaths)
        ? changedPaths
        : [changedPaths];
      const executedEffects = new Set();

      pathArray.forEach((path) => {
        const pathStr = Array.isArray(path) ? path.join(".") : path;
        if (this._effects.has(pathStr)) {
          this._effects.get(pathStr).forEach((effect) => {
            // Prevent same effect from running multiple times
            if (!executedEffects.has(effect)) {
              executedEffects.add(effect);
              try {
                effect(this._state, pathStr);
              } catch (error) {
                console.error(
                  `[betIQ-Plugin] Error in state effect for path "${pathStr}":`,
                  error
                );
              }
            }
          });
        }
      });
    },
  };

  // Expose unified state management API
  window.betIQ.state = {
    get: (path) => unifiedState.get(path),
    getAll: () => unifiedState.getAll(),
    set: (path, value, options) => unifiedState.set(path, value, options),
    setMultiple: (updates, options) =>
      unifiedState.setMultiple(updates, options),
    subscribe: (callback) => unifiedState.subscribe(callback),
    addEffect: (paths, effect) => unifiedState.addEffect(paths, effect),
    init: () => unifiedState.init(),
    shouldSync: (path) => unifiedState.shouldSync(path), // Check if path should sync
  };

  // ============================================
  // BACKWARD COMPATIBILITY APIs
  // ============================================

  /**
   * Get stake used for a bet
   * @param {string} betId - The bet ID
   * @param {string} [userId] - Optional user ID. If provided, returns that user's stake. Otherwise returns sum of all users' stakes.
   * @returns {number} Stake amount (single user's stake or sum of all users' stakes)
   */
  window.betIQ.getStakeUsed = function (betId, userId) {
    const stakeUsage = window.betIQ.state.get("betting.stakeUsage") || {};
    const betStakes = stakeUsage[betId];

    if (!betStakes || typeof betStakes !== "object") {
      return 0;
    }

    // If userId provided, return that user's stake
    if (userId) {
      return betStakes[userId] || 0;
    }

    // Otherwise, return sum of all users' stakes
    return Object.values(betStakes).reduce(
      (sum, amount) => sum + (parseFloat(amount) || 0),
      0
    );
  };

  /**
   * Set stake used for a bet (sets current user's stake)
   * @param {string} betId - The bet ID
   * @param {number} amount - The stake amount to set for current user
   */
  window.betIQ.setStakeUsed = function (betId, amount) {
    const raw = window.betIQ.state.get("betting.stakeUsage") || {};

    const stakeUsage =
      typeof structuredClone === "function"
        ? structuredClone(raw)
        : JSON.parse(JSON.stringify(raw));

    const currentUserId =
      window.betIQ.auth?.getCurrentUser()?.id || "unknown_user";
    const stakeAmount = Math.max(0, parseFloat(amount) || 0);

    // Initialize bet entry if it doesn't exist
    if (!stakeUsage[betId]) {
      stakeUsage[betId] = {};
    }

    // Set current user's stake
    if (stakeAmount > 0) {
      stakeUsage[betId][currentUserId] = stakeAmount;
    } else {
      // Remove user's stake if amount is 0
      delete stakeUsage[betId][currentUserId];
      // Clean up empty bet entry
      if (Object.keys(stakeUsage[betId]).length === 0) {
        delete stakeUsage[betId];
      }
    }

    window.betIQ.state.set("betting.stakeUsage", stakeUsage);

    // Trigger recalculation of allocation displays
    if (window.betIQ.updateAllocationCells) {
      window.betIQ.updateAllocationCells();
    }
  };

  /**
   * Get all stake usage (returns nested structure)
   * @returns {Object} Nested structure { betId: { userId: amount } }
   */
  window.betIQ.getAllStakeUsage = function () {
    const stakeUsage = window.betIQ.state.get("betting.stakeUsage") || {};
    // Return deep copy to prevent mutations
    return JSON.parse(JSON.stringify(stakeUsage));
  };

  /**
   * Clear stake usage for a bet or all bets
   * @param {string} [betId] - Optional bet ID. If provided, clears only that bet. Otherwise clears all bets.
   * @param {string} [userId] - Optional user ID. If provided, clears only that user's stake. Otherwise clears all users' stakes for the bet.
   */
  window.betIQ.clearStakeUsage = function (betId, userId) {
    const raw = window.betIQ.state.get("betting.stakeUsage") || {};

    // Deep clone to avoid reference mutation
    const stakeUsage =
      typeof structuredClone === "function"
        ? structuredClone(raw)
        : JSON.parse(JSON.stringify(raw));

    const currentUserId =
      window.betIQ.auth?.getCurrentUser()?.id || "unknown_user";
    const targetUserId = userId || currentUserId;

    if (betId) {
      // Clear specific bet
      if (userId) {
        // Clear specific user's stake for this bet
        if (stakeUsage[betId] && stakeUsage[betId][targetUserId]) {
          delete stakeUsage[betId][targetUserId];
          // Clean up empty bet entry
          if (Object.keys(stakeUsage[betId]).length === 0) {
            delete stakeUsage[betId];
          }
        }
      } else {
        // Clear all users' stakes for this bet
        delete stakeUsage[betId];
      }
    } else {
      // Clear all bets
      if (userId) {
        // Clear specific user's stakes from all bets
        Object.keys(stakeUsage).forEach((bid) => {
          if (stakeUsage[bid][targetUserId]) {
            delete stakeUsage[bid][targetUserId];
            // Clean up empty bet entry
            if (Object.keys(stakeUsage[bid]).length === 0) {
              delete stakeUsage[bid];
            }
          }
        });
      } else {
        // Clear all bets for all users
        Object.keys(stakeUsage).forEach((key) => delete stakeUsage[key]);
      }
    }

    window.betIQ.state.set("betting.stakeUsage", stakeUsage);

    if (window.betIQ.updateAllocationCells) {
      window.betIQ.updateAllocationCells();
    }
  };

  /**
   * Set captured betting data (merges into cache instead of replacing)
   */
  window.betIQ.setCapturedBettingData = function (data) {
    if (Array.isArray(data)) {
      // Log first item to see field structure
      if (data.length > 0 && window.betiqDebugEnabled) {
        console.log(
          "[betIQ-Plugin] Sample API data fields:",
          Object.keys(data[0])
        );
        console.log("[betIQ-Plugin] Sample API data:", data[0]);
      }

      const dataCache = window.betIQ.state.get("betting.dataCache") || {};

      // Merge new data into cache using bet_id or id as key
      let cachedCount = 0;
      data.forEach((bet) => {
        if (bet) {
          // Try bet_id first, then id, then generate a key from other fields
          const betId =
            bet.bet_id ||
            bet.id ||
            (bet.game && bet.player && bet.prop
              ? `${bet.game}_${bet.player}_${bet.prop}`
              : null);

          if (betId) {
            dataCache[betId] = bet;
            cachedCount++;
          } else if (window.betiqDebugEnabled) {
            console.warn(
              "[betIQ-Plugin] Bet missing ID field:",
              bet,
              "Available fields:",
              Object.keys(bet)
            );
          }
        }
      });

      window.betIQ.state.set("betting.dataCache", dataCache, {
        skipPersistence: true, // Don't persist data cache to localStorage
      });

      console.log(
        `[betIQ-Plugin] Cached ${cachedCount} bets. Total in cache: ${
          Object.keys(dataCache).length
        }`
      );
    }
  };

  /**
   * Get captured betting data as an array (from cache)
   */
  window.betIQ.getCapturedBettingData = function () {
    const dataCache = window.betIQ.state.get("betting.dataCache") || {};
    return Object.values(dataCache);
  };

  /**
   * Get cached betting data by bet_id
   */
  window.betIQ.getBettingDataById = function (betId) {
    const dataCache = window.betIQ.state.get("betting.dataCache") || {};
    return dataCache[betId] || null;
  };

  /**
   * Clear the betting data cache
   */
  window.betIQ.clearBettingDataCache = function () {
    window.betIQ.state.set(
      "betting.dataCache",
      {},
      {
        skipPersistence: true,
      }
    );
  };

  /**
   * Get cache size (number of unique bets)
   */
  window.betIQ.getBettingDataCacheSize = function () {
    const dataCache = window.betIQ.state.get("betting.dataCache") || {};
    return Object.keys(dataCache).length;
  };

  // Table element reference (not part of state, just a DOM reference)
  let bettingDataTable = null;

  /**
   * Set betting data table element
   */
  window.betIQ.setBettingDataTable = function (table) {
    bettingDataTable = table;
  };

  /**
   * Get betting data table element
   */
  window.betIQ.getBettingDataTable = function () {
    return bettingDataTable;
  };
})();
