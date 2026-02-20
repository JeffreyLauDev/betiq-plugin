// Overlay rendering and UI logic
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};
  window.betIQ.overlayRenderer = window.betIQ.overlayRenderer || {};

  /**
   * Extract row data (game, player, bet type) from a table row
   */
  function extractRowData(row) {
    const cells = row.querySelectorAll("td");
    const col =
      window.betIQ.getSiteConfig && window.betIQ.getSiteConfig().columnIndices
        ? window.betIQ.getSiteConfig().columnIndices
        : { game: 3, player: 5, betType: 6 };
    const minCells =
      Math.max(col.game || 0, col.player || 0, col.betType || 0) + 1;
    if (cells.length < minCells) {
      return null;
    }

    const game = (cells[col.game]?.textContent || "").trim();
    const player = (cells[col.player]?.textContent || "").trim();
    const betType = (cells[col.betType]?.textContent || "").trim();
    const betId = row.getAttribute("data-id") || "";

    if (!game || !player || !betType) {
      return null;
    }

    return { game, player, betType, betId };
  }

  /**
   * Returns true if the row checkbox is checked. Works with native input[type=checkbox] (.checked)
   * and with button[role=checkbox] (data-state / aria-checked).
   */
  window.betIQ.isRowCheckboxChecked = function (checkbox) {
    if (!checkbox) return false;
    if (checkbox.checked === true) return true;
    return (
      checkbox.getAttribute("data-state") === "checked" ||
      checkbox.getAttribute("aria-checked") === "true"
    );
  };

  /**
   * Get all selected rows
   */
  function getSelectedRows() {
    const table =
      window.betIQ.getTableOrContainer && window.betIQ.getTableOrContainer();
    if (!table) {
      return [];
    }

    const allRows = window.betIQ.getDataRows(table);
    const selectedRows = [];
    const rowCheckboxSel =
      (window.betIQ.getSiteConfig &&
        window.betIQ.getSiteConfig().rowCheckboxSelector) ||
      'button[role="checkbox"]';

    allRows.forEach((row) => {
      if (row.querySelectorAll("th").length > 0) {
        return;
      }

      const checkbox = row.querySelector(rowCheckboxSel);
      if (checkbox && window.betIQ.isRowCheckboxChecked(checkbox)) {
        selectedRows.push(row);
      }
    });

    return selectedRows;
  }

  /**
   * Create overlay header with title and unselect all button
   */
  function createOverlayHeader(selectedCount, onUnselectAll) {
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 10px 12px;
      background-color: #f3f4f6;
      border-bottom: 1px solid #e5e7eb;
      font-weight: 600;
      font-size: 13px;
      color: #1f2937;
      cursor: move;
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const headerText = document.createElement("span");
    headerText.textContent = `Selected Bets (${selectedCount})`;
    headerText.title = "Drag to move";
    header.appendChild(headerText);

    // Add "Unselect All" button
    if (selectedCount > 0) {
      const unselectAllBtn = document.createElement("button");
      unselectAllBtn.textContent = "Unselect All";
      unselectAllBtn.style.cssText = `
        padding: 4px 8px;
        border: 1px solid #d1d5db;
        background-color: white;
        color: #374151;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
        margin-left: 8px;
        flex-shrink: 0;
      `;
      unselectAllBtn.addEventListener("mouseenter", () => {
        unselectAllBtn.style.backgroundColor = "#f9fafb";
      });
      unselectAllBtn.addEventListener("mouseleave", () => {
        unselectAllBtn.style.backgroundColor = "white";
      });
      unselectAllBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        onUnselectAll();
      });
      header.appendChild(unselectAllBtn);
    }

    return { header, headerText };
  }

  /**
   * Create mix bet section with EV, stake, and input
   */
  function createMixBetSection(
    selectedData,
    betDataArray,
    selectedBetIds,
    manualStakeInputValue,
    onStakeApply
  ) {
    const mixBetEV =
      window.betIQ.mixBetCalculations?.calculateMixBetEV(betDataArray);
    const minStakeAllowed =
      window.betIQ.mixBetCalculations?.calculateMinStakeAllowed(
        betDataArray,
        selectedBetIds
      );
    const combinationCheck =
      window.betIQ.mixBetStorage?.isMixBetCombinationUsed(selectedBetIds);
    const isCombinationUsed = combinationCheck?.isUsed || false;
    const blockedBetIds = combinationCheck?.blockedBetIds || [];

    const mixBetSection = document.createElement("div");
    mixBetSection.style.cssText = `
      padding: 10px;
      margin-bottom: 10px;
      background-color: #eff6ff;
      border: 2px solid #3b82f6;
      border-radius: 6px;
      flex-shrink: 0;
    `;

    const mixBetTitle = document.createElement("div");
    mixBetTitle.style.cssText = `
      font-weight: 700;
      font-size: 12px;
      color: #1e40af;
      margin-bottom: 8px;
    `;
    mixBetTitle.textContent = `Mix Bet (${selectedData.length} bets)`;
    if (isCombinationUsed) {
      const warningBadge = document.createElement("span");
      warningBadge.textContent = " (Already Used)";
      warningBadge.style.cssText = `
        font-size: 11px;
        color: #dc2626;
        font-weight: 500;
        margin-left: 6px;
      `;
      mixBetTitle.appendChild(warningBadge);
    }
    mixBetSection.appendChild(mixBetTitle);

    // Show warning if combination already used
    if (isCombinationUsed) {
      const warningDiv = document.createElement("div");
      warningDiv.style.cssText = `
        padding: 6px 8px;
        margin-bottom: 8px;
        background-color: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 4px;
        font-size: 11px;
        color: #991b1b;
        line-height: 1.3;
      `;
      warningDiv.textContent =
        "⚠️ This mix bet combination has already been used. You cannot apply stake to it again.";
      mixBetSection.appendChild(warningDiv);
    }

    // Mix Bet EV
    const evRow = document.createElement("div");
    evRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    `;
    const evLabel = document.createElement("span");
    evLabel.style.cssText = `font-size: 11px; color: #374151; font-weight: 500;`;
    evLabel.textContent = "Mix Bet EV:";
    const evValue = document.createElement("span");
    evValue.style.cssText = `
      font-size: 11px;
      font-weight: 600;
      color: ${
        mixBetEV !== null && mixBetEV > 0
          ? "#059669"
          : mixBetEV !== null
          ? "#dc2626"
          : "#6b7280"
      };
    `;
    evValue.textContent =
      mixBetEV !== null
        ? `${mixBetEV >= 0 ? "+" : ""}${mixBetEV.toFixed(2)}%`
        : "N/A";
    evRow.appendChild(evLabel);
    evRow.appendChild(evValue);
    mixBetSection.appendChild(evRow);

    // Min Stake Allowed
    const stakeRow = document.createElement("div");
    stakeRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;
    const stakeLabel = document.createElement("span");
    stakeLabel.style.cssText = `font-size: 11px; color: #374151; font-weight: 500;`;
    stakeLabel.textContent = "Min Stake Allowed:";
    const stakeValue = document.createElement("span");
    stakeValue.style.cssText = `
      font-size: 11px;
      font-weight: 600;
      color: #1f2937;
    `;
    stakeValue.textContent =
      minStakeAllowed !== null ? `$${minStakeAllowed.toFixed(2)}` : "N/A";
    stakeRow.appendChild(stakeLabel);
    stakeRow.appendChild(stakeValue);
    mixBetSection.appendChild(stakeRow);

    // Manual Stake Input Section
    const manualStakeContainer = document.createElement("div");
    manualStakeContainer.style.cssText = `margin-bottom: 0;`;

    const manualStakeLabel = document.createElement("label");
    manualStakeLabel.textContent = "Manual Stake (per bet):";
    manualStakeLabel.style.cssText = `
      display: block;
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 4px;
      color: #374151;
    `;
    manualStakeContainer.appendChild(manualStakeLabel);

    const inputContainer = document.createElement("div");
    inputContainer.style.cssText = `
      display: flex;
      gap: 6px;
      align-items: center;
    `;

    const manualStakeInput = document.createElement("input");
    manualStakeInput.type = "number";
    manualStakeInput.placeholder = `Enter stake (max: $${
      minStakeAllowed !== null ? minStakeAllowed.toFixed(2) : "N/A"
    })`;
    manualStakeInput.step = "0.01";
    manualStakeInput.min = "0";
    if (minStakeAllowed !== null && minStakeAllowed > 0) {
      manualStakeInput.max = minStakeAllowed.toString();
    }
    // Restore preserved input value
    if (manualStakeInputValue) {
      manualStakeInput.value = manualStakeInputValue;
    }
    // Disable input if combination already used
    if (isCombinationUsed) {
      manualStakeInput.disabled = true;
      manualStakeInput.style.opacity = "0.6";
      manualStakeInput.style.cursor = "not-allowed";
    }
    manualStakeInput.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 11px;
      box-sizing: border-box;
      ${isCombinationUsed ? "opacity: 0.6; cursor: not-allowed;" : ""}
    `;

    const applyButton = document.createElement("button");
    applyButton.textContent = "Apply";
    // Disable button if combination already used
    if (isCombinationUsed) {
      applyButton.disabled = true;
    }
    applyButton.style.cssText = `
      padding: 6px 12px;
      border: none;
      background-color: ${isCombinationUsed ? "#9ca3af" : "#3b82f6"};
      color: white;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: ${isCombinationUsed ? "not-allowed" : "pointer"};
      transition: background-color 0.2s;
      white-space: nowrap;
      opacity: ${isCombinationUsed ? "0.6" : "1"};
    `;

    // Allow Enter key to apply
    manualStakeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        applyButton.click();
      }
    });

    // Handle apply button click
    applyButton.addEventListener("click", () => {
      if (isCombinationUsed) {
        alert(
          "This mix bet combination has already been used. You cannot apply stake to it again."
        );
        return;
      }

      const stakeValue = parseFloat(manualStakeInput.value);
      if (isNaN(stakeValue) || stakeValue < 0) {
        alert("Please enter a valid stake amount (must be 0 or greater)");
        return;
      }
      if (
        minStakeAllowed !== null &&
        minStakeAllowed > 0 &&
        stakeValue > minStakeAllowed
      ) {
        alert(
          `Stake cannot exceed the minimum allowed: $${minStakeAllowed.toFixed(
            2
          )}`
        );
        return;
      }

      onStakeApply(stakeValue, selectedData, selectedBetIds, manualStakeInput);
    });

    if (!isCombinationUsed) {
      applyButton.addEventListener("mouseenter", () => {
        applyButton.style.backgroundColor = "#2563eb";
      });
      applyButton.addEventListener("mouseleave", () => {
        applyButton.style.backgroundColor = "#3b82f6";
      });
    }

    inputContainer.appendChild(manualStakeInput);
    inputContainer.appendChild(applyButton);
    manualStakeContainer.appendChild(inputContainer);
    mixBetSection.appendChild(manualStakeContainer);

    return {
      mixBetSection,
      manualStakeInput,
    };
  }

  /**
   * Create bet items list
   * @param {Array} selectedData - Array of bet data objects
   * @param {Array} blockedBetIds - Array of bet IDs that are blocked (already used)
   * @param {Array} duplicateBetIds - Array of bet IDs that have duplicate games
   * @param {Function} onUnselectBet - Optional function to call when clicking a duplicate bet
   */
  function createBetItemsList(
    selectedData,
    blockedBetIds,
    duplicateBetIds = [],
    onUnselectBet = null
  ) {
    const betItemsContainer = document.createElement("div");
    betItemsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      max-height: 100%;
    `;

    selectedData.forEach((data) => {
      // Check if this bet is part of a blocked combination
      const isBlocked = blockedBetIds.includes(data.betId);
      // Check if this bet has a duplicate game
      const isDuplicate = duplicateBetIds.includes(data.betId);

      const item = document.createElement("div");
      item.style.cssText = `
        padding: 8px 30px 8px 8px;
        background-color: ${isBlocked || isDuplicate ? "#fef2f2" : "#f9fafb"};
        border: 1px solid ${isBlocked || isDuplicate ? "#fecaca" : "#e5e7eb"};
        border-radius: 4px;
        font-size: 10px;
        ${isBlocked || isDuplicate ? "border-left: 3px solid #dc2626;" : ""}
        position: relative;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        gap: 16px;
        width: 100%;
        box-sizing: border-box;
      `;

      // Add X button in right side, vertically centered
      if (onUnselectBet && data.betId) {
        const removeButton = document.createElement("div");
        removeButton.textContent = "×";
        removeButton.style.cssText = `
          position: absolute;
          top: 50%;
          right: 8px;
          transform: translateY(-50%);
          font-size: 18px;
          font-weight: 700;
          color: ${isBlocked || isDuplicate ? "#dc2626" : "#9ca3af"};
          cursor: pointer;
          line-height: 1;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        `;
        removeButton.addEventListener("click", (e) => {
          e.stopPropagation();
          onUnselectBet(data.betId);
        });
        removeButton.addEventListener("mouseenter", () => {
          removeButton.style.color = "#dc2626";
        });
        removeButton.addEventListener("mouseleave", () => {
          removeButton.style.color =
            isBlocked || isDuplicate ? "#dc2626" : "#9ca3af";
        });
        item.appendChild(removeButton);
      }

      // Add warning badge for blocked bets
      if (isBlocked && !isDuplicate) {
        const warningBadge = document.createElement("div");
        warningBadge.textContent = "⚠";
        warningBadge.style.cssText = `
          position: absolute;
          top: 50%;
          left: 8px;
          transform: translateY(-50%);
          font-size: 12px;
          color: #dc2626;
        `;
        item.appendChild(warningBadge);
        // Adjust padding to make room for warning badge
        item.style.paddingLeft = "24px";
      }

      // Get betting data and calculate stake available
      let betData = null;
      let odds = null;
      let evPercentage = null;
      let stakeAvailable = null;

      if (data.betId && window.betIQ && window.betIQ.getBettingDataById) {
        betData = window.betIQ.getBettingDataById(data.betId);
        if (betData) {
          // ONLY use true_odds, no fallback
          odds = betData.true_odds;
          evPercentage = betData.ev_percentage;

          // Calculate stake allowed
          const bankroll =
            window.betIQ && window.betIQ.state
              ? window.betIQ.state.get("config.bankroll")
              : null;
          const kellyFraction =
            window.betIQ && window.betIQ.state
              ? window.betIQ.state.get("config.kellyFraction")
              : null;

          if (bankroll && kellyFraction && window.betIQ.calculateStakeAllowed) {
            const stakeAllowed = window.betIQ.calculateStakeAllowed(
              betData,
              bankroll,
              kellyFraction
            );

            // Get stake used
            const stakeUsed =
              data.betId && window.betIQ && window.betIQ.getStakeUsed
                ? window.betIQ.getStakeUsed(data.betId) || 0
                : 0;

            // Calculate stake available (allowed - used)
            if (stakeAllowed !== null && stakeAllowed > 0) {
              stakeAvailable = Math.max(0, stakeAllowed - stakeUsed);
            }
          }
        }
      }

      // Create a container for horizontal info display
      const infoContainer = document.createElement("div");
      infoContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 16px;
        flex: 1;
        flex-wrap: wrap;
      `;

      // Show game name
      if (data.game) {
        const gameDiv = document.createElement("div");
        gameDiv.style.cssText = `
          color: ${isBlocked || isDuplicate ? "#dc2626" : "#1f2937"};
          font-size: 10px;
          font-weight: 600;
          min-width: 120px;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        `;
        gameDiv.textContent = data.game;
        infoContainer.appendChild(gameDiv);
      }

      // Show odds
      if (odds !== null && odds !== undefined) {
        const oddsDiv = document.createElement("div");
        oddsDiv.style.cssText = `
          color: ${isBlocked || isDuplicate ? "#991b1b" : "#374151"};
          font-size: 10px;
          font-weight: 500;
          white-space: nowrap;
        `;
        oddsDiv.textContent = `Odds: ${odds.toFixed(2)}`;
        infoContainer.appendChild(oddsDiv);
      }

      // Show EV
      if (evPercentage !== null && evPercentage !== undefined) {
        const evDiv = document.createElement("div");
        const evColor =
          evPercentage > 0
            ? "#059669"
            : evPercentage < 0
            ? "#dc2626"
            : "#6b7280";
        evDiv.style.cssText = `
          color: ${evColor};
          font-size: 10px;
          font-weight: 500;
          white-space: nowrap;
        `;
        evDiv.textContent = `EV: ${
          evPercentage >= 0 ? "+" : ""
        }${evPercentage.toFixed(2)}%`;
        infoContainer.appendChild(evDiv);
      }

      // Show stake available
      if (stakeAvailable !== null && stakeAvailable >= 0) {
        const stakeAvailableDiv = document.createElement("div");
        stakeAvailableDiv.style.cssText = `
          color: #1f2937;
          font-size: 10px;
          font-weight: 600;
          white-space: nowrap;
        `;
        stakeAvailableDiv.textContent = `Stake Available: $${stakeAvailable.toFixed(
          2
        )}`;
        infoContainer.appendChild(stakeAvailableDiv);
      }

      item.appendChild(infoContainer);

      betItemsContainer.appendChild(item);
    });

    return betItemsContainer;
  }

  /**
   * Save overlay position to localStorage
   */
  function saveOverlayPosition(selectionOverlay) {
    if (!selectionOverlay) return;

    try {
      const position = {
        left: selectionOverlay.style.left || "",
        top: selectionOverlay.style.top || "",
        right: selectionOverlay.style.right || "",
      };
      localStorage.setItem(
        "betIQ.selectionOverlay.position",
        JSON.stringify(position)
      );
    } catch (e) {
      // Ignore localStorage errors (e.g., in private browsing)
      console.warn("[betIQ-Plugin] Could not save overlay position:", e);
    }
  }

  /**
   * Restore overlay position from localStorage
   */
  function restoreOverlayPosition(selectionOverlay) {
    if (!selectionOverlay) return false;

    try {
      const saved = localStorage.getItem("betIQ.selectionOverlay.position");
      if (!saved) return false;

      const position = JSON.parse(saved);
      if (position && (position.left || position.top || position.right)) {
        // Apply saved position
        if (position.left) {
          const leftValue = parseFloat(position.left);
          if (!isNaN(leftValue)) {
            // Validate position is within viewport
            const maxLeft = window.innerWidth - selectionOverlay.offsetWidth;
            const validatedLeft = Math.max(0, Math.min(leftValue, maxLeft));
            selectionOverlay.style.left = validatedLeft + "px";
            selectionOverlay.style.right = "auto";
          }
        }
        if (position.top) {
          const topValue = parseFloat(position.top);
          if (!isNaN(topValue)) {
            // Validate position is within viewport
            const maxTop = window.innerHeight - selectionOverlay.offsetHeight;
            const validatedTop = Math.max(0, Math.min(topValue, maxTop));
            selectionOverlay.style.top = validatedTop + "px";
          }
        }
        if (position.right && !position.left) {
          selectionOverlay.style.right = position.right;
        }
        return true;
      }
    } catch (e) {
      // Ignore localStorage errors
      console.warn("[betIQ-Plugin] Could not restore overlay position:", e);
    }
    return false;
  }

  /**
   * Setup drag handlers for the overlay header
   */
  function setupHeaderDragHandlers(header, selectionOverlay, dragState) {
    if (!selectionOverlay || !header) return;

    header.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // Only left mouse button

      dragState.isDragging = true;
      const rect = selectionOverlay.getBoundingClientRect();
      dragState.dragOffset.x = e.clientX - rect.left;
      dragState.dragOffset.y = e.clientY - rect.top;

      selectionOverlay.style.cursor = "move";
      header.style.cursor = "move";
      e.preventDefault();
      e.stopPropagation();
    });

    // Use a single mousemove handler on document (more efficient)
    if (!window.betIQ._selectionOverlayMouseMoveHandler) {
      window.betIQ._selectionOverlayMouseMoveHandler = (e) => {
        if (!dragState.isDragging || !selectionOverlay) return;

        let left = e.clientX - dragState.dragOffset.x;
        let top = e.clientY - dragState.dragOffset.y;

        // Keep overlay within viewport bounds
        const maxLeft = window.innerWidth - selectionOverlay.offsetWidth;
        const maxTop = window.innerHeight - selectionOverlay.offsetHeight;

        left = Math.max(0, Math.min(left, maxLeft));
        top = Math.max(0, Math.min(top, maxTop));

        selectionOverlay.style.left = left + "px";
        selectionOverlay.style.top = top + "px";
        selectionOverlay.style.right = "auto";
      };
      document.addEventListener(
        "mousemove",
        window.betIQ._selectionOverlayMouseMoveHandler
      );
    }

    // Use a single mouseup handler on document
    if (!window.betIQ._selectionOverlayMouseUpHandler) {
      window.betIQ._selectionOverlayMouseUpHandler = () => {
        if (dragState.isDragging) {
          dragState.isDragging = false;
          if (selectionOverlay) {
            selectionOverlay.style.cursor = "";
            var overlayHeaderSel =
              (window.betIQ.getSiteConfig &&
                window.betIQ.getSiteConfig().selectionOverlayHeaderSelector) ||
              "div:first-child";
            const headerEl = selectionOverlay.querySelector(overlayHeaderSel);
            if (headerEl) {
              headerEl.style.cursor = "move";
            }
            // Save position to localStorage when drag ends
            saveOverlayPosition(selectionOverlay);
          }
        }
      };
      document.addEventListener(
        "mouseup",
        window.betIQ._selectionOverlayMouseUpHandler
      );
    }
  }

  // Expose functions
  window.betIQ.overlayRenderer.extractRowData = extractRowData;
  window.betIQ.overlayRenderer.getSelectedRows = getSelectedRows;
  window.betIQ.overlayRenderer.createOverlayHeader = createOverlayHeader;
  window.betIQ.overlayRenderer.createMixBetSection = createMixBetSection;
  window.betIQ.overlayRenderer.createBetItemsList = createBetItemsList;
  window.betIQ.overlayRenderer.setupHeaderDragHandlers =
    setupHeaderDragHandlers;
  window.betIQ.overlayRenderer.saveOverlayPosition = saveOverlayPosition;
  window.betIQ.overlayRenderer.restoreOverlayPosition = restoreOverlayPosition;
})();
