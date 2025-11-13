// Supabase real-time sync module
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};
  window.betIQ.sync = window.betIQ.sync || {};

  let syncChannel = null;
  let isInitialized = false;
  let pendingChanges = new Map(); // Track changes waiting to sync
  let syncTimeout = null;

  /**
   * Get Supabase client from auth module (async)
   */
  async function getSupabaseClient() {
    if (window.betIQ.auth && window.betIQ.auth.getSupabaseClient) {
      return await window.betIQ.auth.getSupabaseClient();
    }
    return null;
  }

  /**
   * Get current user ID
   */
  function getCurrentUserId() {
    const user = window.betIQ.auth?.getCurrentUser();
    return user?.id || null;
  }

  /**
   * Get current user email/username
   */
  function getCurrentUserDisplayName() {
    const user = window.betIQ.auth?.getCurrentUser();
    return user?.email || user?.user_metadata?.username || "Unknown User";
  }

  /**
   * Sync a state change to Supabase
   */
  async function syncToSupabase(path, value, oldValue) {
    const client = await getSupabaseClient();
    const userId = getCurrentUserId();

    if (!client || !userId) {
      return; // Not logged in or client not available
    }

    // Only sync whitelisted paths
    if (!window.betIQ.state?.shouldSync(path)) {
      return;
    }

    try {
      // Map state paths to database tables
      const tableMapping = {
        "config.bankroll": "user_config",
        "config.kellyFraction": "user_config",
        "betting.stakeUsage": "user_stake_allocations",
        "betting.mixBetCombinations": "user_mix_bet_combinations",
      };

      const table = tableMapping[path];
      if (!table) {
        return; // No table mapping for this path
      }

      // Handle different state paths
      if (path === "config.bankroll" || path === "config.kellyFraction") {
        // Upsert user config
        const configKey =
          path === "config.bankroll" ? "bankroll" : "kelly_fraction";
        const { error } = await client.from("user_config").upsert(
          {
            user_id: userId,
            [configKey]: value,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        );

        if (error) {
          console.error(`[betIQ-Plugin] Error syncing ${path}:`, error);
        }
      } else if (path === "betting.stakeUsage") {
        // Stake usage is an object { betId: amount }
        // We need to sync individual bet allocations
        if (typeof value === "object" && value !== null) {
          // Get all bet IDs that changed
          const changedBets = Object.keys(value).filter(
            (betId) => !oldValue || oldValue[betId] !== value[betId]
          );

          for (const betId of changedBets) {
            const stakeAmount = value[betId] || 0;

            const { error } = await client
              .from("user_stake_allocations")
              .upsert(
                {
                  user_id: userId,
                  bet_id: betId,
                  stake_amount: stakeAmount,
                  updated_at: new Date().toISOString(),
                },
                {
                  onConflict: "user_id,bet_id",
                }
              );

            if (error) {
              console.error(
                `[betIQ-Plugin] Error syncing stake for bet ${betId}:`,
                error
              );
            }
          }
        }
      } else if (path === "betting.mixBetCombinations") {
        // Mix bet combinations is an array of strings
        // We need to sync all combinations
        if (Array.isArray(value)) {
          // Delete all existing combinations for this user
          await client
            .from("user_mix_bet_combinations")
            .delete()
            .eq("user_id", userId);

          // Insert new combinations
          if (value.length > 0) {
            const combinations = value.map((combinationKey) => ({
              user_id: userId,
              combination_key: combinationKey,
              created_at: new Date().toISOString(),
            }));

            const { error } = await client
              .from("user_mix_bet_combinations")
              .insert(combinations);

            if (error) {
              console.error(
                "[betIQ-Plugin] Error syncing mix bet combinations:",
                error
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(`[betIQ-Plugin] Error syncing ${path} to Supabase:`, error);
    }
  }

  // Cache for user display names
  const userDisplayNameCache = new Map();

  /**
   * Get user display name from user_id
   * Tries to get from cache, or fetches from Supabase
   */
  async function getUserDisplayName(userId) {
    if (!userId) return "Another user";

    // Check cache first
    if (userDisplayNameCache.has(userId)) {
      return userDisplayNameCache.get(userId);
    }

    const client = await getSupabaseClient();
    if (!client) {
      const fallback = "User " + userId.substring(0, 8);
      userDisplayNameCache.set(userId, fallback);
      return fallback;
    }

    try {
      // Try to get user info from auth.users via admin API
      // Note: This requires a public function in Supabase or storing email in tables
      // For now, we'll use a fallback approach

      // Option 1: If you add user_email column to your tables, use that
      // Option 2: Create a Supabase function to get user email
      // Option 3: Store username in user_metadata during signup

      // Fallback: Use shortened user ID
      const displayName = "User " + userId.substring(0, 8);
      userDisplayNameCache.set(userId, displayName);
      return displayName;
    } catch (error) {
      const fallback = "Another user";
      userDisplayNameCache.set(userId, fallback);
      return fallback;
    }
  }

  /**
   * Handle remote change from Supabase
   */
  async function handleRemoteChange(payload, eventType) {
    const userId = getCurrentUserId();
    const remoteUserId = payload.new?.user_id || payload.old?.user_id;

    // Don't process our own changes
    if (remoteUserId === userId) {
      return;
    }

    // Get remote user display name
    const remoteUserDisplayName = await getUserDisplayName(remoteUserId);

    try {
      // Determine which state path this change affects
      if (payload.table === "user_config") {
        const config = payload.new;
        if (config.bankroll !== undefined) {
          window.betIQ.state.set("config.bankroll", config.bankroll, {
            fromRemote: true,
            skipPersistence: false,
          });
          window.betIQ.snackbar?.show(
            `Updated bankroll to $${config.bankroll?.toFixed(2) || 0}`,
            {
              type: "info",
              user: remoteUserDisplayName,
            }
          );
        }
        if (config.kelly_fraction !== undefined) {
          window.betIQ.state.set(
            "config.kellyFraction",
            config.kelly_fraction,
            {
              fromRemote: true,
              skipPersistence: false,
            }
          );
          window.betIQ.snackbar?.show(
            `Updated Kelly fraction to ${config.kelly_fraction || 0}`,
            {
              type: "info",
              user: remoteUserDisplayName,
            }
          );
        }
      } else if (payload.table === "user_stake_allocations") {
        const allocation = payload.new;
        if (eventType === "INSERT" || eventType === "UPDATE") {
          // Update local stake usage
          const stakeUsage = window.betIQ.state.get("betting.stakeUsage") || {};
          stakeUsage[allocation.bet_id] = allocation.stake_amount;
          window.betIQ.state.set("betting.stakeUsage", stakeUsage, {
            fromRemote: true,
            skipPersistence: false,
          });

          // Get bet info for better notification
          const betData = window.betIQ.getBettingDataById?.(allocation.bet_id);
          const betInfo = betData
            ? `${betData.player || "Unknown"} - ${betData.prop || "Unknown"}`
            : `bet ${allocation.bet_id.substring(0, 8)}...`;

          window.betIQ.snackbar?.show(
            `Set stake for ${betInfo} to $${
              allocation.stake_amount?.toFixed(2) || 0
            }`,
            {
              type: "success",
              user: remoteUserDisplayName,
            }
          );
        } else if (eventType === "DELETE") {
          // Remove from local stake usage
          const stakeUsage = window.betIQ.state.get("betting.stakeUsage") || {};
          delete stakeUsage[allocation.bet_id];
          window.betIQ.state.set("betting.stakeUsage", stakeUsage, {
            fromRemote: true,
            skipPersistence: false,
          });

          window.betIQ.snackbar?.show(
            `Cleared stake for bet ${
              allocation.bet_id?.substring(0, 8) || "unknown"
            }...`,
            {
              type: "info",
              user: remoteUserDisplayName,
            }
          );
        }
      } else if (payload.table === "user_mix_bet_combinations") {
        // Reload mix bet combinations from database
        loadMixBetCombinationsFromSupabase();
        window.betIQ.snackbar?.show(`Updated mix bet combinations`, {
          type: "info",
          user: remoteUserDisplayName,
        });
      }
    } catch (error) {
      console.error("[betIQ-Plugin] Error handling remote change:", error);
    }
  }

  /**
   * Load mix bet combinations from Supabase
   */
  async function loadMixBetCombinationsFromSupabase() {
    const client = await getSupabaseClient();
    const userId = getCurrentUserId();

    if (!client || !userId) {
      return;
    }

    try {
      const { data, error } = await client
        .from("user_mix_bet_combinations")
        .select("combination_key")
        .eq("user_id", userId);

      if (error) {
        console.error(
          "[betIQ-Plugin] Error loading mix bet combinations:",
          error
        );
        return;
      }

      const combinations = data.map((row) => row.combination_key);
      window.betIQ.state.set("betting.mixBetCombinations", combinations, {
        fromRemote: true,
        skipPersistence: false,
      });
    } catch (error) {
      console.error(
        "[betIQ-Plugin] Error loading mix bet combinations:",
        error
      );
    }
  }

  /**
   * Setup real-time subscriptions
   */
  async function setupRealtimeSubscriptions() {
    const client = await getSupabaseClient();
    const userId = getCurrentUserId();

    if (!client || !userId) {
      return;
    }

    // Remove existing channel if any
    if (syncChannel) {
      client.removeChannel(syncChannel);
    }

    // Create new channel for real-time updates
    syncChannel = client
      .channel("betiq-sync-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_config",
          filter: `user_id=neq.${userId}`, // Only listen to other users
        },
        (payload) => {
          handleRemoteChange(payload, payload.eventType);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_stake_allocations",
          filter: `user_id=neq.${userId}`, // Only listen to other users
        },
        (payload) => {
          handleRemoteChange(payload, payload.eventType);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_mix_bet_combinations",
          filter: `user_id=neq.${userId}`, // Only listen to other users
        },
        (payload) => {
          handleRemoteChange(payload, payload.eventType);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[betIQ-Plugin] Real-time sync subscribed");
        } else if (status === "CHANNEL_ERROR") {
          console.error("[betIQ-Plugin] Real-time sync channel error");
        }
      });
  }

  /**
   * Hook into state changes to sync to Supabase
   */
  function setupStateSyncHook() {
    if (!window.betIQ.state) {
      return;
    }

    // Subscribe to state changes
    window.betIQ.state.subscribe(
      (state, changedPaths, newValue, oldValue, options) => {
        // Don't sync if change came from remote
        if (options?.fromRemote) {
          return;
        }

        // Don't sync if not logged in
        if (!window.betIQ.auth?.isLoggedIn()) {
          return;
        }

        // Process each changed path
        const paths = Array.isArray(changedPaths)
          ? changedPaths
          : [changedPaths];
        paths.forEach((path) => {
          if (window.betIQ.state.shouldSync(path)) {
            // Debounce sync operations
            pendingChanges.set(path, { newValue, oldValue });

            // Clear existing timeout
            if (syncTimeout) {
              clearTimeout(syncTimeout);
            }

            // Sync after 500ms debounce
            syncTimeout = setTimeout(() => {
              pendingChanges.forEach((change, changePath) => {
                syncToSupabase(changePath, change.newValue, change.oldValue);
              });
              pendingChanges.clear();
            }, 500);
          }
        });
      }
    );
  }

  /**
   * Initialize sync (call after login)
   */
  async function initialize() {
    if (isInitialized) {
      return;
    }

    if (!window.betIQ.auth?.isLoggedIn()) {
      console.warn("[betIQ-Plugin] Cannot initialize sync: user not logged in");
      return;
    }

    // Setup state sync hook
    setupStateSyncHook();

    // Setup real-time subscriptions (async)
    await setupRealtimeSubscriptions();

    // Load initial data from Supabase (async)
    await loadInitialDataFromSupabase();

    isInitialized = true;
    console.log("[betIQ-Plugin] Sync initialized");
  }

  /**
   * Load initial data from Supabase
   */
  async function loadInitialDataFromSupabase() {
    const client = await getSupabaseClient();
    const userId = getCurrentUserId();

    if (!client || !userId) {
      return;
    }

    try {
      // Load user config
      const { data: configData, error: configError } = await client
        .from("user_config")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (!configError && configData) {
        if (configData.bankroll !== null && configData.bankroll !== undefined) {
          window.betIQ.state.set("config.bankroll", configData.bankroll, {
            fromRemote: true,
            skipPersistence: false,
          });
        }
        if (
          configData.kelly_fraction !== null &&
          configData.kelly_fraction !== undefined
        ) {
          window.betIQ.state.set(
            "config.kellyFraction",
            configData.kelly_fraction,
            {
              fromRemote: true,
              skipPersistence: false,
            }
          );
        }
      }

      // Load stake allocations
      const { data: stakeData, error: stakeError } = await client
        .from("user_stake_allocations")
        .select("*")
        .eq("user_id", userId);

      if (!stakeError && stakeData) {
        const stakeUsage = {};
        stakeData.forEach((allocation) => {
          stakeUsage[allocation.bet_id] = allocation.stake_amount;
        });
        window.betIQ.state.set("betting.stakeUsage", stakeUsage, {
          fromRemote: true,
          skipPersistence: false,
        });
      }

      // Load mix bet combinations
      await loadMixBetCombinationsFromSupabase();
    } catch (error) {
      console.error("[betIQ-Plugin] Error loading initial data:", error);
    }
  }

  /**
   * Stop sync (call on logout)
   */
  async function stop() {
    const client = await getSupabaseClient();
    if (client && syncChannel) {
      client.removeChannel(syncChannel);
      syncChannel = null;
    }

    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }

    pendingChanges.clear();
    isInitialized = false;
    console.log("[betIQ-Plugin] Sync stopped");
  }

  // Expose API
  window.betIQ.sync = {
    initialize,
    stop,
    syncToSupabase,
    handleRemoteChange,
  };
})();
