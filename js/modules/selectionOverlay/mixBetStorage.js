// Mix bet storage and combinatorics utilities
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};
  window.betIQ.mixBetStorage = window.betIQ.mixBetStorage || {};

  /**
   * Get used mix bet combinations from centralized state
   * Data comes from Supabase only, no localStorage fallback
   */
  function getUsedMixBetCombinations() {
    if (window.betIQ && window.betIQ.state) {
      const combinations =
        window.betIQ.state.get("betting.mixBetCombinations") || [];
      return JSON.parse(JSON.stringify(combinations));
    }
    // Return empty array if state not available (data will load from Supabase)
    return [];
  }

  /**
   * Save a mix bet combination as used (uses centralized state, syncs to Supabase)
   */
  function saveUsedMixBetCombination(betIds) {
    try {
      const raw = getUsedMixBetCombinations();

      // Deep clone to avoid reference mutation
      const used = typeof structuredClone === "function"
        ? structuredClone(raw)
        : JSON.parse(JSON.stringify(raw));

      // Sort a copy of betIds to avoid mutating the input array
      const combinationKey = [...betIds].sort().join(",");
      if (!used.includes(combinationKey)) {
        used.push(combinationKey);

        // Save to centralized state (will sync to Supabase)
        if (window.betIQ && window.betIQ.state) {
          window.betIQ.state.set("betting.mixBetCombinations", used);
        } else {
          console.warn(
            "[betIQ-Plugin] State not available, cannot save mix bet combination"
          );
        }
      }
    } catch (e) {
      console.error("[betIQ-Plugin] Error saving mix bet combination:", e);
    }
  }

  /**
   * Generate all combinations of a given size from an array
   */
  function generateCombinations(arr, size) {
    if (size === 0) return [[]];
    if (arr.length === 0) return [];

    const [first, ...rest] = arr;
    const withFirst = generateCombinations(rest, size - 1).map((combo) => [
      first,
      ...combo,
    ]);
    const withoutFirst = generateCombinations(rest, size);

    return [...withFirst, ...withoutFirst];
  }

  /**
   * Check if a mix bet combination has been used
   * Also checks if any subset of the combination has been used
   * Returns: { isUsed: boolean, blockedBetIds: string[] } - blockedBetIds contains ALL bet IDs that are part of any used subset
   */
  function isMixBetCombinationUsed(betIds) {
    const used = getUsedMixBetCombinations();
    if (used.length === 0) {
      return { isUsed: false, blockedBetIds: [] };
    }

    const sortedBetIds = [...betIds].sort();
    const combinationKey = sortedBetIds.join(",");

    // Check if exact combination is used
    if (used.includes(combinationKey)) {
      return { isUsed: true, blockedBetIds: sortedBetIds };
    }

    // Check if any subset of this combination has been used
    // Collect ALL bet IDs that are part of any used subset
    const blockedBetIdsSet = new Set();

    // Generate all possible subsets of size 2, 3, etc. (up to current size - 1)
    for (let subsetSize = 2; subsetSize < sortedBetIds.length; subsetSize++) {
      // Generate all combinations of this size
      const subsets = generateCombinations(sortedBetIds, subsetSize);

      for (const subset of subsets) {
        // Sort subset before joining to match how combinations are saved
        const subsetKey = [...subset].sort().join(",");
        if (used.includes(subsetKey)) {
          // Found a used subset - add all bet IDs from this subset to blocked set
          subset.forEach((betId) => blockedBetIdsSet.add(betId));
        }
      }
    }

    // If we found any blocked bets, the combination is blocked
    if (blockedBetIdsSet.size > 0) {
      return { isUsed: true, blockedBetIds: Array.from(blockedBetIdsSet) };
    }

    return { isUsed: false, blockedBetIds: [] };
  }

  // Expose functions
  window.betIQ.mixBetStorage.getUsedMixBetCombinations =
    getUsedMixBetCombinations;
  window.betIQ.mixBetStorage.saveUsedMixBetCombination =
    saveUsedMixBetCombination;
  window.betIQ.mixBetStorage.isMixBetCombinationUsed = isMixBetCombinationUsed;
})();
