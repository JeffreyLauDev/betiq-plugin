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
    const table =
      window.betIQ.getTableOrContainer && window.betIQ.getTableOrContainer();
    if (!table) {
      return;
    }

    var config =
      (window.betIQ.getSiteConfig && window.betIQ.getSiteConfig()) || {};
    var sel = config.betiqSelectors || {};
    var headerCellSel = config.headerCellSelector || "th";
    var dataCellSel = config.dataCellSelector || "td";
    var kellyCellSel = sel.kellyStakeCell || "[data-betiq-cell='kelly-stake']";
    var allocationCellSel =
      sel.allocationCell || "[data-betiq-cell='allocation']";
    var monitorCellSel = sel.monitorCell || "[data-betiq-cell='monitor']";

    const dataRows = Array.from(window.betIQ.getDataRows(table)).filter(
      (row) => {
        const hasTh = row.querySelectorAll(headerCellSel).length > 0;
        const hasTd = row.querySelectorAll(dataCellSel).length > 0;
        return hasTd && !hasTh;
      }
    );

    dataRows.forEach((row) => {
      const stakeCell = row.querySelector(kellyCellSel);
      if (stakeCell && window.betIQ.updateStakeAllowedCell) {
        window.betIQ.updateStakeAllowedCell(stakeCell, row);
      }
      const allocationCell = row.querySelector(allocationCellSel);
      if (allocationCell && window.betIQ.updateAllocationCell) {
        window.betIQ.updateAllocationCell(allocationCell, row);
      }
      const monitorCell = row.querySelector(monitorCellSel);
      if (monitorCell && window.betIQ.updateMonitorCell) {
        window.betIQ.updateMonitorCell(monitorCell, row);
      }
    });
  };

  // Re-run stake/allocation/monitor whenever bankroll or Kelly fraction changes (from config UI or sync)
  if (window.betIQ.state && typeof window.betIQ.state.addEffect === "function") {
    window.betIQ.state.addEffect(
      ["config.bankroll", "config.kellyFraction"],
      function () {
        if (window.betIQ.recalculateStakeAmounts) {
          window.betIQ.recalculateStakeAmounts();
        }
      }
    );
  }

  /**
   * Add full column to table - handles React/Next.js frequent re-renders
   * Only adds columns if user is logged in
   */
  window.betIQ.addKellyStakeColumn = function () {
    var config =
      (window.betIQ.getSiteConfig && window.betIQ.getSiteConfig()) || {};
    var skipAuthForInject = config.skipAuthForColumnInject === true;

    // Check if user is logged in - don't add columns if not logged in (unless skipAuthForColumnInject)
    if (!skipAuthForInject && !window.betIQ.auth?.isLoggedIn()) {
      if (window.betiqDebugEnabled) {
        console.warn(
          "[betIQ-Plugin] Columns not added: not logged in. Log in via extension popup, or set skipAuthForColumnInject: true in siteConfig for this host."
        );
      }
      if (window.betIQ.addKellyStakeColumn) {
        window.betIQ.addKellyStakeColumn();
      }
      // Remove columns if they exist and user logged out
      const table =
        window.betIQ.getTableOrContainer && window.betIQ.getTableOrContainer();
      if (table) {
        var betiqCellsSel =
          config.betiqCellsSelector || "[data-betiq-column], [data-betiq-cell]";
        const betIQCells = table.querySelectorAll(betiqCellsSel);
        betIQCells.forEach((cell) => {
          const row = cell.parentElement;
          if (row) {
            cell.remove();
            if (row.children.length === 0) {
              row.remove();
            }
          }
        });
      }
      return;
    }

    if (getColumnProcessing()) {
      return;
    }

    if (window.betIQ && window.betIQ.injectTailwind) {
      window.betIQ.injectTailwind();
    }

    const table =
      window.betIQ.getTableOrContainer && window.betIQ.getTableOrContainer();
    if (!table) {
      if (window.betiqDebugEnabled) {
        console.warn(
          "[betIQ-Plugin] Columns not added: no table/container found."
        );
      }
      return;
    }

    var sel = config.betiqSelectors || {};
    var headerCellSel = config.headerCellSelector || "th";
    var dataCellSel = config.dataCellSelector || "td";
    var rowCellSel = config.rowCellSelector || "td, th";
    var betiqCellsSel =
      config.betiqCellsSelector || "[data-betiq-column], [data-betiq-cell]";
    var kellyCellSel = sel.kellyStakeCell || "[data-betiq-cell='kelly-stake']";
    var kellyColumnSel =
      sel.kellyStakeColumn || "[data-betiq-column='kelly-stake']";
    var allocationCellSel =
      sel.allocationCell || "[data-betiq-cell='allocation']";
    var allocationColumnSel =
      sel.allocationColumn || "[data-betiq-column='allocation']";
    var monitorCellSel = sel.monitorCell || "[data-betiq-cell='monitor']";
    var monitorColumnSel = sel.monitorColumn || "[data-betiq-column='monitor']";
    var idCellSel = sel.idCell || "[data-betiq-cell='id']";
    var idColumnSel = sel.idColumn || "[data-betiq-column='id']";

    var insertBeforeNth = 11;
    if (config.pluginColumnsInsertBeforeIndex != null) {
      insertBeforeNth = config.pluginColumnsInsertBeforeIndex + 1;
    }
    var insertBeforeSelector = "td:nth-of-type(" + insertBeforeNth + ")";
    var insertBeforeHeaderSelector = "th:nth-of-type(" + insertBeforeNth + ")";

    // Find the first data row to check if the insert-before column exists
    let firstDataRow = null;
    let targetCell = null;
    var usedFallback = false;

    const allRows = window.betIQ.getAllRows
      ? window.betIQ.getAllRows(table)
      : [];

    for (let row of allRows) {
      const hasTh = row.querySelectorAll(headerCellSel).length > 0;
      const hasTd = row.querySelectorAll(dataCellSel).length > 0;

      if (hasTd && !hasTh) {
        firstDataRow = row;
        targetCell = row.querySelector(insertBeforeSelector);
        if (!targetCell) {
          var cells = row.querySelectorAll(dataCellSel);
          targetCell = cells.length > 0 ? cells[cells.length - 1] : null;
          usedFallback = !!targetCell;
        }
        if (targetCell) {
          break;
        }
      }
    }

    if (!targetCell || !firstDataRow) {
      if (window.betiqDebugEnabled) {
        var insertSel =
          "td:nth-of-type(" +
          (config.pluginColumnsInsertBeforeIndex != null
            ? config.pluginColumnsInsertBeforeIndex + 1
            : 11) +
          ") or last td";
        console.warn(
          "[betIQ-Plugin] Columns not added: no row has insert anchor " +
            insertSel +
            ". Check pluginColumnsInsertBeforeIndex (0-based) and that data rows have at least one cell."
        );
      }
      return;
    }

    // Create a simple hash of table structure
    const rows = window.betIQ.getAllRows ? window.betIQ.getAllRows(table) : [];
    const currentHash = Array.from(rows)
      .slice(0, 3)
      .map((r) => r.querySelectorAll(rowCellSel).length)
      .join("-");

    // Check if our columns already exist in all rows (query from table element when container is tbody)
    var headerRowSelector = config.headerRowSelector;
    var rootForHeader =
      table.tagName === "TABLE" ? table : table.parentElement || table;
    const headerRow =
      rootForHeader && headerRowSelector
        ? rootForHeader.querySelector(headerRowSelector)
        : null;
    const hasKellyHeader = !!(
      headerRow && headerRow.querySelector(kellyColumnSel)
    );
    const hasAllocationHeader = !!(
      headerRow && headerRow.querySelector(allocationColumnSel)
    );
    const hasMonitorHeader = !!(
      headerRow && headerRow.querySelector(monitorColumnSel)
    );
    const hasIdHeader = !!(headerRow && headerRow.querySelector(idColumnSel));
    const dataRows = window.betIQ.getDataRows(table);
    const dataRowsArr = Array.isArray(dataRows)
      ? dataRows
      : Array.from(dataRows);

    let missingCells = 0;

    dataRowsArr.forEach((row) => {
      if (row.querySelectorAll(headerCellSel).length === 0) {
        const kellyCell = row.querySelector(kellyCellSel);
        const allocationCell = row.querySelector(allocationCellSel);
        const monitorCell = row.querySelector(monitorCellSel);
        const idCell = row.querySelector(idCellSel);
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
    if (headerRow && headerRow.querySelectorAll(headerCellSel).length > 0) {
      var headerCells = headerRow.querySelectorAll(headerCellSel);
      const headerCell11 =
        headerRow.querySelector(insertBeforeHeaderSelector) ||
        (headerCells.length > 0 ? headerCells[headerCells.length - 1] : null);

      if (headerCell11) {
        // Add Stake Allowed header
        let kellyHeader = headerRow.querySelector(kellyColumnSel);
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
        let allocationHeader = headerRow.querySelector(allocationColumnSel);
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

          const kellyHeaderInserted = headerRow.querySelector(kellyColumnSel);
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
        let monitorHeader = headerRow.querySelector(monitorColumnSel);
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

          const allocationHeaderInserted =
            headerRow.querySelector(allocationColumnSel);
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
        let idHeader = headerRow.querySelector(idColumnSel);
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

          const monitorHeaderInserted =
            headerRow.querySelector(monitorColumnSel);
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
      if (row.querySelectorAll(headerCellSel).length > 0) {
        return;
      }

      var rowCells = row.querySelectorAll(dataCellSel);
      const cell11 =
        row.querySelector(insertBeforeSelector) ||
        (rowCells.length > 0 ? rowCells[rowCells.length - 1] : null);
      if (!cell11) {
        return;
      }

      // Add Kelly Stake cell
      let kellyCell = row.querySelector(kellyCellSel);
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
      let allocationCell = row.querySelector(allocationCellSel);
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

        const kellyCellInserted = row.querySelector(kellyCellSel);
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
      let monitorCell = row.querySelector(monitorCellSel);
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

        const allocationCellInserted = row.querySelector(allocationCellSel);
        if (allocationCellInserted && allocationCellInserted.nextSibling) {
          row.insertBefore(monitorCell, allocationCellInserted.nextSibling);
        } else {
          row.appendChild(monitorCell);
        }
      }

      // Add ID cell
      let idCell = row.querySelector(idCellSel);
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

        const monitorCellInserted = row.querySelector(monitorCellSel);
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
