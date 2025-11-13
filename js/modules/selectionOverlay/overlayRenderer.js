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
    if (cells.length < 7) {
      return null;
    }

    const game = (cells[3]?.textContent || "").trim();
    const player = (cells[5]?.textContent || "").trim();
    const betType = (cells[6]?.textContent || "").trim();
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
      if (row.querySelectorAll("th").length > 0) {
        return;
      }

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
   */
  function createBetItemsList(selectedData, blockedBetIds) {
    const betItemsContainer = document.createElement("div");
    betItemsContainer.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      max-height: 100%;
    `;

    selectedData.forEach((data) => {
      // Check if this bet is part of a blocked combination
      const isBlocked = blockedBetIds.includes(data.betId);

      const item = document.createElement("div");
      item.style.cssText = `
        padding: 6px;
        background-color: ${isBlocked ? "#fef2f2" : "#f9fafb"};
        border: 1px solid ${isBlocked ? "#fecaca" : "#e5e7eb"};
        border-radius: 4px;
        font-size: 10px;
        ${isBlocked ? "border-left: 3px solid #dc2626;" : ""}
      `;

      const gameDiv = document.createElement("div");
      gameDiv.style.cssText = `
        font-weight: 600;
        color: ${isBlocked ? "#dc2626" : "#1f2937"};
        margin-bottom: 2px;
        font-size: 10px;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      gameDiv.textContent = data.game;
      if (isBlocked) {
        const blockedBadge = document.createElement("span");
        blockedBadge.textContent = " ⚠";
        blockedBadge.style.cssText = `
          font-size: 9px;
          color: #dc2626;
          font-weight: 700;
          margin-left: 3px;
        `;
        gameDiv.appendChild(blockedBadge);
      }

      const playerDiv = document.createElement("div");
      playerDiv.style.cssText = `
        color: ${isBlocked ? "#991b1b" : "#374151"};
        margin-bottom: 1px;
        font-size: 9px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      playerDiv.textContent = `P: ${data.player}`;

      const betTypeDiv = document.createElement("div");
      betTypeDiv.style.cssText = `
        color: ${isBlocked ? "#991b1b" : "#374151"};
        margin-bottom: 2px;
        font-size: 9px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      betTypeDiv.textContent = `Type: ${data.betType}`;

      item.appendChild(gameDiv);
      item.appendChild(playerDiv);
      item.appendChild(betTypeDiv);

      // Show current stake if available
      if (data.betId && window.betIQ && window.betIQ.getStakeUsed) {
        const currentStake = window.betIQ.getStakeUsed(data.betId);
        if (currentStake > 0) {
          const stakeDiv = document.createElement("div");
          stakeDiv.style.cssText = `
            color: #059669;
            font-weight: 500;
            font-size: 9px;
            margin-top: 2px;
          `;
          stakeDiv.textContent = `$${currentStake.toFixed(2)}`;
          item.appendChild(stakeDiv);
        }
      }

      betItemsContainer.appendChild(item);
    });

    return betItemsContainer;
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
            const headerEl = selectionOverlay.querySelector("div:first-child");
            if (headerEl) {
              headerEl.style.cursor = "move";
            }
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
  window.betIQ.overlayRenderer.setupHeaderDragHandlers = setupHeaderDragHandlers;
})();

