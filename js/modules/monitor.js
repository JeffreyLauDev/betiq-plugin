// Expected Monitor Amounts cell management
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  /**
   * Update Expected Monitor Amounts cell with EV × Manual Stake calculation
   */
  window.betIQ.updateMonitorCell = function (cell, row) {
    const betId = row.getAttribute("data-id");
    if (!betId) {
      cell.textContent = "—";
      return;
    }

    const betData =
      window.betIQ && window.betIQ.getBettingDataById
        ? window.betIQ.getBettingDataById(betId)
        : null;

    const stakeUsed =
      window.betIQ && window.betIQ.getStakeUsed
        ? window.betIQ.getStakeUsed(betId)
        : 0;

    if (!betData || stakeUsed === 0) {
      cell.textContent = "—";
      return;
    }

    const evPercentage = betData.ev_percentage;

    if (
      evPercentage === null ||
      evPercentage === undefined ||
      evPercentage === 0
    ) {
      cell.textContent = "—";
      return;
    }

    // Calculate Expected Monitor Amount: (EV% / 100) × Manual Stake
    const expectedMonitorAmount = (evPercentage / 100) * stakeUsed;

    const span = document.createElement("span");
    span.className = "font-medium text-black";
    span.style.fontWeight = "500";
    span.style.color = "#000000";
    span.textContent = `$${expectedMonitorAmount.toFixed(2)}`;

    cell.innerHTML = "";
    cell.appendChild(span);
  };
})();

