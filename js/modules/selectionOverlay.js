// Selection overlay for multiple bet selection
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  let selectionOverlay = null;
  let checkboxObserver = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let lastSelectedBetIds = null; // Track selected bet IDs to avoid unnecessary re-renders
  let manualStakeInputValue = ""; // Preserve input value across re-renders

  /**
   * Get used mix bet combinations from storage
   */
  function getUsedMixBetCombinations() {
    try {
      const stored = localStorage.getItem("betiq-used-mix-bets");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Save a mix bet combination as used
   */
  function saveUsedMixBetCombination(betIds) {
    try {
      const used = getUsedMixBetCombinations();
      const combinationKey = betIds.sort().join(",");
      if (!used.includes(combinationKey)) {
        used.push(combinationKey);
        localStorage.setItem("betiq-used-mix-bets", JSON.stringify(used));
      }
    } catch (e) {
      console.error("[betIQ-Plugin] Error saving mix bet combination:", e);
    }
  }

  /**
   * Check if a mix bet combination has been used
   * Also checks if any subset of the combination has been used
   * Returns: { isUsed: boolean, blockedBetIds: string[] } - blockedBetIds contains ALL bet IDs that are part of any used subset
   */
  function isMixBetCombinationUsed(betIds) {
    const used = getUsedMixBetCombinations();
    if (used.length === 0) {
      return { isUsed: false, blockedBetIds: [] };
    }

    const sortedBetIds = [...betIds].sort();
    const combinationKey = sortedBetIds.join(",");

    // Check if exact combination is used
    if (used.includes(combinationKey)) {
      return { isUsed: true, blockedBetIds: sortedBetIds };
    }

    // Check if any subset of this combination has been used
    // Collect ALL bet IDs that are part of any used subset
    const blockedBetIdsSet = new Set();

    // Generate all possible subsets of size 2, 3, etc. (up to current size - 1)
    for (let subsetSize = 2; subsetSize < sortedBetIds.length; subsetSize++) {
      // Generate all combinations of this size
      const subsets = generateCombinations(sortedBetIds, subsetSize);

      for (const subset of subsets) {
        const subsetKey = subset.join(",");
        if (used.includes(subsetKey)) {
          // Found a used subset - add all bet IDs from this subset to blocked set
          subset.forEach((betId) => blockedBetIdsSet.add(betId));
        }
      }
    }

    // If we found any blocked bets, the combination is blocked
    if (blockedBetIdsSet.size > 0) {
      return { isUsed: true, blockedBetIds: Array.from(blockedBetIdsSet) };
    }

    return { isUsed: false, blockedBetIds: [] };
  }

  /**
   * Generate all combinations of a given size from an array
   */
  function generateCombinations(arr, size) {
    if (size === 0) return [[]];
    if (arr.length === 0) return [];

    const [first, ...rest] = arr;
    const withFirst = generateCombinations(rest, size - 1).map((combo) => [
      first,
      ...combo,
    ]);
    const withoutFirst = generateCombinations(rest, size);

    return [...withFirst, ...withoutFirst];
  }

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
   * Calculate mix bet EV
   * Formula: ((boosted odds1 × boosted odds2 × ...) - (real odds1 × real odds2 × ...)) / (real odds1 × real odds2 × ...) × 100
   */
  function calculateMixBetEV(betDataArray) {
    if (!betDataArray || betDataArray.length < 2) {
      return null;
    }

    let boostedProduct = 1;
    let realProduct = 1;
    let allValid = true;

    for (const betData of betDataArray) {
      const boostedOdds = betData.odds;
      const realOdds = betData.true_odds;

      if (!boostedOdds || !realOdds || boostedOdds <= 1 || realOdds <= 1) {
        allValid = false;
        break;
      }

      boostedProduct *= boostedOdds;
      realProduct *= realOdds;
    }

    if (!allValid) {
      return null;
    }

    const ev = ((boostedProduct - realProduct) / realProduct) * 100;
    return ev;
  }

  /**
   * Calculate minimum stake allowed across all bets
   * Accounts for existing manual allocations: min(stake allowed - manual allocations)
   */
  function calculateMinStakeAllowed(betDataArray, selectedBetIds) {
    if (!betDataArray || betDataArray.length === 0) {
      return null;
    }

    const bankroll =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("bankroll")
        : null;
    const kellyFraction =
      window.betIQ && window.betIQ.state
        ? window.betIQ.state.get("kellyFraction")
        : null;

    if (!bankroll || !kellyFraction) {
      return null;
    }

    let minAvailableStake = null;

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

        if (minAvailableStake === null || availableStake < minAvailableStake) {
          minAvailableStake = availableStake;
        }
      }
    }

    return minAvailableStake;
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
   * Update the selection overlay
   */
  function updateSelectionOverlay() {
    const selectedRows = getSelectedRows();

    if (selectedRows.length <= 1) {
      if (selectionOverlay) {
        selectionOverlay.remove();
        selectionOverlay = null;
      }
      lastSelectedBetIds = null;
      return;
    }

    // Get current selected bet IDs
    const currentSelectedBetIds = [];
    selectedRows.forEach((row) => {
      const betId = row.getAttribute("data-id");
      if (betId) {
        currentSelectedBetIds.push(betId);
      }
    });
    currentSelectedBetIds.sort();

    // Check if selection actually changed
    const selectionChanged =
      !lastSelectedBetIds ||
      lastSelectedBetIds.length !== currentSelectedBetIds.length ||
      !lastSelectedBetIds.every(
        (id, index) => id === currentSelectedBetIds[index]
      );

    // Preserve input value if overlay exists and selection hasn't changed
    if (selectionOverlay && !selectionChanged) {
      const existingInput = selectionOverlay.querySelector(
        'input[type="number"]'
      );
      if (existingInput) {
        manualStakeInputValue = existingInput.value;
      }
      // Don't re-render if selection hasn't changed
      return;
    }

    // Update last selected bet IDs
    lastSelectedBetIds = currentSelectedBetIds;

    if (!selectionOverlay) {
      selectionOverlay = document.createElement("div");
      selectionOverlay.id = "betiq-selection-overlay";
      selectionOverlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 420px;
        max-height: 600px;
        background-color: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        z-index: 10001;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        user-select: none;
      `;
      document.body.appendChild(selectionOverlay);
    }

    const selectedData = [];
    const betDataArray = [];
    const selectedBetIds = [];

    selectedRows.forEach((row) => {
      const data = extractRowData(row);
      if (data) {
        selectedData.push(data);
        if (data.betId) {
          selectedBetIds.push(data.betId);
        }

        // Get betting data for mix bet calculations
        if (data.betId && window.betIQ.getBettingDataById) {
          const betData = window.betIQ.getBettingDataById(data.betId);
          if (betData) {
            betDataArray.push(betData);
          }
        }
      }
    });

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
    `;
    header.textContent = `Selected Bets (${selectedData.length})`;
    header.title = "Drag to move";

    const content = document.createElement("div");
    content.style.cssText = `
      padding: 10px;
      display: flex;
      flex-direction: column;
      max-height: 500px;
      overflow: hidden;
    `;

    if (selectedData.length === 0) {
      content.innerHTML = `
        <div style="padding: 12px; text-align: center; color: #6b7280; font-size: 11px;">
          No valid data found in selected rows
        </div>
      `;
    } else {
      // Show mix bet calculations if we have 2+ bets with valid data
      if (
        selectedData.length >= 2 &&
        betDataArray.length === selectedData.length
      ) {
        const mixBetEV = calculateMixBetEV(betDataArray);
        const minStakeAllowed = calculateMinStakeAllowed(
          betDataArray,
          selectedBetIds
        );
        const combinationCheck = isMixBetCombinationUsed(selectedBetIds);
        const isCombinationUsed = combinationCheck.isUsed;
        const blockedBetIds = combinationCheck.blockedBetIds;

        // Mix Bet Summary Section
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
        // Allow Enter key to apply
        manualStakeInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            applyButton.click();
          }
        });
        // Preserve value on input
        manualStakeInput.addEventListener("input", (e) => {
          manualStakeInputValue = e.target.value;
        });
        inputContainer.appendChild(manualStakeInput);

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
        if (!isCombinationUsed) {
          applyButton.addEventListener("mouseenter", () => {
            applyButton.style.backgroundColor = "#2563eb";
          });
          applyButton.addEventListener("mouseleave", () => {
            applyButton.style.backgroundColor = "#3b82f6";
          });
        }
        applyButton.addEventListener("click", () => {
          // Prevent applying if combination already used
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

          // Apply stake to all selected bets
          let appliedCount = 0;
          selectedData.forEach((data) => {
            if (data.betId && window.betIQ && window.betIQ.setStakeUsed) {
              // Get existing stake and add to it (accumulate)
              const existingStake =
                window.betIQ.getStakeUsed &&
                window.betIQ.getStakeUsed(data.betId)
                  ? window.betIQ.getStakeUsed(data.betId)
                  : 0;
              const newStake = existingStake + stakeValue;
              window.betIQ.setStakeUsed(data.betId, newStake);
              appliedCount++;
            }
          });

          if (appliedCount > 0) {
            // Save this combination as used
            saveUsedMixBetCombination(selectedBetIds);

            // Clear input
            manualStakeInput.value = "";
            manualStakeInputValue = "";

            // Force update by clearing lastSelectedBetIds so overlay re-renders
            lastSelectedBetIds = null;

            // Update the overlay to reflect new stakes
            setTimeout(() => {
              updateSelectionOverlay();
            }, 100);

            // Show notification if available
            if (window.betIQ.showNotification) {
              window.betIQ.showNotification(
                `Applied $${stakeValue.toFixed(2)} to ${appliedCount} bet(s)`
              );
            }
          }
        });
        inputContainer.appendChild(applyButton);

        manualStakeContainer.appendChild(inputContainer);
        mixBetSection.appendChild(manualStakeContainer);

        content.appendChild(mixBetSection);

        // Divider
        const divider = document.createElement("div");
        divider.style.cssText = `
          height: 1px;
          background-color: #e5e7eb;
          margin: 10px 0;
          flex-shrink: 0;
        `;
        content.appendChild(divider);
      }

      // Individual bet items container with grid layout
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

      // Determine which bets are blocked (only if we have mix bet section)
      let blockedBetIdsForDisplay = [];
      if (
        selectedData.length >= 2 &&
        betDataArray.length === selectedData.length
      ) {
        const combinationCheck = isMixBetCombinationUsed(selectedBetIds);
        blockedBetIdsForDisplay = combinationCheck.blockedBetIds || [];
      }

      selectedData.forEach((data, index) => {
        // Check if this bet is part of a blocked combination
        const isBlocked = blockedBetIdsForDisplay.includes(data.betId);

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
            item.appendChild(gameDiv);
            item.appendChild(playerDiv);
            item.appendChild(betTypeDiv);
            item.appendChild(stakeDiv);
          } else {
            item.appendChild(gameDiv);
            item.appendChild(playerDiv);
            item.appendChild(betTypeDiv);
          }
        } else {
          item.appendChild(gameDiv);
          item.appendChild(playerDiv);
          item.appendChild(betTypeDiv);
        }
        betItemsContainer.appendChild(item);
      });

      content.appendChild(betItemsContainer);
    }

    selectionOverlay.innerHTML = "";
    selectionOverlay.appendChild(header);
    selectionOverlay.appendChild(content);

    // Setup drag handlers on the header after it's been added to DOM
    setupHeaderDragHandlers(header);
  }

  /**
   * Setup drag handlers for the overlay header
   */
  function setupHeaderDragHandlers(header) {
    if (!selectionOverlay || !header) return;

    header.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // Only left mouse button

      isDragging = true;
      const rect = selectionOverlay.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;

      selectionOverlay.style.cursor = "move";
      header.style.cursor = "move";
      e.preventDefault();
      e.stopPropagation();
    });

    // Use a single mousemove handler on document (more efficient)
    if (!window.betIQ._selectionOverlayMouseMoveHandler) {
      window.betIQ._selectionOverlayMouseMoveHandler = (e) => {
        if (!isDragging || !selectionOverlay) return;

        let left = e.clientX - dragOffset.x;
        let top = e.clientY - dragOffset.y;

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
        if (isDragging) {
          isDragging = false;
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

  /**
   * Setup observer for checkbox changes
   */
  function setupCheckboxObserver() {
    const table = document.querySelector("table");
    if (!table) {
      return;
    }

    if (checkboxObserver) {
      checkboxObserver.disconnect();
      checkboxObserver = null;
    }

    checkboxObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (
            target.tagName === "BUTTON" &&
            target.getAttribute("role") === "checkbox" &&
            (mutation.attributeName === "data-state" ||
              mutation.attributeName === "aria-checked")
          ) {
            shouldUpdate = true;
          }
        }

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

    checkboxObserver.observe(table, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-checked"],
    });

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
    updateSelectionOverlay();
  };
})();
