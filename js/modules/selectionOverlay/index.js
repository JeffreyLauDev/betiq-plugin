// Selection overlay main orchestrator
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  let selectionOverlay = null;
  let checkboxObserver = null;
  
  // Get drag state from centralized state (or create if doesn't exist)
  function getDragState() {
    if (!window.betIQ.state) {
      return { isDragging: false, dragOffset: { x: 0, y: 0 } };
    }
    const dragState = window.betIQ.state.get("ui.selectionOverlay.dragState");
    if (!dragState) {
      const defaultDragState = { isDragging: false, dragOffset: { x: 0, y: 0 } };
      window.betIQ.state.set("ui.selectionOverlay.dragState", defaultDragState, {
        skipPersistence: true, // Don't persist drag state
      });
      return defaultDragState;
    }
    return dragState;
  }
  
  // Get last selected bet IDs from centralized state
  function getLastSelectedBetIds() {
    if (!window.betIQ.state) return null;
    return window.betIQ.state.get("ui.selectionOverlay.lastSelectedBetIds");
  }
  
  // Set last selected bet IDs in centralized state
  function setLastSelectedBetIds(value) {
    if (window.betIQ.state) {
      window.betIQ.state.set("ui.selectionOverlay.lastSelectedBetIds", value, {
        skipPersistence: true, // Don't persist selection state
      });
    }
  }
  
  // Get manual stake input value from centralized state
  function getManualStakeInputValue() {
    if (!window.betIQ.state) return "";
    return window.betIQ.state.get("ui.selectionOverlay.manualStakeInputValue") || "";
  }
  
  // Set manual stake input value in centralized state
  function setManualStakeInputValue(value) {
    if (window.betIQ.state) {
      window.betIQ.state.set("ui.selectionOverlay.manualStakeInputValue", value, {
        skipPersistence: true, // Don't persist input value
      });
    }
  }

  /**
   * Handle unselect all button click
   */
  function handleUnselectAll() {
    // Find all selected checkboxes and click them to unselect
    // Use a small delay between clicks to ensure React processes each one
    const table = document.querySelector("table");
    if (table) {
      const allRows = table.querySelectorAll("tbody tr, table > tr");
      const selectedCheckboxes = [];

      allRows.forEach((row) => {
        if (row.querySelectorAll("th").length > 0) return;

        const checkbox = row.querySelector('button[role="checkbox"]');
        if (
          checkbox &&
          (checkbox.getAttribute("data-state") === "checked" ||
            checkbox.getAttribute("aria-checked") === "true")
        ) {
          selectedCheckboxes.push(checkbox);
        }
      });

      // Click each checkbox with a delay to ensure React processes each click
      selectedCheckboxes.forEach((checkbox, index) => {
        setTimeout(() => {
          // Re-query the checkbox in case React re-rendered the DOM
          const row = checkbox.closest("tr");
          if (row) {
            const currentCheckbox = row.querySelector(
              'button[role="checkbox"]'
            );
            if (
              currentCheckbox &&
              (currentCheckbox.getAttribute("data-state") === "checked" ||
                currentCheckbox.getAttribute("aria-checked") === "true")
            ) {
              currentCheckbox.click();
            }
          } else {
            // Fallback to original checkbox if row not found
            checkbox.click();
          }
        }, index * 100); // 100ms delay between each click
      });
    }
  }

  /**
   * Handle stake apply from mix bet section
   */
  function handleStakeApply(
    stakeValue,
    selectedData,
    selectedBetIds,
    manualStakeInput
  ) {
    // Apply stake to all selected bets
    let appliedCount = 0;
    selectedData.forEach((data) => {
      if (data.betId && window.betIQ && window.betIQ.setStakeUsed) {
        // Get existing stake and add to it (accumulate)
        const existingStake =
          window.betIQ.getStakeUsed && window.betIQ.getStakeUsed(data.betId)
            ? window.betIQ.getStakeUsed(data.betId)
            : 0;
        const newStake = existingStake + stakeValue;
        window.betIQ.setStakeUsed(data.betId, newStake);
        appliedCount++;
      }
    });

    if (appliedCount > 0) {
      // Save this combination as used
      if (window.betIQ.mixBetStorage?.saveUsedMixBetCombination) {
        window.betIQ.mixBetStorage.saveUsedMixBetCombination(selectedBetIds);
      }

      // Clear input
      manualStakeInput.value = "";
      setManualStakeInputValue("");

      // Force update by clearing lastSelectedBetIds so overlay re-renders
      setLastSelectedBetIds(null);

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
  }

  /**
   * Update the selection overlay
   */
  function updateSelectionOverlay() {
    const selectedRows =
      window.betIQ.overlayRenderer?.getSelectedRows() || [];

    if (selectedRows.length <= 1) {
      if (selectionOverlay) {
        selectionOverlay.remove();
        selectionOverlay = null;
      }
      setLastSelectedBetIds(null);
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
    const lastSelectedBetIds = getLastSelectedBetIds();
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
        setManualStakeInputValue(existingInput.value);
      }
      // Don't re-render if selection hasn't changed
      return;
    }

    // Update last selected bet IDs
    setLastSelectedBetIds(currentSelectedBetIds);

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
      const data = window.betIQ.overlayRenderer?.extractRowData(row);
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

    // Create header
    const { header, headerText } =
      window.betIQ.overlayRenderer?.createOverlayHeader(
        selectedData.length,
        handleUnselectAll
      ) || {};

    // Create content
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
        const { mixBetSection, manualStakeInput } =
          window.betIQ.overlayRenderer?.createMixBetSection(
            selectedData,
            betDataArray,
            selectedBetIds,
            getManualStakeInputValue(),
            handleStakeApply
          ) || {};

        if (mixBetSection) {
          content.appendChild(mixBetSection);

          // Preserve input value on change
          if (manualStakeInput) {
            manualStakeInput.addEventListener("input", (e) => {
              setManualStakeInputValue(e.target.value);
            });
          }

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

        // Determine which bets are blocked
        const combinationCheck =
          window.betIQ.mixBetStorage?.isMixBetCombinationUsed(selectedBetIds);
        const blockedBetIds = combinationCheck?.blockedBetIds || [];

        // Create bet items list
        const betItemsContainer =
          window.betIQ.overlayRenderer?.createBetItemsList(
            selectedData,
            blockedBetIds
          );
        if (betItemsContainer) {
          content.appendChild(betItemsContainer);
        }
      } else {
        // Create bet items list without mix bet section
        const betItemsContainer =
          window.betIQ.overlayRenderer?.createBetItemsList(selectedData, []);
        if (betItemsContainer) {
          content.appendChild(betItemsContainer);
        }
      }
    }

    selectionOverlay.innerHTML = "";
    if (header) {
      selectionOverlay.appendChild(header);
    }
    selectionOverlay.appendChild(content);

    // Setup drag handlers on the header text after it's been added to DOM
    if (headerText) {
      const dragState = getDragState();
      window.betIQ.overlayRenderer?.setupHeaderDragHandlers(
        headerText,
        selectionOverlay,
        dragState
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

