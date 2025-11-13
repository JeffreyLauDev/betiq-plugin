// Kelly Stake calculation and cell management
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  /**
   * Calculate Stake Allowed value using Kelly Criterion formula
   * Formula: ((ev_percentage / 100) / (odds - 1)) × Bankroll × Kelly Fraction
   */
  function calculateStakeAllowed(betData, bankroll, kellyFraction) {
    if (!betData || !bankroll || !kellyFraction) {
      return null;
    }

    const evPercentage = betData.ev_percentage;
    const odds = betData.odds;

    if (
      evPercentage === null ||
      evPercentage === undefined ||
      odds === null ||
      odds === undefined ||
      odds <= 1
    ) {
      return null;
    }

    const stake = (evPercentage / 100 / (odds - 1)) * bankroll * kellyFraction;
    return stake >= 0 ? stake : null;
  }

  // Expose for use in other modules
  window.betIQ.calculateStakeAllowed = calculateStakeAllowed;

  /**
   * Format stake amount for display
   */
  function formatStakeAmount(amount) {
    if (amount === null || amount === undefined) {
      return "N/A";
    }
    return amount.toFixed(2);
  }

  /**
   * Create and show custom tooltip
   */
  function showTooltip(element, tooltipText) {
    const existingTooltip = document.getElementById("betiq-stake-tooltip");
    if (existingTooltip) {
      existingTooltip.remove();
    }

    const tooltip = document.createElement("div");
    tooltip.id = "betiq-stake-tooltip";
    tooltip.style.cssText = `
      position: fixed;
      background-color: #ffffff;
      color: #1f2937;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.5;
      max-width: 350px;
      white-space: pre-line;
      z-index: 10000;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
      border: 1px solid #e5e7eb;
      pointer-events: none;
      font-family: monospace;
    `;
    tooltip.textContent = tooltipText;

    document.body.appendChild(tooltip);

    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.bottom + 10;

    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
      left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight - 10) {
      top = rect.top - tooltipRect.height - 10;
    }

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";

    return tooltip;
  }

  /**
   * Hide custom tooltip
   */
  function hideTooltip() {
    const tooltip = document.getElementById("betiq-stake-tooltip");
    if (tooltip) {
      tooltip.remove();
    }
  }

  /**
   * Update Stake Allowed cell with calculated value
   */
  window.betIQ.updateStakeAllowedCell = function (cell, row) {
    const betId = row.getAttribute("data-id");
    if (!betId) {
      const span = document.createElement("span");
      span.className = "font-medium text-black";
      span.style.fontWeight = "500";
      span.style.color = "#000000";
      span.textContent = "—";
      cell.innerHTML = "";
      cell.appendChild(span);
      cell.onmouseenter = null;
      cell.onmouseleave = null;
      return;
    }

    const betData =
      window.betIQ && window.betIQ.getBettingDataById
        ? window.betIQ.getBettingDataById(betId)
        : null;

    if (!betData) {
      const span = document.createElement("span");
      span.className = "font-medium text-black";
      span.style.fontWeight = "500";
      span.style.color = "#000000";
      span.textContent = "—";
      cell.innerHTML = "";
      cell.appendChild(span);
      cell.onmouseenter = null;
      cell.onmouseleave = null;
      return;
    }

    const bankroll =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("config.bankroll")
        : null;
    const kellyFraction =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("config.kellyFraction")
        : null;

    const stakeAmount = calculateStakeAllowed(betData, bankroll, kellyFraction);

    let tooltipText = "";
    if (stakeAmount !== null) {
      const evPercentage = betData.ev_percentage || 0;
      const odds = betData.odds || 0;
      const kellyPercent = (evPercentage / 100 / (odds - 1)).toFixed(4);
      const beforeKelly = (kellyPercent * bankroll).toFixed(2);

      tooltipText = `EV%: ${evPercentage}% | Odds: ${odds} | Bankroll: $${
        bankroll || 0
      } | Kelly: ${
        kellyFraction || 0
      }\n\nFormula: (EV% / 100) / (Odds - 1) × Bankroll × Kelly Fraction\n\n${kellyPercent} × $${
        bankroll || 0
      } × ${kellyFraction || 0} = $${beforeKelly} × ${
        kellyFraction || 0
      } = $${formatStakeAmount(
        stakeAmount
      )}\n\nStake Allowed: $${formatStakeAmount(stakeAmount)}`;

      const span = document.createElement("span");
      span.className = "font-medium text-black";
      span.style.fontWeight = "500";
      span.style.color = "#000000";
      span.style.cursor = "help";
      span.textContent = `$${formatStakeAmount(stakeAmount)}`;

      cell.innerHTML = "";
      cell.appendChild(span);

      cell.onmouseenter = (e) => {
        showTooltip(cell, tooltipText);
      };
      cell.onmouseleave = () => {
        hideTooltip();
      };
    } else {
      const span = document.createElement("span");
      span.className = "font-medium text-black";
      span.style.fontWeight = "500";
      span.style.color = "#000000";
      span.textContent = "—";
      cell.innerHTML = "";
      cell.appendChild(span);
      tooltipText =
        "Stake Allowed (requires Bankroll and Kelly Fraction to be set)";

      cell.onmouseenter = (e) => {
        showTooltip(cell, tooltipText);
      };
      cell.onmouseleave = () => {
        hideTooltip();
      };
    }
  };
})();
