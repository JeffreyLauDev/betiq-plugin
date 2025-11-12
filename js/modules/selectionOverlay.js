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
   * Update the selection overlay
   */
  function updateSelectionOverlay() {
    const selectedRows = getSelectedRows();

    if (selectedRows.length <= 1) {
      if (selectionOverlay) {
        selectionOverlay.remove();
        selectionOverlay = null;
      }
      return;
    }

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
        user-select: none;
      `;
      document.body.appendChild(selectionOverlay);
    }

    const selectedData = [];
    selectedRows.forEach((row) => {
      const data = extractRowData(row);
      if (data) {
        selectedData.push(data);
      }
    });

    const header = document.createElement("div");
    header.style.cssText = `
      padding: 16px;
      background-color: #f3f4f6;
      border-bottom: 1px solid #e5e7eb;
      font-weight: 600;
      font-size: 14px;
      color: #1f2937;
      cursor: move;
      user-select: none;
    `;
    header.textContent = `Selected Bets (${selectedData.length})`;
    header.title = "Drag to move";

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
