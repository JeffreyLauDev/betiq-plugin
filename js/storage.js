// Data storage and state management
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  // Store captured API data as a cache object: { bet_id: betData, ... }
  // This allows us to accumulate data across multiple API calls
  let bettingDataCache = {};
  let bettingDataTable = null;

  // Initialize debug mode as enabled by default
  window.betiqDebugEnabled = true;

  // Stake usage tracking: { bet_id: stakeUsed, ... }
  let stakeUsage = {};

  /**
   * Get stake used for a bet
   */
  window.betIQ.getStakeUsed = function (betId) {
    return stakeUsage[betId] || 0;
  };

  /**
   * Set stake used for a bet
   */
  window.betIQ.setStakeUsed = function (betId, amount) {
    stakeUsage[betId] = Math.max(0, parseFloat(amount) || 0);
    // Persist to localStorage
    localStorage.setItem("betiq-stake-usage", JSON.stringify(stakeUsage));
    // Trigger recalculation of allocation displays
    if (window.betIQ.updateAllocationCells) {
      window.betIQ.updateAllocationCells();
    }
  };

  /**
   * Get all stake usage
   */
  window.betIQ.getAllStakeUsage = function () {
    return { ...stakeUsage };
  };

  /**
   * Clear stake usage for a bet or all bets
   */
  window.betIQ.clearStakeUsage = function (betId) {
    if (betId) {
      delete stakeUsage[betId];
    } else {
      stakeUsage = {};
    }
    localStorage.setItem("betiq-stake-usage", JSON.stringify(stakeUsage));
    if (window.betIQ.updateAllocationCells) {
      window.betIQ.updateAllocationCells();
    }
  };

  // Load stake usage from localStorage on init
  try {
    const saved = localStorage.getItem("betiq-stake-usage");
    if (saved) {
      stakeUsage = JSON.parse(saved);
    }
  } catch (e) {
    console.error("[betIQ-Plugin] Error loading stake usage:", e);
  }

  // ============================================
  // STATE MANAGEMENT SYSTEM (React-like)
  // ============================================

  /**
   * Configuration State
   * Manages Kelly Criterion configuration with reactive updates
   */
  const configState = {
    // Current state values
    _state: {
      bankroll: null,
      kellyFraction: null,
      debugEnabled: true,
    },

    // Subscribers (listeners for state changes)
    _subscribers: new Set(),

    // Effects (functions that run when specific state keys change)
    _effects: new Map(), // Map<key, Set<effectFunction>>

    /**
     * Initialize state from localStorage
     */
    init() {
      const savedBankroll = localStorage.getItem("betiq-bankroll");
      const savedKelly = localStorage.getItem("betiq-kelly-fraction");
      const savedDebug = localStorage.getItem("betiq-debug-enabled");

      if (savedBankroll) {
        this._state.bankroll = parseFloat(savedBankroll);
      }
      if (savedKelly) {
        this._state.kellyFraction = parseFloat(savedKelly);
      }
      if (savedDebug !== null) {
        this._state.debugEnabled = savedDebug === "true";
        window.betiqDebugEnabled = this._state.debugEnabled;
      }

      // Trigger initial effects
      this._notifySubscribers();
      this._runEffects(["bankroll", "kellyFraction", "debugEnabled"]);
    },

    /**
     * Get current state value
     */
    get(key) {
      return this._state[key];
    },

    /**
     * Get all state
     */
    getAll() {
      return { ...this._state };
    },

    /**
     * Set state value and trigger updates
     */
    set(key, value) {
      const oldValue = this._state[key];
      this._state[key] = value;

      // Persist to localStorage
      if (key === "bankroll") {
        if (value !== null && value !== undefined) {
          localStorage.setItem("betiq-bankroll", value.toString());
        } else {
          localStorage.removeItem("betiq-bankroll");
        }
      } else if (key === "kellyFraction") {
        if (value !== null && value !== undefined) {
          localStorage.setItem("betiq-kelly-fraction", value.toString());
        } else {
          localStorage.removeItem("betiq-kelly-fraction");
        }
      } else if (key === "debugEnabled") {
        localStorage.setItem("betiq-debug-enabled", value.toString());
        window.betiqDebugEnabled = value;
      }

      // Only notify if value actually changed
      if (oldValue !== value) {
        this._notifySubscribers(key, value, oldValue);
        this._runEffects([key]);
      }
    },

    /**
     * Update multiple state values at once
     */
    setMultiple(updates) {
      const changedKeys = [];
      for (const [key, value] of Object.entries(updates)) {
        const oldValue = this._state[key];
        this._state[key] = value;

        // Persist to localStorage
        if (key === "bankroll") {
          if (value !== null && value !== undefined) {
            localStorage.setItem("betiq-bankroll", value.toString());
          } else {
            localStorage.removeItem("betiq-bankroll");
          }
        } else if (key === "kellyFraction") {
          if (value !== null && value !== undefined) {
            localStorage.setItem("betiq-kelly-fraction", value.toString());
          } else {
            localStorage.removeItem("betiq-kelly-fraction");
          }
        } else if (key === "debugEnabled") {
          localStorage.setItem("betiq-debug-enabled", value.toString());
          window.betiqDebugEnabled = value;
        }

        if (oldValue !== value) {
          changedKeys.push(key);
        }
      }

      if (changedKeys.length > 0) {
        this._notifySubscribers(changedKeys);
        this._runEffects(changedKeys);
      }
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
     * Add an effect that runs when specific keys change
     * @param {string|string[]} keys - State key(s) to watch
     * @param {Function} effect - Function to run when keys change
     * @returns {Function} Remove effect function
     */
    addEffect(keys, effect) {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      keyArray.forEach((key) => {
        if (!this._effects.has(key)) {
          this._effects.set(key, new Set());
        }
        this._effects.get(key).add(effect);
      });

      // Return function to remove effect
      return () => {
        keyArray.forEach((key) => {
          if (this._effects.has(key)) {
            this._effects.get(key).delete(effect);
          }
        });
      };
    },

    /**
     * Notify all subscribers of state changes
     */
    _notifySubscribers(changedKeys, newValue, oldValue) {
      // Normalize changedKeys to array
      const keys = Array.isArray(changedKeys) ? changedKeys : [changedKeys];
      this._subscribers.forEach((callback) => {
        try {
          callback(this._state, keys, newValue, oldValue);
        } catch (error) {
          console.error("[betIQ-Plugin] Error in state subscriber:", error);
        }
      });
    },

    /**
     * Run effects for changed keys
     */
    _runEffects(changedKeys) {
      const keyArray = Array.isArray(changedKeys) ? changedKeys : [changedKeys];
      const executedEffects = new Set();

      keyArray.forEach((key) => {
        if (this._effects.has(key)) {
          this._effects.get(key).forEach((effect) => {
            // Prevent same effect from running multiple times
            if (!executedEffects.has(effect)) {
              executedEffects.add(effect);
              try {
                effect(this._state, key);
              } catch (error) {
                console.error(
                  `[betIQ-Plugin] Error in state effect for key "${key}":`,
                  error
                );
              }
            }
          });
        }
      });
    },
  };

  // Expose state management API
  window.betIQ.state = {
    get: (key) => configState.get(key),
    getAll: () => configState.getAll(),
    set: (key, value) => configState.set(key, value),
    setMultiple: (updates) => configState.setMultiple(updates),
    subscribe: (callback) => configState.subscribe(callback),
    addEffect: (keys, effect) => configState.addEffect(keys, effect),
    init: () => configState.init(),
  };

  /**
   * Set captured betting data (merges into cache instead of replacing)
   */
  window.betIQ.setCapturedBettingData = function (data) {
    if (Array.isArray(data)) {
      // Merge new data into cache using bet_id as key
      data.forEach((bet) => {
        if (bet && bet.bet_id) {
          bettingDataCache[bet.bet_id] = bet;
        }
      });
      console.log(
        `[betIQ-Plugin] Cached ${data.length} bets. Total in cache: ${
          Object.keys(bettingDataCache).length
        }`
      );
    }
  };

  /**
   * Get captured betting data as an array (from cache)
   */
  window.betIQ.getCapturedBettingData = function () {
    // Convert cache object to array
    return Object.values(bettingDataCache);
  };

  /**
   * Get cached betting data by bet_id
   */
  window.betIQ.getBettingDataById = function (betId) {
    return bettingDataCache[betId] || null;
  };

  /**
   * Clear the betting data cache
   */
  window.betIQ.clearBettingDataCache = function () {
    bettingDataCache = {};
  };

  /**
   * Get cache size (number of unique bets)
   */
  window.betIQ.getBettingDataCacheSize = function () {
    return Object.keys(bettingDataCache).length;
  };

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
