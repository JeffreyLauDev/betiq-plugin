// Allocation cell management with color indicators
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  /**
   * Calculate color based on stake usage percentage
   * Green (0-50%), Yellow (50-100%), Orange (approaching 100%), Black (100%)
   */
  function getStakeAvailabilityColor(percentage) {
    if (percentage >= 1.0) {
      return `rgb(0, 0, 0)`;
    }

    if (percentage < 0.5) {
      // Green to Yellow (0-50%)
      const ratio = percentage / 0.5;
      const r = Math.round(34 + (255 - 34) * ratio);
      const g = Math.round(197 + (234 - 197) * ratio);
      const b = Math.round(94 + (7 - 94) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to Orange (50-100%)
      const ratio = (percentage - 0.5) / 0.5;
      const r = Math.round(255);
      const g = Math.round(234 + (165 - 234) * ratio);
      const b = Math.round(7);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  /**
   * Update Allocation cell with stake usage and color indicator
   */
  window.betIQ.updateAllocationCell = function (cell, row) {
    const betId = row.getAttribute("data-id");
    if (!betId) {
      cell.textContent = "—";
      cell.style.backgroundColor = "";
      cell.style.cursor = "";
      cell.onclick = null;
      return;
    }

    const stakeUsed =
      window.betIQ && window.betIQ.getStakeUsed
        ? window.betIQ.getStakeUsed(betId)
        : 0;

    const betData =
      window.betIQ && window.betIQ.getBettingDataById
        ? window.betIQ.getBettingDataById(betId)
        : null;

    if (!betData) {
      cell.textContent = stakeUsed > 0 ? `$${stakeUsed.toFixed(2)}` : "—";
      cell.style.backgroundColor = "";
      cell.style.cursor = "pointer";
      cell.onclick = (e) => {
        e.stopPropagation();
        if (window.betIQ && window.betIQ.showStakePopup) {
          window.betIQ.showStakePopup(betId, row);
        }
      };
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

    const stakeAllowed =
      window.betIQ && window.betIQ.calculateStakeAllowed
        ? window.betIQ.calculateStakeAllowed(betData, bankroll, kellyFraction)
        : null;

    if (stakeAllowed === null || stakeAllowed === 0) {
      cell.textContent = stakeUsed > 0 ? `$${stakeUsed.toFixed(2)}` : "—";
      cell.style.backgroundColor = "";
      cell.style.cursor = "pointer";
      cell.onclick = (e) => {
        e.stopPropagation();
        if (window.betIQ && window.betIQ.showStakePopup) {
          window.betIQ.showStakePopup(betId, row);
        }
      };
      return;
    }

    const percentage = stakeUsed / stakeAllowed;
    const color = getStakeAvailabilityColor(percentage);

    cell.textContent = `$${stakeUsed.toFixed(2)} / $${stakeAllowed.toFixed(2)}`;
    cell.style.backgroundColor = color;
    cell.style.color = percentage >= 1.0 ? "#ffffff" : "#000000";
    cell.style.fontWeight = "500";
    cell.style.cursor = "pointer";
    cell.onclick = (e) => {
      e.stopPropagation();
      if (window.betIQ && window.betIQ.showStakePopup) {
        window.betIQ.showStakePopup(betId, row);
      }
    };
  };

  /**
   * Update all Allocation cells in the table
   */
  window.betIQ.updateAllocationCells = function () {
    const table = document.querySelector("table");
    if (!table) {
      return;
    }

    const dataRows = Array.from(
      table.querySelectorAll("tbody tr, table > tr")
    ).filter((row) => {
      const hasTh = row.querySelectorAll("th").length > 0;
      const hasTd = row.querySelectorAll("td").length > 0;
      return hasTd && !hasTh;
    });

    dataRows.forEach((row) => {
      const allocationCell = row.querySelector(
        "[data-betiq-cell='allocation']"
      );
      if (allocationCell) {
        window.betIQ.updateAllocationCell(allocationCell, row);
      }
      // Also update monitor cell when allocation changes
      const monitorCell = row.querySelector("[data-betiq-cell='monitor']");
      if (monitorCell && window.betIQ.updateMonitorCell) {
        window.betIQ.updateMonitorCell(monitorCell, row);
      }
    });
  };
})();

