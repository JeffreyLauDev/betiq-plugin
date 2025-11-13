// Mix bet storage and combinatorics utilities
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};
  window.betIQ.mixBetStorage = window.betIQ.mixBetStorage || {};

  /**
   * Get used mix bet combinations from centralized state
   */
  function getUsedMixBetCombinations() {
    if (window.betIQ && window.betIQ.state) {
      return window.betIQ.state.get("betting.mixBetCombinations") || [];
    }
    // Fallback to localStorage if state not available
    try {
      const stored = localStorage.getItem("betiq-used-mix-bets");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Save a mix bet combination as used (uses centralized state)
   */
  function saveUsedMixBetCombination(betIds) {
    try {
      const used = getUsedMixBetCombinations();
      const combinationKey = betIds.sort().join(",");
      if (!used.includes(combinationKey)) {
        used.push(combinationKey);
        
        // Save to centralized state
        if (window.betIQ && window.betIQ.state) {
          window.betIQ.state.set("betting.mixBetCombinations", used);
        } else {
          // Fallback to localStorage
          localStorage.setItem("betiq-used-mix-bets", JSON.stringify(used));
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
        const subsetKey = subset.join(",");
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
  window.betIQ.mixBetStorage.getUsedMixBetCombinations = getUsedMixBetCombinations;
  window.betIQ.mixBetStorage.saveUsedMixBetCombination = saveUsedMixBetCombination;
  window.betIQ.mixBetStorage.isMixBetCombinationUsed = isMixBetCombinationUsed;
})();
