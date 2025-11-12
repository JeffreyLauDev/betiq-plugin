// Add Kelly Stake, Allocation, and Monitor columns to existing table
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  // Track table state to avoid unnecessary re-processing
  let lastTableHash = "";
  let columnProcessing = false;

  /**
   * Calculate Stake Allowed value using Kelly Criterion formula
   * Formula: ((ev_percentage / 100) / (odds - 1)) × Bankroll × Kelly Fraction
   * @param {Object} betData - Bet data from API (needs ev_percentage and odds)
   * @param {number} bankroll - Total bankroll
   * @param {number} kellyFraction - Kelly fraction (e.g., 0.25 for quarter-Kelly)
   * @returns {number|null} Calculated stake amount or null if invalid data
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

    // Formula: ((ev_percentage / 100) / (odds - 1)) × Bankroll × Kelly Fraction
    const stake = (evPercentage / 100 / (odds - 1)) * bankroll * kellyFraction;

    return stake >= 0 ? stake : null;
  }

  // Expose calculateStakeAllowed for use in other modules
  window.betIQ.calculateStakeAllowed = calculateStakeAllowed;

  /**
   * Format stake amount for display
   */
  function formatStakeAmount(amount) {
    if (amount === null || amount === undefined) {
      return "N/A";
    }
    // Round to 2 decimal places
    return amount.toFixed(2);
  }

  /**
   * Create and show custom tooltip
   */
  function showTooltip(element, tooltipText) {
    // Remove existing tooltip if any
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

    // Position tooltip near the element
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.bottom + 10;

    // Adjust if tooltip goes off screen
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
  function updateStakeAllowedCell(cell, row) {
    const betId = row.getAttribute("data-id");
    if (!betId) {
      // No bet ID yet, show placeholder
      const span = document.createElement("span");
      span.className = "font-medium text-black";
      span.style.fontWeight = "500";
      span.style.color = "#000000";
      span.textContent = "—";
      cell.innerHTML = "";
      cell.appendChild(span);
      // Remove any existing tooltip handlers
      cell.onmouseenter = null;
      cell.onmouseleave = null;
      return;
    }

    // Get bet data from cache
    const betData =
      window.betIQ && window.betIQ.getBettingDataById
        ? window.betIQ.getBettingDataById(betId)
        : null;

    if (!betData) {
      // No bet data available yet
      const span = document.createElement("span");
      span.className = "font-medium text-black";
      span.style.fontWeight = "500";
      span.style.color = "#000000";
      span.textContent = "—";
      cell.innerHTML = "";
      cell.appendChild(span);
      // Remove any existing tooltip handlers
      cell.onmouseenter = null;
      cell.onmouseleave = null;
      return;
    }

    // Get state values
    const bankroll =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("bankroll")
        : null;
    const kellyFraction =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("kellyFraction")
        : null;

    // Calculate stake allowed
    const stakeAmount = calculateStakeAllowed(betData, bankroll, kellyFraction);

    // Build tooltip with calculation breakdown (compact version)
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

      // Create span with Tailwind classes and inline style fallback
      const span = document.createElement("span");
      span.className = "font-medium text-black";
      span.style.fontWeight = "500"; // font-medium fallback
      span.style.color = "#000000"; // text-black fallback
      span.style.cursor = "help";
      span.textContent = `$${formatStakeAmount(stakeAmount)}`;

      cell.innerHTML = "";
      cell.appendChild(span);

      // Add tooltip handlers
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

      // Add tooltip handlers
      cell.onmouseenter = (e) => {
        showTooltip(cell, tooltipText);
      };
      cell.onmouseleave = () => {
        hideTooltip();
      };
    }
  }

  /**
   * Calculate color based on stake usage percentage
   * Green (0-50%), Yellow (50-100%), Orange (approaching 100%), Black (100%)
   */
  function getStakeAvailabilityColor(percentage) {
    // Black when all allocation is used (100%)
    if (percentage >= 1.0) {
      return `rgb(0, 0, 0)`;
    }

    if (percentage < 0.5) {
      // Green to Yellow (0-50%)
      const ratio = percentage / 0.5;
      // Green rgb(34, 197, 94) to Yellow rgb(255, 234, 7)
      const r = Math.round(34 + (255 - 34) * ratio);
      const g = Math.round(197 + (234 - 197) * ratio);
      const b = Math.round(94 + (7 - 94) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to Orange (50-100%)
      const ratio = (percentage - 0.5) / 0.5;
      // Yellow rgb(255, 234, 7) to Orange rgb(255, 165, 0)
      const r = Math.round(255);
      const g = Math.round(234 + (165 - 234) * ratio);
      const b = Math.round(7);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  /**
   * Update Expected Monitor Amounts cell with EV × Manual Stake calculation
   */
  function updateMonitorCell(cell, row) {
    const betId = row.getAttribute("data-id");
    if (!betId) {
      cell.textContent = "—";
      return;
    }

    // Get bet data
    const betData =
      window.betIQ && window.betIQ.getBettingDataById
        ? window.betIQ.getBettingDataById(betId)
        : null;

    // Get stake used (manual stake)
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

    // Format and display
    const span = document.createElement("span");
    span.className = "font-medium text-black";
    span.style.fontWeight = "500";
    span.style.color = "#000000";
    span.textContent = `$${expectedMonitorAmount.toFixed(2)}`;

    cell.innerHTML = "";
    cell.appendChild(span);
  }

  /**
   * Update Allocation cell with stake usage and color indicator
   */
  function updateAllocationCell(cell, row) {
    const betId = row.getAttribute("data-id");
    if (!betId) {
      cell.textContent = "—";
      cell.style.backgroundColor = "";
      cell.style.cursor = "";
      cell.onclick = null;
      return;
    }

    // Get stake used
    const stakeUsed =
      window.betIQ && window.betIQ.getStakeUsed
        ? window.betIQ.getStakeUsed(betId)
        : 0;

    // Get stake allowed
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

    // Get state values for calculation
    const bankroll =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("bankroll")
        : null;
    const kellyFraction =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("kellyFraction")
        : null;

    const stakeAllowed = calculateStakeAllowed(
      betData,
      bankroll,
      kellyFraction
    );

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

    // Calculate percentage
    const percentage = stakeUsed / stakeAllowed;
    const color = getStakeAvailabilityColor(percentage);

    // Update cell
    cell.textContent = `$${stakeUsed.toFixed(2)} / $${stakeAllowed.toFixed(2)}`;
    cell.style.backgroundColor = color;
    // White text when background is black (100% allocation), otherwise black text
    cell.style.color = percentage >= 1.0 ? "#ffffff" : "#000000";
    cell.style.fontWeight = "500";
    cell.style.cursor = "pointer";
    cell.onclick = (e) => {
      e.stopPropagation();
      if (window.betIQ && window.betIQ.showStakePopup) {
        window.betIQ.showStakePopup(betId, row);
      }
    };
  }

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
        updateAllocationCell(allocationCell, row);
      }
      // Also update monitor cell when allocation changes
      const monitorCell = row.querySelector("[data-betiq-cell='monitor']");
      if (monitorCell) {
        updateMonitorCell(monitorCell, row);
      }
    });
  };

  /**
   * Recalculate all Stake Allowed values in the table
   * Called when bankroll or kellyFraction changes
   */
  window.betIQ.recalculateStakeAmounts = function () {
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
      const stakeCell = row.querySelector("[data-betiq-cell='kelly-stake']");
      if (stakeCell) {
        updateStakeAllowedCell(stakeCell, row);
      }
      // Also update allocation cells since stake allowed changed
      const allocationCell = row.querySelector(
        "[data-betiq-cell='allocation']"
      );
      if (allocationCell) {
        updateAllocationCell(allocationCell, row);
      }
      // Also update monitor cells
      const monitorCell = row.querySelector("[data-betiq-cell='monitor']");
      if (monitorCell) {
        updateMonitorCell(monitorCell, row);
      }
    });
  };

  /**
   * Add full column to table - handles React/Next.js frequent re-renders
   */
  window.betIQ.addKellyStakeColumn = function () {
    if (columnProcessing) {
      return;
    }

    // Ensure Tailwind CSS is available for styling
    if (window.betIQ && window.betIQ.injectTailwind) {
      window.betIQ.injectTailwind();
    }

    const table = document.querySelector("table");
    if (!table) {
      return;
    }

    // Find the first data row to check if column 11 exists
    let firstDataRow = null;
    let targetCell = null;

    const allRows = table.querySelectorAll("tr");

    for (let row of allRows) {
      const hasTh = row.querySelectorAll("th").length > 0;
      const hasTd = row.querySelectorAll("td").length > 0;

      if (hasTd && !hasTh) {
        firstDataRow = row;
        targetCell = row.querySelector("td:nth-of-type(11)");
        if (targetCell) {
          break;
        }
      }
    }

    if (!targetCell || !firstDataRow) {
      return;
    }

    // Create a simple hash of table structure
    const rows = table.querySelectorAll("tr");
    const currentHash = Array.from(rows)
      .slice(0, 3)
      .map((r) => r.querySelectorAll("td, th").length)
      .join("-");

    // Check if our columns already exist in all rows
    const headerRow = table.querySelector("thead tr, tr:first-child");
    const hasKellyHeader = !!(
      headerRow && headerRow.querySelector("[data-betiq-column='kelly-stake']")
    );
    const hasAllocationHeader = !!(
      headerRow && headerRow.querySelector("[data-betiq-column='allocation']")
    );
    const hasMonitorHeader = !!(
      headerRow && headerRow.querySelector("[data-betiq-column='monitor']")
    );
    const hasIdHeader = !!(
      headerRow && headerRow.querySelector("[data-betiq-column='id']")
    );
    const dataRows = table.querySelectorAll("tbody tr, table > tr");

    let missingCells = 0;

    dataRows.forEach((row) => {
      if (row.querySelectorAll("th").length === 0) {
        const kellyCell = row.querySelector("[data-betiq-cell='kelly-stake']");
        const allocationCell = row.querySelector(
          "[data-betiq-cell='allocation']"
        );
        const monitorCell = row.querySelector("[data-betiq-cell='monitor']");
        const idCell = row.querySelector("[data-betiq-cell='id']");
        if (!kellyCell || !allocationCell || !monitorCell || !idCell) {
          missingCells++;
        }
      }
    });

    // If structure unchanged and all cells exist, skip
    if (
      currentHash === lastTableHash &&
      hasKellyHeader &&
      hasAllocationHeader &&
      hasMonitorHeader &&
      hasIdHeader &&
      missingCells === 0
    ) {
      return;
    }

    lastTableHash = currentHash;
    columnProcessing = true;

    // Add header cells if thead exists
    if (headerRow && headerRow.querySelectorAll("th").length > 0) {
      const headerCell11 = headerRow.querySelector("th:nth-of-type(11)");

      if (headerCell11) {
        // Add Stake Allowed header
        let kellyHeader = headerRow.querySelector(
          "[data-betiq-column='kelly-stake']"
        );
        if (!kellyHeader) {
          kellyHeader = document.createElement("th");
          kellyHeader.setAttribute("data-betiq-column", "kelly-stake");
          kellyHeader.textContent = "Stake Allowed";
          kellyHeader.style.cssText = `
            padding: 8px;
            text-align: center;
            font-weight: 600;
            background-color: #f3f4f6;
            border: 1px solid #e5e7eb;
            min-width: 120px;
          `;

          if (headerCell11.nextSibling) {
            headerRow.insertBefore(kellyHeader, headerCell11.nextSibling);
          } else {
            headerRow.appendChild(kellyHeader);
          }
        }

        // Add Allocation header (after Kelly Stake)
        let allocationHeader = headerRow.querySelector(
          "[data-betiq-column='allocation']"
        );
        if (!allocationHeader) {
          allocationHeader = document.createElement("th");
          allocationHeader.setAttribute("data-betiq-column", "allocation");
          allocationHeader.textContent = "Allocation";
          allocationHeader.style.cssText = `
            padding: 8px;
            text-align: center;
            font-weight: 600;
            background-color: #f3f4f6;
            border: 1px solid #e5e7eb;
            min-width: 120px;
          `;

          const kellyHeaderInserted = headerRow.querySelector(
            "[data-betiq-column='kelly-stake']"
          );
          if (kellyHeaderInserted && kellyHeaderInserted.nextSibling) {
            headerRow.insertBefore(
              allocationHeader,
              kellyHeaderInserted.nextSibling
            );
          } else {
            headerRow.appendChild(allocationHeader);
          }
        }

        // Add Expected Monitor Amounts header (after Allocation)
        let monitorHeader = headerRow.querySelector(
          "[data-betiq-column='monitor']"
        );
        if (!monitorHeader) {
          monitorHeader = document.createElement("th");
          monitorHeader.setAttribute("data-betiq-column", "monitor");
          monitorHeader.textContent = "Expected Monitor Amounts";
          monitorHeader.style.cssText = `
            padding: 8px;
            text-align: center;
            font-weight: 600;
            background-color: #f3f4f6;
            border: 1px solid #e5e7eb;
            min-width: 150px;
          `;

          const allocationHeaderInserted = headerRow.querySelector(
            "[data-betiq-column='allocation']"
          );
          if (
            allocationHeaderInserted &&
            allocationHeaderInserted.nextSibling
          ) {
            headerRow.insertBefore(
              monitorHeader,
              allocationHeaderInserted.nextSibling
            );
          } else {
            headerRow.appendChild(monitorHeader);
          }
        }

        // Add ID header (after Expected Monitor Amounts)
        let idHeader = headerRow.querySelector("[data-betiq-column='id']");
        if (!idHeader) {
          idHeader = document.createElement("th");
          idHeader.setAttribute("data-betiq-column", "id");
          idHeader.textContent = "ID";
          idHeader.style.cssText = `
            padding: 8px;
            text-align: center;
            font-weight: 600;
            background-color: #f3f4f6;
            border: 1px solid #e5e7eb;
            min-width: 100px;
          `;

          const monitorHeaderInserted = headerRow.querySelector(
            "[data-betiq-column='monitor']"
          );
          if (monitorHeaderInserted && monitorHeaderInserted.nextSibling) {
            headerRow.insertBefore(idHeader, monitorHeaderInserted.nextSibling);
          } else {
            headerRow.appendChild(idHeader);
          }
        }
      }
    }

    // Add cells to all data rows
    dataRows.forEach((row) => {
      // Skip header rows
      if (row.querySelectorAll("th").length > 0) {
        return;
      }

      const cell11 = row.querySelector("td:nth-of-type(11)");
      if (!cell11) {
        return;
      }

      // Add Kelly Stake cell
      let kellyCell = row.querySelector("[data-betiq-cell='kelly-stake']");
      if (kellyCell) {
        // Update existing cell with calculated value
        updateStakeAllowedCell(kellyCell, row);
      } else {
        kellyCell = document.createElement("td");
        kellyCell.setAttribute("data-betiq-cell", "kelly-stake");
        kellyCell.style.cssText = `
          padding: 8px;
          vertical-align: middle;
          border: 1px solid #e5e7eb;
          text-align: center;
          font-size: 12px;
        `;

        // Update cell with calculated value
        updateStakeAllowedCell(kellyCell, row);

        // Insert after column 11
        if (cell11.nextSibling) {
          row.insertBefore(kellyCell, cell11.nextSibling);
        } else {
          row.appendChild(kellyCell);
        }
      }

      // Add Allocation cell (after Kelly Stake)
      let allocationCell = row.querySelector("[data-betiq-cell='allocation']");
      if (allocationCell) {
        // Update existing allocation cell
        updateAllocationCell(allocationCell, row);
      } else {
        allocationCell = document.createElement("td");
        allocationCell.setAttribute("data-betiq-cell", "allocation");
        allocationCell.style.cssText = `
          padding: 8px;
          vertical-align: middle;
          border: 1px solid #e5e7eb;
          min-width: 120px;
          cursor: pointer;
          text-align: center;
        `;

        const kellyCellInserted = row.querySelector(
          "[data-betiq-cell='kelly-stake']"
        );
        if (kellyCellInserted && kellyCellInserted.nextSibling) {
          row.insertBefore(allocationCell, kellyCellInserted.nextSibling);
        } else {
          row.appendChild(allocationCell);
        }

        // Update with current stake usage
        updateAllocationCell(allocationCell, row);
      }

      // Add Expected Monitor Amounts cell (after Allocation)
      let monitorCell = row.querySelector("[data-betiq-cell='monitor']");
      if (monitorCell) {
        // Update existing monitor cell with calculated value
        updateMonitorCell(monitorCell, row);
      } else {
        monitorCell = document.createElement("td");
        monitorCell.setAttribute("data-betiq-cell", "monitor");
        monitorCell.style.cssText = `
          padding: 8px;
          vertical-align: middle;
          border: 1px solid #e5e7eb;
          min-width: 150px;
          text-align: center;
          font-size: 12px;
        `;

        // Update cell with calculated value
        updateMonitorCell(monitorCell, row);

        const allocationCellInserted = row.querySelector(
          "[data-betiq-cell='allocation']"
        );
        if (allocationCellInserted && allocationCellInserted.nextSibling) {
          row.insertBefore(monitorCell, allocationCellInserted.nextSibling);
        } else {
          row.appendChild(monitorCell);
        }
      }

      // Add ID cell (after Expected Monitor Amounts)
      let idCell = row.querySelector("[data-betiq-cell='id']");
      if (!idCell) {
        idCell = document.createElement("td");
        idCell.setAttribute("data-betiq-cell", "id");
        idCell.style.cssText = `
          padding: 8px;
          vertical-align: middle;
          border: 1px solid #e5e7eb;
          min-width: 100px;
          font-size: 11px;
          font-family: monospace;
          text-align: center;
          cursor: pointer;
          user-select: none;
        `;
        // Get the ID from the row's data-id attribute if it exists
        const rowId = row.getAttribute("data-id") || "";
        idCell.textContent = rowId;

        // Make ID cell clickable to show popup
        if (rowId) {
          idCell.style.color = "#3b82f6";
          idCell.style.textDecoration = "underline";
          idCell.title = "Click to view stake details";

          idCell.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.betIQ && window.betIQ.showStakePopup) {
              window.betIQ.showStakePopup(rowId, row);
            } else {
              console.warn(
                "[betIQ-Plugin] showStakePopup function not available"
              );
            }
          });
        }

        const monitorCellInserted = row.querySelector(
          "[data-betiq-cell='monitor']"
        );
        if (monitorCellInserted && monitorCellInserted.nextSibling) {
          row.insertBefore(idCell, monitorCellInserted.nextSibling);
        } else {
          row.appendChild(idCell);
        }
      } else {
        // Update existing ID cell with current row ID
        const rowId = row.getAttribute("data-id") || "";
        idCell.textContent = rowId;

        // Always update click handler if row has an ID (handles Next.js re-renders)
        if (rowId) {
          // Remove old click handler if exists (by cloning the cell)
          const oldCell = idCell;
          const newCell = idCell.cloneNode(false);
          newCell.textContent = rowId;
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
              window.betIQ.showStakePopup(rowId, row);
            } else {
              console.warn(
                "[betIQ-Plugin] showStakePopup function not available"
              );
            }
          });
        } else {
          // No ID yet, remove styling
          idCell.style.color = "";
          idCell.style.textDecoration = "";
          idCell.style.cursor = "";
          idCell.title = "";
        }
      }
    });

    columnProcessing = false;

    // Initialize selection overlay after columns are added
    if (window.betIQ.initSelectionOverlay) {
      setTimeout(() => {
        window.betIQ.initSelectionOverlay();
      }, 100);
    }
  };

  /**
   * Extract column data and copy to clipboard
   */
  function extractKellyStakeColumn(columnIndex) {
    const table = document.querySelector("table");
    if (!table) {
      alert("Table not found!");
      return;
    }

    // Get all rows (skip header row if it exists)
    const allRows = table.querySelectorAll("tbody tr, table > tr");
    const extractedData = [];

    allRows.forEach((row, index) => {
      // Skip if it's a header row (th elements)
      const hasHeaderCells = row.querySelectorAll("th").length > 0;
      if (hasHeaderCells) {
        return;
      }

      const cell = row.querySelector(`td:nth-of-type(${columnIndex})`);
      if (cell) {
        const text = cell.textContent.trim();
        if (text) {
          extractedData.push(text);
        }
      }
    });

    if (extractedData.length === 0) {
      alert("No data found in column " + columnIndex);
      return;
    }

    // Copy to clipboard
    const dataString = extractedData.join("\n");
    navigator.clipboard
      .writeText(dataString)
      .then(() => {
        // Show success notification
        window.betIQ.showNotification(
          `Copied ${extractedData.length} items to clipboard!`
        );
      })
      .catch((err) => {
        console.error("[betIQ-Plugin] Failed to copy:", err);
        // Fallback: show in alert
        alert(
          "Extracted data:\n\n" +
            dataString.substring(0, 500) +
            (dataString.length > 500 ? "..." : "")
        );
      });
  }

  // Debounced version for performance (50ms debounce handles frequent React updates)
  window.betIQ.debouncedAddColumn = window.betIQ.debounce(
    window.betIQ.addKellyStakeColumn,
    50
  );

  // ============================================
  // SELECTION OVERLAY FUNCTIONALITY
  // ============================================

  let selectionOverlay = null;
  let checkboxObserver = null;

  /**
   * Extract row data (game, player, bet type) from a table row
   */
  function extractRowData(row) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 7) {
      return null;
    }

    // Column 4 (index 3): Game
    const game = (cells[3]?.textContent || "").trim();
    // Column 6 (index 5): Player
    const player = (cells[5]?.textContent || "").trim();
    // Column 7 (index 6): Bet Type
    const betType = (cells[6]?.textContent || "").trim();
    // Get data-id
    const betId = row.getAttribute("data-id") || "";

    if (!game || !player || !betType) {
      return null;
    }

    return { game, player, betType, betId };
  }

  /**
   * Get all selected rows
   */
  function getSelectedRows() {
    const table = document.querySelector("table");
    if (!table) {
      return [];
    }

    const allRows = table.querySelectorAll("tbody tr, table > tr");
    const selectedRows = [];

    allRows.forEach((row) => {
      // Skip header rows
      if (row.querySelectorAll("th").length > 0) {
        return;
      }

      // Check if checkbox is checked
      const checkbox = row.querySelector('button[role="checkbox"]');
      if (
        checkbox &&
        (checkbox.getAttribute("data-state") === "checked" ||
          checkbox.getAttribute("aria-checked") === "true")
      ) {
        selectedRows.push(row);
      }
    });

    return selectedRows;
  }

  /**
   * Update the selection overlay
   */
  function updateSelectionOverlay() {
    const selectedRows = getSelectedRows();

    // Remove overlay if no selections or only 1 selection
    if (selectedRows.length <= 1) {
      if (selectionOverlay) {
        selectionOverlay.remove();
        selectionOverlay = null;
      }
      return;
    }

    // Create overlay if it doesn't exist
    if (!selectionOverlay) {
      selectionOverlay = document.createElement("div");
      selectionOverlay.id = "betiq-selection-overlay";
      selectionOverlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 400px;
        max-height: 600px;
        background-color: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        z-index: 10001;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      document.body.appendChild(selectionOverlay);
    }

    // Extract data from selected rows
    const selectedData = [];
    selectedRows.forEach((row) => {
      const data = extractRowData(row);
      if (data) {
        selectedData.push(data);
      }
    });

    // Build overlay content
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 16px;
      background-color: #f3f4f6;
      border-bottom: 1px solid #e5e7eb;
      font-weight: 600;
      font-size: 14px;
      color: #1f2937;
    `;
    header.textContent = `Selected Bets (${selectedData.length})`;

    const content = document.createElement("div");
    content.style.cssText = `
      padding: 12px;
      max-height: 500px;
      overflow-y: auto;
    `;

    if (selectedData.length === 0) {
      content.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #6b7280; font-size: 13px;">
          No valid data found in selected rows
        </div>
      `;
    } else {
      selectedData.forEach((data, index) => {
        const item = document.createElement("div");
        item.style.cssText = `
          padding: 12px;
          margin-bottom: ${index < selectedData.length - 1 ? "8px" : "0"};
          background-color: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 12px;
        `;

        const gameDiv = document.createElement("div");
        gameDiv.style.cssText = `
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 4px;
        `;
        gameDiv.textContent = data.game;

        const playerDiv = document.createElement("div");
        playerDiv.style.cssText = `
          color: #374151;
          margin-bottom: 2px;
        `;
        playerDiv.textContent = `Player: ${data.player}`;

        const betTypeDiv = document.createElement("div");
        betTypeDiv.style.cssText = `
          color: #374151;
        `;
        betTypeDiv.textContent = `Bet Type: ${data.betType}`;

        item.appendChild(gameDiv);
        item.appendChild(playerDiv);
        item.appendChild(betTypeDiv);
        content.appendChild(item);
      });
    }

    // Clear and update overlay
    selectionOverlay.innerHTML = "";
    selectionOverlay.appendChild(header);
    selectionOverlay.appendChild(content);
  }

  /**
   * Setup observer for checkbox changes
   */
  function setupCheckboxObserver() {
    const table = document.querySelector("table");
    if (!table) {
      return;
    }

    // Disconnect existing observer if it exists
    if (checkboxObserver) {
      checkboxObserver.disconnect();
      checkboxObserver = null;
    }

    // Use MutationObserver to watch for checkbox state changes
    checkboxObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          // Check if it's a checkbox state change
          if (
            target.tagName === "BUTTON" &&
            target.getAttribute("role") === "checkbox" &&
            (mutation.attributeName === "data-state" ||
              mutation.attributeName === "aria-checked")
          ) {
            shouldUpdate = true;
          }
        }

        // Check for added/removed checkboxes
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (
              node.nodeType === 1 &&
              (node.tagName === "BUTTON" ||
                node.querySelector?.('button[role="checkbox"]'))
            ) {
              shouldUpdate = true;
            }
          });
        }
      });

      if (shouldUpdate) {
        // Debounce updates to avoid too many re-renders
        if (window.betIQ.debounce) {
          if (!window.betIQ._selectionUpdateTimeout) {
            window.betIQ._selectionUpdateTimeout = setTimeout(() => {
              updateSelectionOverlay();
              window.betIQ._selectionUpdateTimeout = null;
            }, 100);
          }
        } else {
          updateSelectionOverlay();
        }
      }
    });

    // Observe the table for changes
    checkboxObserver.observe(table, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-checked"],
    });

    // Also listen for click events on checkboxes as a fallback
    table.addEventListener("click", (e) => {
      const checkbox = e.target.closest('button[role="checkbox"]');
      if (checkbox) {
        setTimeout(() => {
          updateSelectionOverlay();
        }, 50);
      }
    });
  }

  /**
   * Initialize selection overlay
   */
  window.betIQ.initSelectionOverlay = function () {
    setupCheckboxObserver();
    // Initial update
    updateSelectionOverlay();
  };

  // Auto-initialize when table is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => {
        if (document.querySelector("table")) {
          window.betIQ.initSelectionOverlay();
        }
      }, 1000);
    });
  } else {
    setTimeout(() => {
      if (document.querySelector("table")) {
        window.betIQ.initSelectionOverlay();
      }
    }, 1000);
  }
})();
