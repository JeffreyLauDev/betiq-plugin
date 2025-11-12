// Main table generator - matches rows with API data and assigns IDs
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  /**
   * Update ID cell with click handler
   */
  function updateIdCell(idCell, betId, row) {
    if (!idCell || !betId) return;

    // Remove old click handler by cloning
    const oldCell = idCell;
    const newCell = idCell.cloneNode(false);
    newCell.textContent = betId;
    oldCell.parentNode.replaceChild(newCell, oldCell);

    // Apply styling and add click handler
    newCell.style.color = "#3b82f6";
    newCell.style.textDecoration = "underline";
    newCell.style.cursor = "pointer";
    newCell.title = "Click to view stake details";

    newCell.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (window.betIQ && window.betIQ.showStakePopup) {
        window.betIQ.showStakePopup(betId, row);
      }
    });
  }

  /**
   * Match existing table rows with API data and add IDs
   */
  window.betIQ.generateBettingDataTable = function () {
    const capturedBettingData = window.betIQ.getCapturedBettingData();

    if (capturedBettingData.length === 0) {
      return;
    }

    const tables = document.querySelectorAll("table");
    if (tables.length === 0) {
      return;
    }

    let matchedCount = 0;
    const betIdMap = new Map();
    let hasDuplicateIds = false;
    let missingIdRows = [];

    tables.forEach((table) => {
      const dataRows = Array.from(
        table.querySelectorAll("tbody tr, table > tr")
      ).filter((row) => {
        const hasTh = row.querySelectorAll("th").length > 0;
        const hasTd = row.querySelectorAll("td").length > 0;
        return hasTd && !hasTh;
      });

      dataRows.forEach((row) => {
        const existingId = row.getAttribute("data-id") || row.id;

        if (existingId) {
          // Row already has ID, check for duplicates
          if (betIdMap.has(existingId)) {
            hasDuplicateIds = true;
            console.error(
              `[betIQ-Plugin] ⚠️ DUPLICATE ID DETECTED!`,
              `bet_id: ${existingId}`
            );
          } else {
            betIdMap.set(existingId, row);
          }

          // Update ID cell if it exists
          const idCell = row.querySelector("[data-betiq-cell='id']");
          if (idCell && existingId) {
            updateIdCell(idCell, existingId, row);
          }
          return;
        }

        // Try to match and assign ID
        const matchedBet =
          window.betIQ.matchRowWithData &&
          window.betIQ.matchRowWithData(row, capturedBettingData);

        if (matchedBet) {
          const betId =
            matchedBet.bet_id ||
            matchedBet.id ||
            (matchedBet.game && matchedBet.player && matchedBet.prop
              ? `${matchedBet.game}_${matchedBet.player}_${matchedBet.prop}`
              : null);

          if (!betId) {
            if (window.betiqDebugEnabled) {
              console.warn(
                "[betIQ-Plugin] Matched bet has no ID field:",
                matchedBet,
                "Available fields:",
                Object.keys(matchedBet)
              );
            }
            missingIdRows.push(row);
            return;
          }

          // Check for duplicate ID
          if (betIdMap.has(betId)) {
            hasDuplicateIds = true;
            console.error(
              `[betIQ-Plugin] ⚠️ DUPLICATE ID DETECTED!`,
              `bet_id: ${betId}`
            );
            missingIdRows.push(row);
            return;
          }

          // Add data-id attribute
          row.setAttribute("data-id", betId);
          betIdMap.set(betId, row);
          matchedCount++;

          // Update ID cell if it exists
          const idCell = row.querySelector("[data-betiq-cell='id']");
          if (idCell) {
            updateIdCell(idCell, betId, row);
          }
        } else {
          missingIdRows.push(row);
          if (window.betiqDebugEnabled) {
            const extractCellText = window.betIQ.extractCellText;
            const cells = row.querySelectorAll("td");
            if (cells.length >= 9) {
              console.log(
                "[betIQ-Plugin] Could not match row:",
                `Game: "${extractCellText(cells[3])}"`,
                `Player: "${extractCellText(cells[5])}"`,
                `Prop: "${extractCellText(cells[8])}"`,
                `Bet Type: "${extractCellText(cells[6])}"`,
                `Game Time: "${extractCellText(cells[4])}"`
              );
            }
          }
        }
      });
    });

    // Show error if needed
    if (missingIdRows.length > 0 || hasDuplicateIds) {
      let errorMessage = "⚠️ Row Identifier Bug Detected: ";

      if (missingIdRows.length > 0 && hasDuplicateIds) {
        errorMessage += `${missingIdRows.length} row(s) missing ID(s) and duplicate IDs detected. Please report this to the developer for investigation.`;
      } else if (missingIdRows.length > 0) {
        errorMessage += `${missingIdRows.length} row(s) missing ID(s). All rows must have a unique ID. Please report this to the developer for investigation.`;
      } else {
        errorMessage +=
          "Multiple rows have the same ID. All IDs must be unique. Please report this to the developer for investigation.";
      }

      if (window.betIQ.showRowIdError) {
        window.betIQ.showRowIdError(errorMessage);
      }

      if (missingIdRows.length > 0) {
        console.warn(
          `[betIQ-Plugin] ⚠️ ${missingIdRows.length} row(s) without ID:`,
          missingIdRows
        );
      }
    } else {
      // Remove error bar if everything is OK
      const existingError = document.getElementById("betiq-duplicate-id-error");
      if (existingError) {
        existingError.remove();
      }
    }

    if (matchedCount > 0 && window.betiqDebugEnabled) {
      console.log(`[betIQ-Plugin] Matched ${matchedCount} rows with IDs`);
    }

    // Recalculate stake amounts after IDs are assigned
    if (window.betIQ.recalculateStakeAmounts) {
      window.betIQ.recalculateStakeAmounts();
    }

    // Update allocation cells after IDs are assigned
    if (window.betIQ.updateAllocationCells) {
      window.betIQ.updateAllocationCells();
    }
  };
})();
