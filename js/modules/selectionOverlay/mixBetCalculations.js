// Mix bet calculation utilities
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};
  window.betIQ.mixBetCalculations = window.betIQ.mixBetCalculations || {};

  /**
   * Calculate mix bet EV
   * Formula: Sum of individual bet EV percentages
   */
  function calculateMixBetEV(betDataArray) {
    if (!betDataArray || betDataArray.length < 2) {
      return null;
    }

    let totalEV = 0;
    let allValid = true;

    for (const betData of betDataArray) {
      const evPercentage = betData.ev_percentage;

      if (evPercentage === null || evPercentage === undefined) {
        allValid = false;
        break;
      }

      totalEV += evPercentage;
    }

    if (!allValid) {
      return null;
    }

    return totalEV;
  }

  /**
   * Calculate minimum stake allowed for mix bet
   * Formula: (CombinedEV% / 100) / (CombinedOdds - 1) × Bankroll × Kelly Fraction
   * CombinedEV = sum of individual bet EV percentages
   * CombinedOdds = product of all odds
   * Then capped at the minimum stake allowed of individual bets
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

    // Calculate combined EV (sum of individual EV percentages)
    let combinedEV = 0;
    let combinedOdds = 1;
    let allValid = true;

    for (const betData of betDataArray) {
      const evPercentage = betData.ev_percentage;
      const odds = betData.odds;

      if (
        evPercentage === null ||
        evPercentage === undefined ||
        odds === null ||
        odds === undefined ||
        odds <= 1
      ) {
        allValid = false;
        break;
      }

      combinedEV += evPercentage;
      combinedOdds *= odds;
    }

    if (!allValid) {
      return null;
    }

    // Calculate mix bet stake allowed using the same formula as individual bets
    // Formula: (EV% / 100) / (Odds - 1) × Bankroll × Kelly Fraction
    const mixBetStakeAllowed =
      (combinedEV / 100 / (combinedOdds - 1)) * bankroll * kellyFraction;

    if (mixBetStakeAllowed < 0) {
      return null;
    }

    // Calculate minimum stake allowed from individual bets
    // Accounts for existing manual allocations: min(stake allowed - manual allocations)
    let minIndividualStakeAllowed = null;

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

        if (
          minIndividualStakeAllowed === null ||
          availableStake < minIndividualStakeAllowed
        ) {
          minIndividualStakeAllowed = availableStake;
        }
      }
    }

    // Return the minimum of mix bet stake allowed and minimum individual stake allowed
    if (minIndividualStakeAllowed === null) {
      return mixBetStakeAllowed;
    }

    return Math.min(mixBetStakeAllowed, minIndividualStakeAllowed);
  }

  // Expose functions
  window.betIQ.mixBetCalculations.calculateMixBetEV = calculateMixBetEV;
  window.betIQ.mixBetCalculations.calculateMinStakeAllowed =
    calculateMinStakeAllowed;
})();


