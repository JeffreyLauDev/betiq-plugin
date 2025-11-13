// Main column management and orchestration
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  // Helper functions to get/set table state from centralized state
  function getLastTableHash() {
    if (!window.betIQ.state) return "";
    return window.betIQ.state.get("ui.columns.lastTableHash") || "";
  }
  
  function setLastTableHash(value) {
    if (window.betIQ.state) {
      window.betIQ.state.set("ui.columns.lastTableHash", value, {
        skipPersistence: true, // Don't persist table hash
      });
    }
  }
  
  function getColumnProcessing() {
    if (!window.betIQ.state) return false;
    return window.betIQ.state.get("ui.columns.columnProcessing") || false;
  }
  
  function setColumnProcessing(value) {
    if (window.betIQ.state) {
      window.betIQ.state.set("ui.columns.columnProcessing", value, {
        skipPersistence: true, // Don't persist processing flag
      });
    }
  }

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
      if (stakeCell && window.betIQ.updateStakeAllowedCell) {
        window.betIQ.updateStakeAllowedCell(stakeCell, row);
      }
      const allocationCell = row.querySelector(
        "[data-betiq-cell='allocation']"
      );
      if (allocationCell && window.betIQ.updateAllocationCell) {
        window.betIQ.updateAllocationCell(allocationCell, row);
      }
      const monitorCell = row.querySelector("[data-betiq-cell='monitor']");
      if (monitorCell && window.betIQ.updateMonitorCell) {
        window.betIQ.updateMonitorCell(monitorCell, row);
      }
    });
  };

  /**
   * Add full column to table - handles React/Next.js frequent re-renders
   */
  window.betIQ.addKellyStakeColumn = function () {
    if (getColumnProcessing()) {
      return;
    }

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
      currentHash === getLastTableHash() &&
      hasKellyHeader &&
      hasAllocationHeader &&
      hasMonitorHeader &&
      hasIdHeader &&
      missingCells === 0
    ) {
      return;
    }

    setLastTableHash(currentHash);
    setColumnProcessing(true);

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

        // Add Allocation header
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

        // Add Expected Monitor Amounts header
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

        // Add ID header
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
        if (window.betIQ.updateStakeAllowedCell) {
          window.betIQ.updateStakeAllowedCell(kellyCell, row);
        }
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

        if (window.betIQ.updateStakeAllowedCell) {
          window.betIQ.updateStakeAllowedCell(kellyCell, row);
        }

        if (cell11.nextSibling) {
          row.insertBefore(kellyCell, cell11.nextSibling);
        } else {
          row.appendChild(kellyCell);
        }
      }

      // Add Allocation cell
      let allocationCell = row.querySelector("[data-betiq-cell='allocation']");
      if (allocationCell) {
        if (window.betIQ.updateAllocationCell) {
          window.betIQ.updateAllocationCell(allocationCell, row);
        }
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

        if (window.betIQ.updateAllocationCell) {
          window.betIQ.updateAllocationCell(allocationCell, row);
        }
      }

      // Add Expected Monitor Amounts cell
      let monitorCell = row.querySelector("[data-betiq-cell='monitor']");
      if (monitorCell) {
        if (window.betIQ.updateMonitorCell) {
          window.betIQ.updateMonitorCell(monitorCell, row);
        }
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

        if (window.betIQ.updateMonitorCell) {
          window.betIQ.updateMonitorCell(monitorCell, row);
        }

        const allocationCellInserted = row.querySelector(
          "[data-betiq-cell='allocation']"
        );
        if (allocationCellInserted && allocationCellInserted.nextSibling) {
          row.insertBefore(monitorCell, allocationCellInserted.nextSibling);
        } else {
          row.appendChild(monitorCell);
        }
      }

      // Add ID cell
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
        const rowId = row.getAttribute("data-id") || "";
        idCell.textContent = rowId;

        if (rowId) {
          idCell.style.color = "#3b82f6";
          idCell.style.textDecoration = "underline";
          idCell.title = "Click to view stake details";

          idCell.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.betIQ && window.betIQ.showStakePopup) {
              window.betIQ.showStakePopup(rowId, row);
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
        const rowId = row.getAttribute("data-id") || "";
        idCell.textContent = rowId;

        if (rowId) {
          const oldCell = idCell;
          const newCell = idCell.cloneNode(false);
          newCell.textContent = rowId;
          oldCell.parentNode.replaceChild(newCell, oldCell);

          newCell.style.color = "#3b82f6";
          newCell.style.textDecoration = "underline";
          newCell.style.cursor = "pointer";
          newCell.title = "Click to view stake details";

          newCell.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.betIQ && window.betIQ.showStakePopup) {
              window.betIQ.showStakePopup(rowId, row);
            }
          });
        } else {
          idCell.style.color = "";
          idCell.style.textDecoration = "";
          idCell.style.cursor = "";
          idCell.title = "";
        }
      }
    });

    setColumnProcessing(false);

    // Initialize selection overlay after columns are added
    if (window.betIQ.initSelectionOverlay) {
      setTimeout(() => {
        window.betIQ.initSelectionOverlay();
      }, 100);
    }
  };

  // Debounced version for performance
  window.betIQ.debouncedAddColumn = window.betIQ.debounce(
    window.betIQ.addKellyStakeColumn,
    50
  );
})();
