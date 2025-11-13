// Mix bet calculation utilities
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};
  window.betIQ.mixBetCalculations = window.betIQ.mixBetCalculations || {};

  /**
   * Calculate mix bet EV
   * Formula: ((boosted odds1 × boosted odds2 × ...) - (real odds1 × real odds2 × ...)) / (real odds1 × real odds2 × ...) × 100
   */
  function calculateMixBetEV(betDataArray) {
    if (!betDataArray || betDataArray.length < 2) {
      return null;
    }

    let boostedProduct = 1;
    let realProduct = 1;
    let allValid = true;

    for (const betData of betDataArray) {
      const boostedOdds = betData.odds;
      const realOdds = betData.true_odds;

      if (!boostedOdds || !realOdds || boostedOdds <= 1 || realOdds <= 1) {
        allValid = false;
        break;
      }

      boostedProduct *= boostedOdds;
      realProduct *= realOdds;
    }

    if (!allValid) {
      return null;
    }

    const ev = ((boostedProduct - realProduct) / realProduct) * 100;
    return ev;
  }

  /**
   * Calculate minimum stake allowed across all bets
   * Accounts for existing manual allocations: min(stake allowed - manual allocations)
   */
  function calculateMinStakeAllowed(betDataArray, selectedBetIds) {
    if (!betDataArray || betDataArray.length === 0) {
      return null;
    }

      const bankroll =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("config.bankroll")
        : null;
    const kellyFraction =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("config.kellyFraction")
        : null;

    if (!bankroll || !kellyFraction) {
      return null;
    }

    let minAvailableStake = null;

    for (let i = 0; i < betDataArray.length; i++) {
      const betData = betDataArray[i];
      const betId =
        selectedBetIds && selectedBetIds[i] ? selectedBetIds[i] : null;

      const stakeAllowed =
        window.betIQ && window.betIQ.calculateStakeAllowed
          ? window.betIQ.calculateStakeAllowed(betData, bankroll, kellyFraction)
          : null;

      if (stakeAllowed !== null && stakeAllowed > 0) {
        // Get existing manual allocation for this bet
        const existingStake =
          betId && window.betIQ && window.betIQ.getStakeUsed
            ? window.betIQ.getStakeUsed(betId)
            : 0;

        // Calculate available stake (stake allowed - manual allocations)
        const availableStake = Math.max(0, stakeAllowed - existingStake);

        if (minAvailableStake === null || availableStake < minAvailableStake) {
          minAvailableStake = availableStake;
        }
      }
    }

    return minAvailableStake;
  }

  // Expose functions
  window.betIQ.mixBetCalculations.calculateMixBetEV = calculateMixBetEV;
  window.betIQ.mixBetCalculations.calculateMinStakeAllowed = calculateMinStakeAllowed;
})();

