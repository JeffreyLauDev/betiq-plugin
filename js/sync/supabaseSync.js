// Supabase real-time sync module
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};
  window.betIQ.sync = window.betIQ.sync || {};

  /**
   * Logger utility with log levels
   * Respects debugEnabled setting from state
   */
  const logger = {
    isDebugEnabled() {
      return window.betIQ?.state?.get("config.debugEnabled") !== false;
    },
    debug(...args) {
      if (this.isDebugEnabled()) {
        console.log("[betIQ-Sync]", ...args);
      }
    },
    info(...args) {
      if (this.isDebugEnabled()) {
        console.log("[betIQ-Sync]", ...args);
      }
    },
    warn(...args) {
      console.warn("[betIQ-Sync]", ...args);
    },
    error(...args) {
      console.error("[betIQ-Sync]", ...args);
    },
  };

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
   * Tries multiple sources: state, cached session, and Supabase client
   */
  async function getCurrentUserId() {
    // First try state (fastest, synchronous)
    const userFromState = window.betIQ.auth?.getCurrentUser();
    if (userFromState?.id) {
      return userFromState.id;
    }

    // Try to get from Supabase client session (async)
    try {
      const client = await getSupabaseClient();
      if (client) {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (session?.user?.id) {
          // Update state if we found a session but state wasn't set
          if (window.betIQ.state && !userFromState) {
            window.betIQ.state.set("auth.user", session.user, {
              skipPersistence: true,
            });
            window.betIQ.state.set("auth.session", session, {
              skipPersistence: true,
            });
          }
          return session.user.id;
        }
      }
    } catch (error) {
      logger.debug("Error getting user from session:", error);
    }

    return null;
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
    logger.debug(`syncToSupabase called for ${path}`, value);
    const client = await getSupabaseClient();
    const userId = await getCurrentUserId();

    if (!client || !userId) {
      logger.warn(
        `Cannot sync ${path}: client=${!!client}, userId=${!!userId}`
      );
      // Try to refresh auth cache and retry once
      if (window.betIQ.auth?.refreshLoginCache) {
        await window.betIQ.auth.refreshLoginCache();
        const retryUserId = await getCurrentUserId();
        if (retryUserId && client) {
          logger.debug(`Retry successful, syncing ${path}...`);
          // Continue with sync using retryUserId
          // We'll use the retryUserId below
        } else {
          return; // Still no user ID after retry
        }
      } else {
        return; // Not logged in or client not available
      }
    }

    // Use retryUserId if we had to retry, otherwise use original userId
    const finalUserId = userId || (await getCurrentUserId());
    if (!finalUserId) {
      logger.warn(`Cannot sync ${path}: no user ID available after retry`);
      return;
    }

    // Only sync whitelisted paths
    if (!window.betIQ.state?.shouldSync(path)) {
      logger.warn(`Path ${path} is not in sync whitelist`);
      return;
    }

    logger.debug(`Syncing ${path} to Supabase for user ${finalUserId}`);

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
        // For shared bankroll/kelly: Update ALL users' configs when one user updates
        // This enables real-time shared config across all users
        const configKey =
          path === "config.bankroll" ? "bankroll" : "kelly_fraction";

        // First, get current user's existing config to preserve the other field
        const { data: existingConfig, error: fetchError } = await client
          .from("user_config")
          .select("*")
          .eq("user_id", finalUserId)
          .maybeSingle();

        if (fetchError) {
          logger.warn(
            "Error fetching existing config (will create new):",
            fetchError
          );
        }

        // Build update object for current user, preserving the other field
        const currentUserUpdateData = {
          user_id: finalUserId,
          [configKey]: value,
          updated_at: new Date().toISOString(),
        };

        // Preserve the other field if it exists
        if (existingConfig) {
          if (
            path === "config.bankroll" &&
            existingConfig.kelly_fraction !== null &&
            existingConfig.kelly_fraction !== undefined
          ) {
            currentUserUpdateData.kelly_fraction =
              existingConfig.kelly_fraction;
          } else if (
            path === "config.kellyFraction" &&
            existingConfig.bankroll !== null &&
            existingConfig.bankroll !== undefined
          ) {
            currentUserUpdateData.bankroll = existingConfig.bankroll;
          }
        }

        // Update current user's config first
        const { error: currentUserError } = await client
          .from("user_config")
          .upsert(currentUserUpdateData, {
            onConflict: "user_id",
          });

        if (currentUserError) {
          logger.error(`Error syncing ${path} to Supabase:`, currentUserError);
          return;
        }

        // Now update ALL other users' configs to match (shared config)
        // Get all other users (excluding current user to avoid duplicate update)
        const { data: allUsers, error: usersError } = await client
          .from("user_config")
          .select("user_id, bankroll, kelly_fraction")
          .neq("user_id", finalUserId);

        if (!usersError && allUsers && allUsers.length > 0) {
          // Update all other users (excluding current user)
          const updates = allUsers.map((userConfig) => {
            const updateData = {
              user_id: userConfig.user_id,
              [configKey]: value,
              updated_at: new Date().toISOString(),
            };

            // Preserve the other field for each user
            if (path === "config.bankroll") {
              updateData.kelly_fraction =
                userConfig.kelly_fraction !== null &&
                userConfig.kelly_fraction !== undefined
                  ? userConfig.kelly_fraction
                  : currentUserUpdateData.kelly_fraction;
            } else {
              updateData.bankroll =
                userConfig.bankroll !== null &&
                userConfig.bankroll !== undefined
                  ? userConfig.bankroll
                  : currentUserUpdateData.bankroll;
            }

            return updateData;
          });

          // Batch update all other users
          const { error: batchError } = await client
            .from("user_config")
            .upsert(updates, {
              onConflict: "user_id",
            });

          if (batchError) {
            logger.error(`Error updating all users' ${configKey}:`, batchError);
          } else {
            logger.debug(
              `Updated ${updates.length} other users' ${configKey} to ${value}`
            );
          }
        }

        // Always show success message
        console.log(
          `[betIQ-Sync] ✅ Successfully synced ${path} to Supabase (shared across all users):`,
          {
            bankroll:
              path === "config.bankroll"
                ? value
                : currentUserUpdateData.bankroll,
            kellyFraction:
              path === "config.kellyFraction"
                ? value
                : currentUserUpdateData.kelly_fraction,
            userId: finalUserId.substring(0, 8) + "...",
          }
        );
      } else if (path === "betting.stakeUsage") {
        // Stake usage is now a nested object { betId: { userId: amount } }
        // We need to extract current user's stakes and sync them
        if (typeof value === "object" && value !== null) {
          // Get all bet IDs
          const allBetIds = Object.keys(value);

          // Track which bets changed for current user
          const changedBets = [];

          for (const betId of allBetIds) {
            const betStakes = value[betId];
            const oldBetStakes = oldValue?.[betId];

            // Get current user's stake from new value
            const newUserStake =
              betStakes && typeof betStakes === "object"
                ? betStakes[finalUserId] || 0
                : 0;

            // Get current user's stake from old value
            const oldUserStake =
              oldBetStakes && typeof oldBetStakes === "object"
                ? oldBetStakes[finalUserId] || 0
                : 0;

            // Check if current user's stake changed
            if (newUserStake !== oldUserStake) {
              changedBets.push({ betId, stakeAmount: newUserStake });
            }
          }

          // Sync only current user's changed stakes
          for (const { betId, stakeAmount } of changedBets) {
            const { error } = await client
              .from("user_stake_allocations")
              .upsert(
                {
                  user_id: finalUserId,
                  bet_id: betId,
                  stake_amount: stakeAmount,
                  updated_at: new Date().toISOString(),
                },
                {
                  onConflict: "user_id,bet_id",
                }
              );

            if (error) {
              logger.error(`Error syncing stake for bet ${betId}:`, error);
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
            .eq("user_id", finalUserId);

          // Insert new combinations
          if (value.length > 0) {
            const combinations = value.map((combinationKey) => ({
              user_id: finalUserId,
              combination_key: combinationKey,
              created_at: new Date().toISOString(),
            }));

            const { error } = await client
              .from("user_mix_bet_combinations")
              .insert(combinations);

            if (error) {
              logger.error("Error syncing mix bet combinations:", error);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error syncing ${path} to Supabase:`, error);
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
   * For config (bankroll/kelly): Updates local state for shared config across all users
   * For stake allocations: Merges with existing data (per-user-per-bet)
   * For mix bet combinations: Reloads all combinations
   */
  async function handleRemoteChange(payload, eventType) {
    const userId = await getCurrentUserId();
    const remoteUserId = payload.new?.user_id || payload.old?.user_id;

    // Get remote user display name
    const remoteUserDisplayName = await getUserDisplayName(remoteUserId);

    try {
      // Determine which state path this change affects
      if (payload.table === "user_config") {
        const config = payload.new;

        // For shared bankroll/kelly config: Update local state when ANY user updates
        // This enables real-time shared config across all users
        let configUpdated = false;

        if (config.bankroll !== undefined && config.bankroll !== null) {
          const currentBankroll = window.betIQ.state.get("config.bankroll");
          if (currentBankroll !== config.bankroll) {
            window.betIQ.state.set("config.bankroll", config.bankroll, {
              fromRemote: true,
              skipPersistence: false,
            });
            configUpdated = true;
          }
        }

        if (
          config.kelly_fraction !== undefined &&
          config.kelly_fraction !== null
        ) {
          const currentKelly = window.betIQ.state.get("config.kellyFraction");
          if (currentKelly !== config.kelly_fraction) {
            window.betIQ.state.set(
              "config.kellyFraction",
              config.kelly_fraction,
              {
                fromRemote: true,
                skipPersistence: false,
              }
            );
            configUpdated = true;
          }
        }

        // Show notification if update came from another user
        if (configUpdated && remoteUserId !== userId) {
          const updates = [];
          if (config.bankroll !== undefined) {
            updates.push(`bankroll to $${config.bankroll?.toFixed(2) || 0}`);
          }
          if (config.kelly_fraction !== undefined) {
            updates.push(`Kelly fraction to ${config.kelly_fraction || 0}`);
          }

          if (updates.length > 0) {
            window.betIQ.snackbar?.show(
              `${remoteUserDisplayName} updated ${updates.join(" and ")}`,
              {
                type: "info",
                user: remoteUserDisplayName,
              }
            );
          }
        }
      } else if (payload.table === "user_stake_allocations") {
        const allocation = payload.new || payload.old;
        const betId = allocation.bet_id;
        const allocationUserId = allocation.user_id;

        if (eventType === "INSERT" || eventType === "UPDATE") {
          // Merge remote user's stake into local state
          const stakeUsage = window.betIQ.state.get("betting.stakeUsage") || {};

          // Initialize bet entry if it doesn't exist
          if (!stakeUsage[betId]) {
            stakeUsage[betId] = {};
          }

          // Update remote user's stake
          stakeUsage[betId][allocationUserId] = allocation.stake_amount || 0;

          // Update state with merged data
          window.betIQ.state.set("betting.stakeUsage", stakeUsage, {
            fromRemote: true,
            skipPersistence: false,
          });

          // Get bet info for better notification
          const betData = window.betIQ.getBettingDataById?.(betId);
          const betInfo = betData
            ? `${betData.player || "Unknown"} - ${betData.prop || "Unknown"}`
            : `bet ${betId.substring(0, 8)}...`;

          window.betIQ.snackbar?.show(
            `${remoteUserDisplayName} set stake for ${betInfo} to $${
              allocation.stake_amount?.toFixed(2) || 0
            }`,
            {
              type: "success",
              user: remoteUserDisplayName,
            }
          );
        } else if (eventType === "DELETE") {
          // Remove remote user's stake from local state
          const stakeUsage = window.betIQ.state.get("betting.stakeUsage") || {};

          if (stakeUsage[betId] && stakeUsage[betId][allocationUserId]) {
            delete stakeUsage[betId][allocationUserId];

            // Clean up empty bet entry
            if (Object.keys(stakeUsage[betId]).length === 0) {
              delete stakeUsage[betId];
            }

            // Update state
            window.betIQ.state.set("betting.stakeUsage", stakeUsage, {
              fromRemote: true,
              skipPersistence: false,
            });
          }

          window.betIQ.snackbar?.show(
            `${remoteUserDisplayName} cleared stake for bet ${
              betId?.substring(0, 8) || "unknown"
            }...`,
            {
              type: "info",
              user: remoteUserDisplayName,
            }
          );
        }
      } else if (payload.table === "user_mix_bet_combinations") {
        // Reload mix bet combinations from database (all users)
        loadMixBetCombinationsFromSupabase();
        window.betIQ.snackbar?.show(
          `${remoteUserDisplayName} updated mix bet combinations`,
          {
            type: "info",
            user: remoteUserDisplayName,
          }
        );
      }
    } catch (error) {
      logger.error("Error handling remote change:", error);
    }
  }

  /**
   * Load mix bet combinations from Supabase
   * Loads only current user's combinations (for local state)
   * Other frontends can query all users' combinations directly
   */
  async function loadMixBetCombinationsFromSupabase() {
    const client = await getSupabaseClient();
    const userId = await getCurrentUserId();

    if (!client || !userId) {
      return;
    }

    try {
      // Load only current user's combinations for local state
      // Other frontends can query all users' data directly from Supabase
      const { data, error } = await client
        .from("user_mix_bet_combinations")
        .select("combination_key")
        .eq("user_id", userId);

      if (error) {
        logger.error("Error loading mix bet combinations:", error);
        return;
      }

      const combinations = data.map((row) => row.combination_key);
      window.betIQ.state.set("betting.mixBetCombinations", combinations, {
        fromRemote: true,
        skipPersistence: false,
      });
    } catch (error) {
      logger.error("Error loading mix bet combinations:", error);
    }
  }

  /**
   * Setup real-time subscriptions
   * Now listens to ALL users' changes (RLS allows reading all data)
   * handleRemoteChange() will filter out own changes to avoid loops
   */
  async function setupRealtimeSubscriptions() {
    const client = await getSupabaseClient();
    const userId = await getCurrentUserId();

    if (!client || !userId) {
      return;
    }

    // Remove existing channel if any
    if (syncChannel) {
      client.removeChannel(syncChannel);
    }

    // Create new channel for real-time updates
    // No filter needed - RLS allows reading all data, and handleRemoteChange filters own changes
    syncChannel = client
      .channel("betiq-sync-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_config",
          // No filter - listen to all users (RLS handles security)
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
          // No filter - listen to all users (RLS handles security)
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
          // No filter - listen to all users (RLS handles security)
        },
        (payload) => {
          handleRemoteChange(payload, payload.eventType);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          logger.info("Real-time sync subscribed (all users)");
        } else if (status === "CHANNEL_ERROR") {
          logger.error("Real-time sync channel error");
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
          logger.debug("Skipping sync - change came from remote");
          return;
        }

        // Don't sync if not logged in
        const isLoggedIn = window.betIQ.auth?.isLoggedIn();
        if (!isLoggedIn) {
          // Always show this warning (not just debug mode)
          console.warn(
            "[betIQ-Sync] ⚠️ Skipping sync - user not logged in. Please log in to sync data."
          );
          return;
        }

        // Check if sync is initialized
        if (!isInitialized) {
          console.warn(
            "[betIQ-Sync] ⚠️ Sync not initialized. State changes won't be synced."
          );
          return;
        }

        // Process each changed path
        const paths = Array.isArray(changedPaths)
          ? changedPaths
          : [changedPaths];
        paths.forEach((path) => {
          const shouldSync = window.betIQ.state.shouldSync(path);
          logger.debug(
            `State change detected: ${path}, shouldSync: ${shouldSync}`,
            newValue
          );

          if (shouldSync) {
            logger.debug(`Queuing sync for ${path}`);
            console.log(`[betIQ-Sync] 📤 Queuing sync for ${path}:`, newValue);

            // Debounce sync operations
            // Preserve the EARLIEST oldValue to detect all changes in a batch
            if (!pendingChanges.has(path)) {
              // First change for this path - store both values
              pendingChanges.set(path, { newValue, oldValue });
            } else {
              // Subsequent change - update newValue but keep original oldValue
              const existing = pendingChanges.get(path);
              pendingChanges.set(path, {
                newValue: newValue,           // Latest value
                oldValue: existing.oldValue   // Original value before first change
              });
            }

            // Clear existing timeout
            if (syncTimeout) {
              clearTimeout(syncTimeout);
            }

            // Sync after 150ms debounce (reduced from 500ms for better UX)
            syncTimeout = setTimeout(() => {
              logger.debug(`Executing sync for ${pendingChanges.size} path(s)`);
              console.log(
                `[betIQ-Sync] 🚀 Executing sync for ${pendingChanges.size} path(s)`
              );
              pendingChanges.forEach((change, changePath) => {
                console.log(`[betIQ-Sync] Syncing ${changePath}...`);
                syncToSupabase(changePath, change.newValue, change.oldValue);
              });
              pendingChanges.clear();
            }, 150);
          } else {
            logger.debug(`Path ${path} is not in sync whitelist`);
            // Always warn if trying to sync a non-whitelisted path (might indicate a bug)
            if (path.startsWith("config.") || path.startsWith("betting.")) {
              console.warn(
                `[betIQ-Sync] ⚠️ Path ${path} is not in sync whitelist. Add it to _syncWhitelist in storage.js if it should sync.`
              );
            }
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
      logger.warn("Cannot initialize sync: user not logged in");
      return;
    }

    // Setup state sync hook
    setupStateSyncHook();

    // Setup real-time subscriptions (async)
    await setupRealtimeSubscriptions();

    // Load initial data from Supabase (async)
    await loadInitialDataFromSupabase();

    isInitialized = true;
    // Always log sync initialization (critical message)
    console.log("[betIQ-Sync] ✅ Sync initialized successfully");
    // Note: getCurrentUserId is now async, so we can't use it synchronously here
    // Just log that sync is initialized
    logger.debug("Sync status:", {
      hasChannel: !!syncChannel,
      syncHookSetup: true,
    });
  }

  /**
   * Load initial data from Supabase
   * Loads current user's data for local state
   * Other frontends can query all users' data directly from Supabase
   * Real-time subscriptions will handle updates from other users
   */
  async function loadInitialDataFromSupabase() {
    const client = await getSupabaseClient();
    const userId = await getCurrentUserId();

    if (!client || !userId) {
      return;
    }

    try {
      // Load current user's config (shared across all users)
      // Use .maybeSingle() instead of .single() to handle "no rows" gracefully
      let { data: configData, error: configError } = await client
        .from("user_config")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      // If current user has no config, load from any other user (shared config)
      if (!configData && !configError) {
        logger.debug(
          "Current user has no config, loading shared config from another user"
        );
        const { data: sharedConfigData, error: sharedConfigError } =
          await client.from("user_config").select("*").limit(1).maybeSingle();

        if (!sharedConfigError && sharedConfigData) {
          configData = sharedConfigData;
          logger.debug("Loaded shared config from another user:", configData);
        }
      }

      if (configError) {
        // Only log actual errors, not "no rows found" cases
        logger.error("Error loading user config from Supabase:", configError);
        logger.debug("Config error details:", {
          code: configError.code,
          message: configError.message,
          status: configError.status,
          details: configError.details,
        });
      } else if (configData) {
        logger.debug("Loaded user config from Supabase:", configData);
        if (configData.bankroll !== null && configData.bankroll !== undefined) {
          window.betIQ.state.set("config.bankroll", configData.bankroll, {
            fromRemote: true,
            skipPersistence: false,
          });
          logger.info(`Loaded bankroll from Supabase: $${configData.bankroll}`);
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
          logger.info(
            `Loaded kelly fraction from Supabase: ${configData.kelly_fraction}`
          );
        }
      } else {
        logger.debug(
          "No user config found in Supabase (first time user, no shared config exists)"
        );
      }

      // Load ALL users' stake allocations and merge into nested structure
      const { data: stakeData, error: stakeError } = await client
        .from("user_stake_allocations")
        .select("*");
      // No .eq("user_id", userId) - load all users' stakes

      if (!stakeError && stakeData) {
        // Merge into nested structure: { betId: { userId: amount } }
        const stakeUsage = {};
        stakeData.forEach((allocation) => {
          const betId = allocation.bet_id;
          const allocationUserId = allocation.user_id;
          const stakeAmount = allocation.stake_amount;

          if (!stakeUsage[betId]) {
            stakeUsage[betId] = {};
          }
          stakeUsage[betId][allocationUserId] = stakeAmount;
        });
        window.betIQ.state.set("betting.stakeUsage", stakeUsage, {
          fromRemote: true,
          skipPersistence: false,
        });
      }

      // Load current user's mix bet combinations
      await loadMixBetCombinationsFromSupabase();

      logger.info("Initial data loaded. Real-time sync active for all users.");
    } catch (error) {
      logger.error("Error loading initial data:", error);
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
    logger.info("Sync stopped");
  }

  /**
   * Verify data in Supabase
   * Useful for debugging - checks if data was actually saved
   */
  async function verifyDataInSupabase() {
    const client = await getSupabaseClient();
    const userId = await getCurrentUserId();

    if (!client || !userId) {
      console.warn("[betIQ-Sync] ⚠️ Cannot verify: not logged in");
      return null;
    }

    try {
      // Check user config
      const { data: configData, error: configError } = await client
        .from("user_config")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (configError) {
        console.error("[betIQ-Sync] ❌ Error verifying config:", configError);
        return null;
      }

      const result = {
        userId: userId.substring(0, 8) + "...",
        config: configData || { message: "No config found (new user)" },
        timestamp: new Date().toISOString(),
      };

      console.log("[betIQ-Sync] 📊 Current data in Supabase:", result);
      return result;
    } catch (error) {
      console.error("[betIQ-Sync] ❌ Error verifying data:", error);
      return null;
    }
  }

  // Expose API
  window.betIQ.sync = {
    initialize,
    stop,
    syncToSupabase,
    handleRemoteChange,
    verifyDataInSupabase, // Add verification function
    // Debug helpers
    getStatus: async () => {
      const status = {
        isInitialized,
        isLoggedIn: window.betIQ.auth?.isLoggedIn() || false,
        userId: await getCurrentUserId(),
        pendingChanges: pendingChanges.size,
        hasChannel: !!syncChannel,
      };
      console.log("[betIQ-Sync] 📊 Sync Status:", status);
      return status;
    },
    // Force sync current state (for testing)
    forceSync: async (path) => {
      if (!path) {
        logger.warn("forceSync requires a path (e.g., 'config.bankroll')");
        return;
      }
      const value = window.betIQ.state?.get(path);
      if (value === undefined) {
        logger.warn(`Path ${path} not found in state`);
        return;
      }
      console.log(`[betIQ-Sync] 🔄 Force syncing ${path}...`);
      await syncToSupabase(path, value, null);
    },
    // Test sync for bankroll and kelly
    testSync: async () => {
      console.log("[betIQ-Sync] 🧪 Testing sync...");
      const bankroll = window.betIQ.state?.get("config.bankroll");
      const kelly = window.betIQ.state?.get("config.kellyFraction");
      console.log("[betIQ-Sync] Current values:", { bankroll, kelly });
      console.log("[betIQ-Sync] Sync status:", window.betIQ.sync.getStatus());

      if (bankroll !== null && bankroll !== undefined) {
        console.log("[betIQ-Sync] Testing bankroll sync...");
        await syncToSupabase("config.bankroll", bankroll, null);
      }
      if (kelly !== null && kelly !== undefined) {
        console.log("[betIQ-Sync] Testing kelly fraction sync...");
        await syncToSupabase("config.kellyFraction", kelly, null);
      }
    },
  };
})();
