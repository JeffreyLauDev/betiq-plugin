// Match existing table rows with API data and add IDs
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  /**
   * Extract text content from a cell, handling nested elements
   */
  function extractCellText(cell) {
    if (!cell) return "";
    // Get all text, removing extra whitespace
    return cell.innerText || cell.textContent || "";
  }

  /**
   * Extract numeric value from text (for line, odds)
   */
  function extractNumber(text) {
    if (!text) return null;
    const match = text.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  }

  /**
   * Normalize text for comparison (lowercase, trim)
   */
  function normalizeText(text) {
    return (text || "").toLowerCase().trim();
  }

  /**
   * Normalize game time for comparison (handle different formats)
   */
  function normalizeGameTime(gameTimeText) {
    if (!gameTimeText) return "";
    // Remove extra whitespace and normalize
    return normalizeText(gameTimeText);
  }

  /**
   * Normalize game time from API (handle different formats)
   * API might have game_time or we might need to extract from created_at/other fields
   */
  function normalizeAPIGameTime(apiBet) {
    // Try game_datetime first (betting_alerts endpoint format: "13/11 14:00")
    if (apiBet.game_datetime) {
      const gameTime = apiBet.game_datetime;
      if (typeof gameTime === "string") {
        // game_datetime might already be in format "13/11 14:00" - just normalize it
        return normalizeText(gameTime);
      }
    }

    // Try game_time field (v_betting_alert_confidence_optimized endpoint)
    if (apiBet.game_time) {
      const gameTime = apiBet.game_time;
      if (typeof gameTime === "string") {
        try {
          const date = new Date(gameTime);
          if (!isNaN(date.getTime())) {
            // Format as MM/DD HH:MM:SS (matching table format like "05/11 13:00:00")
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            const hours = String(date.getHours()).padStart(2, "0");
            const minutes = String(date.getMinutes()).padStart(2, "0");
            const seconds = String(date.getSeconds()).padStart(2, "0");
            return normalizeText(
              `${month}/${day} ${hours}:${minutes}:${seconds}`
            );
          }
        } catch (e) {
          // If parsing fails, just normalize the string
          return normalizeText(gameTime);
        }
      }
      return normalizeText(gameTime);
    }

    // If neither exists, return empty string (we'll match without it)
    return "";
  }

  /**
   * Get bet type from API data
   * API might have bet_type field, or we might need to infer it
   * Handle different field name conventions
   */
  function getAPIBetType(bet) {
    // Try different possible field names
    if (bet.bet_type) {
      return normalizeText(bet.bet_type);
    }
    if (bet.type) {
      return normalizeText(bet.type);
    }
    if (bet.direction) {
      return normalizeText(bet.direction);
    }

    // If not available, return empty string (we'll match without it)
    return "";
  }

  /**
   * Extract numeric value from confidence text
   */
  function extractConfidence(text) {
    if (!text) return null;
    const match = text.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  }

  /**
   * Match a table row with API data based on game, game time, player, bet type, prop, and confidence
   * Required fields: Game, Player, Prop
   * Optional fields: Game Time, Bet Type, Confidence (matched if present in both)
   */
  function matchRowWithData(row, apiData) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 9) return null;

    // Extract required fields from table row
    // Column 4: Game (index 3)
    const gameText = normalizeText(extractCellText(cells[3]));

    // Column 5: Game Time (index 4)
    const gameTimeText = normalizeGameTime(extractCellText(cells[4]));

    // Column 6: Player (index 5)
    const playerText = normalizeText(extractCellText(cells[5]));

    // Column 7: Bet Type (index 6)
    const betTypeText = normalizeText(extractCellText(cells[6]));

    // Column 9: Prop (index 8)
    const propText = normalizeText(extractCellText(cells[8]));

    // Confidence column (shifted to index 18 after adding ID column)
    let confidenceText = null;
    let confidenceNum = null;
    // Try to find confidence cell - it should be after Created column
    // Count backwards or search for the cell containing confidence data
    if (cells.length > 18) {
      confidenceText = extractCellText(cells[18]);
      confidenceNum = extractConfidence(confidenceText);
    }

    // Game, Player, and Prop must be present (required fields)
    if (!gameText || !playerText || !propText) {
      return null;
    }

    // Try to match with API data
    for (const bet of apiData) {
      // Extract and normalize API fields
      // Handle different field name conventions (betting_alerts vs v_betting_alert_confidence_optimized)
      const apiGame = normalizeText(
        bet.game || bet.game_name || bet.match || bet.matchup || ""
      );
      const apiGameTime = normalizeAPIGameTime(bet);
      const apiPlayer = normalizeText(
        bet.player || bet.player_name || bet.athlete || ""
      );
      const apiBetType = getAPIBetType(bet);
      const apiProp = normalizeText(
        bet.prop || bet.prop_type || bet.stat_type || ""
      );
      const apiConfidence =
        bet.confidence_score !== undefined && bet.confidence_score !== null
          ? parseFloat(bet.confidence_score)
          : bet.confidence !== undefined && bet.confidence !== null
          ? parseFloat(bet.confidence)
          : null;

      // Game, Player, and Prop must match (required)
      if (
        apiGame !== gameText ||
        apiPlayer !== playerText ||
        apiProp !== propText
      ) {
        // Skip this bet - doesn't match required fields
        continue;
      }

      // Game Time matching (if both are present, they must match)
      // Handle formats with/without seconds: "13/11 14:00" vs "13/11 14:00:00"
      if (gameTimeText && apiGameTime) {
        // Normalize both by removing seconds if present for comparison
        // Check if time has seconds (format: HH:MM:SS) by counting colons in time part
        const normalizeTime = (timeStr) => {
          const parts = timeStr.split(" ");
          if (parts.length < 2) return timeStr;

          const datePart = parts[0]; // "13/11"
          const timePart = parts[1]; // "14:00:00" or "14:00"

          // If time part has 2 colons (HH:MM:SS), remove seconds
          if ((timePart.match(/:/g) || []).length === 2) {
            // Has seconds, remove them: "14:00:00" -> "14:00"
            const timeWithoutSeconds = timePart.replace(/:\d{2}$/, "");
            return `${datePart} ${timeWithoutSeconds}`;
          }

          // No seconds, return as is
          return timeStr;
        };

        const normalizedTableTime = normalizeTime(gameTimeText);
        const normalizedAPITime = normalizeTime(apiGameTime);

        if (normalizedAPITime !== normalizedTableTime) {
          // Game time doesn't match, skip this bet
          continue;
        }
      }

      // Bet Type matching (if both are present, they must match)
      if (betTypeText && apiBetType) {
        if (apiBetType !== betTypeText) {
          continue;
        }
      }

      // Confidence matching (if both are present, they must match within tolerance)
      if (confidenceNum !== null && apiConfidence !== null) {
        if (Math.abs(confidenceNum - apiConfidence) >= 0.01) {
          continue;
        }
      }

      // If we got here, all required fields match and optional fields match if present
      return bet;
    }

    return null;
  }

  /**
   * Show error notification for row identifier issues
   */
  function showRowIdError(message) {
    // Remove existing error if present
    const existingError = document.getElementById("betiq-duplicate-id-error");
    if (existingError) {
      existingError.remove();
    }

    // Create error notification
    const errorBar = document.createElement("div");
    errorBar.id = "betiq-duplicate-id-error";
    errorBar.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background-color: #ef4444;
      color: white;
      padding: 12px 20px;
      text-align: center;
      font-weight: 600;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      animation: slideDown 0.3s ease-out;
    `;

    // Add animation keyframes if not already added
    if (!document.getElementById("betiq-error-animations")) {
      const style = document.createElement("style");
      style.id = "betiq-error-animations";
      style.textContent = `
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }

    errorBar.textContent =
      message ||
      "⚠️ Row Identifier Bug Detected: Please report this to the developer for investigation.";

    // Add close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 0 8px;
      line-height: 1;
    `;
    closeBtn.onclick = () => errorBar.remove();
    errorBar.appendChild(closeBtn);

    document.body.appendChild(errorBar);
  }

  /**
   * Match existing table rows with API data and add IDs
   */
  window.betIQ.generateBettingDataTable = function () {
    const capturedBettingData = window.betIQ.getCapturedBettingData();

    if (capturedBettingData.length === 0) {
      return;
    }

    // Find all tables on the page
    const tables = document.querySelectorAll("table");
    if (tables.length === 0) {
      return;
    }

    let matchedCount = 0;
    const betIdMap = new Map(); // Track which bet_id is assigned to which rows
    let hasDuplicateIds = false;
    let missingIdRows = [];

    // Process each table
    tables.forEach((table) => {
      // Find all data rows (rows with td, not th)
      const dataRows = Array.from(
        table.querySelectorAll("tbody tr, table > tr")
      ).filter((row) => {
        const hasTh = row.querySelectorAll("th").length > 0;
        const hasTd = row.querySelectorAll("td").length > 0;
        return hasTd && !hasTh;
      });

      // Match each row with API data
      dataRows.forEach((row) => {
        // Check if row already has ID
        const existingId = row.getAttribute("data-id") || row.id;

        if (existingId) {
          // Row already has ID, check for duplicates
          if (betIdMap.has(existingId)) {
            hasDuplicateIds = true;
            console.error(
              `[betIQ-Plugin] ⚠️ DUPLICATE ID DETECTED!`,
              `bet_id: ${existingId}`,
              `Existing row:`,
              betIdMap.get(existingId),
              `New row:`,
              row
            );
          } else {
            betIdMap.set(existingId, row);
          }

          // Update ID cell if it exists
          const idCell = row.querySelector("[data-betiq-cell='id']");
          if (idCell && existingId) {
            idCell.textContent = existingId;
            // Always update click handler (handles Next.js re-renders)
            // Remove old click handler by cloning
            const oldCell = idCell;
            const newCell = idCell.cloneNode(false);
            newCell.textContent = existingId;
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
                window.betIQ.showStakePopup(existingId, row);
              }
            });
          }
          return;
        }

        // Try to match and assign ID
        const matchedBet = matchRowWithData(row, capturedBettingData);
        if (matchedBet) {
          // Try bet_id first, then id, then generate from other fields
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
            return; // Skip this row if no ID found
          }

          // Check for duplicate ID
          if (betIdMap.has(betId)) {
            // Duplicate detected!
            hasDuplicateIds = true;
            const existingRow = betIdMap.get(betId);
            console.error(
              `[betIQ-Plugin] ⚠️ DUPLICATE ID DETECTED!`,
              `bet_id: ${betId}`,
              `Existing row:`,
              existingRow,
              `New row:`,
              row
            );

            // Don't assign the duplicate ID, mark as missing
            missingIdRows.push(row);
            return;
          }

          // Add data-id attribute with bet_id
          row.setAttribute("data-id", betId);
          betIdMap.set(betId, row);
          matchedCount++;

          // Update ID cell if it exists
          const idCell = row.querySelector("[data-betiq-cell='id']");
          if (idCell) {
            idCell.textContent = betId;
            // Always update click handler (handles Next.js re-renders that remove handlers)
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
        } else {
          // Could not match this row, mark as missing ID
          missingIdRows.push(row);
          if (window.betiqDebugEnabled) {
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

    // Check for any rows without IDs
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

      showRowIdError(errorMessage);

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

    if (matchedCount > 0) {
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

  /**
   * Show stake popup modal for a specific bet ID
   */
  window.betIQ.showStakePopup = function (betId, row) {
    // Remove existing popup if present
    const existingPopup = document.getElementById("betiq-stake-popup");
    if (existingPopup) {
      existingPopup.remove();
    }

    // Create overlay
    const overlay = document.createElement("div");
    overlay.id = "betiq-stake-popup";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      animation: fadeIn 0.2s ease-out;
    `;

    // Create modal
    const modal = document.createElement("div");
    modal.style.cssText = `
      background-color: white;
      border-radius: 8px;
      padding: 24px;
      min-width: 400px;
      max-width: 500px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      animation: slideUp 0.3s ease-out;
    `;

    // Add animations if not already added
    if (!document.getElementById("betiq-popup-animations")) {
      const style = document.createElement("style");
      style.id = "betiq-popup-animations";
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Title
    const title = document.createElement("h2");
    title.textContent = "Stake Configuration";
    title.style.cssText = `
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 20px 0;
      color: #1f2937;
    `;
    modal.appendChild(title);

    // Bet ID display
    const betIdDisplay = document.createElement("div");
    betIdDisplay.style.cssText = `
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 20px;
      font-family: monospace;
    `;
    betIdDisplay.textContent = `Bet ID: ${betId}`;
    modal.appendChild(betIdDisplay);

    // Get bet data for calculation
    const betData =
      window.betIQ && window.betIQ.getBettingDataById
        ? window.betIQ.getBettingDataById(betId)
        : null;

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
    let stakeAllowed = 0;
    if (betData && bankroll && kellyFraction) {
      const calculated =
        window.betIQ && window.betIQ.calculateStakeAllowed
          ? window.betIQ.calculateStakeAllowed(betData, bankroll, kellyFraction)
          : null;
      if (calculated !== null) {
        stakeAllowed = calculated;
      }
    }

    // Get stake used
    const stakeUsed =
      window.betIQ && window.betIQ.getStakeUsed
        ? window.betIQ.getStakeUsed(betId)
        : 0;

    // Stake Used section
    const stakeUsedContainer = document.createElement("div");
    stakeUsedContainer.style.cssText = `margin-bottom: 20px;`;

    const stakeUsedLabel = document.createElement("label");
    stakeUsedLabel.textContent = "Stake Used";
    stakeUsedLabel.style.cssText = `
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      color: #374151;
    `;
    stakeUsedContainer.appendChild(stakeUsedLabel);

    const stakeUsedDisplay = document.createElement("div");
    stakeUsedDisplay.style.cssText = `
      padding: 10px;
      background-color: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
      color: #1f2937;
      font-weight: 500;
    `;
    stakeUsedDisplay.textContent = `$${stakeUsed.toFixed(
      2
    )} / $${stakeAllowed.toFixed(2)}`;
    stakeUsedContainer.appendChild(stakeUsedDisplay);

    // Progress bar
    if (stakeAllowed > 0) {
      const percentage = Math.min((stakeUsed / stakeAllowed) * 100, 100);
      const progressBar = document.createElement("div");
      progressBar.style.cssText = `
        width: 100%;
        height: 8px;
        background-color: #e5e7eb;
        border-radius: 4px;
        margin-top: 8px;
        overflow: hidden;
      `;

      const progressFill = document.createElement("div");
      let fillColor;
      if (percentage < 50) {
        fillColor = "#22c55e"; // Green
      } else if (percentage < 80) {
        fillColor = "#eab308"; // Yellow
      } else {
        fillColor = "#ef4444"; // Red
      }

      progressFill.style.cssText = `
        width: ${percentage}%;
        height: 100%;
        background-color: ${fillColor};
        transition: width 0.3s ease;
      `;
      progressBar.appendChild(progressFill);
      stakeUsedContainer.appendChild(progressBar);
    }

    modal.appendChild(stakeUsedContainer);

    // Stake Allowed section
    const stakeAllowedContainer = document.createElement("div");
    stakeAllowedContainer.style.cssText = `margin-bottom: 20px;`;

    const stakeAllowedLabel = document.createElement("label");
    stakeAllowedLabel.textContent = "Stake Allowed (Maximum)";
    stakeAllowedLabel.style.cssText = `
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      color: #374151;
    `;
    stakeAllowedContainer.appendChild(stakeAllowedLabel);

    const stakeAllowedValue = document.createElement("div");
    stakeAllowedValue.textContent =
      stakeAllowed > 0 ? `$${stakeAllowed.toFixed(2)}` : "Not available";
    stakeAllowedValue.style.cssText = `
      padding: 10px;
      background-color: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
      color: ${stakeAllowed > 0 ? "#1f2937" : "#6b7280"};
      font-weight: ${stakeAllowed > 0 ? "500" : "400"};
      font-style: ${stakeAllowed > 0 ? "normal" : "italic"};
    `;
    stakeAllowedContainer.appendChild(stakeAllowedValue);
    modal.appendChild(stakeAllowedContainer);

    // Manual Stake section
    const manualStakeContainer = document.createElement("div");
    manualStakeContainer.style.cssText = `margin-bottom: 24px;`;

    const manualStakeLabel = document.createElement("label");
    manualStakeLabel.textContent = "Manual Stake";
    manualStakeLabel.style.cssText = `
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      color: #374151;
    `;
    manualStakeLabel.setAttribute("for", `betiq-manual-stake-${betId}`);
    manualStakeContainer.appendChild(manualStakeLabel);

    const manualStakeInput = document.createElement("input");
    manualStakeInput.id = `betiq-manual-stake-${betId}`;
    manualStakeInput.type = "number";
    manualStakeInput.placeholder = `Enter stake amount (max: $${stakeAllowed.toFixed(
      2
    )})`;
    manualStakeInput.step = "0.01";
    manualStakeInput.min = "0";
    manualStakeInput.max = stakeAllowed > 0 ? stakeAllowed.toString() : "";
    manualStakeInput.value = stakeUsed > 0 ? stakeUsed.toString() : "";
    manualStakeInput.style.cssText = `
      width: 100%;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      box-sizing: border-box;
    `;
    manualStakeContainer.appendChild(manualStakeInput);
    modal.appendChild(manualStakeContainer);

    // Button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      border: 1px solid #d1d5db;
      background-color: white;
      color: #374151;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.backgroundColor = "#f9fafb";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.backgroundColor = "white";
    });
    cancelBtn.addEventListener("click", () => {
      overlay.remove();
    });
    buttonContainer.appendChild(cancelBtn);

    // Submit button
    const submitBtn = document.createElement("button");
    submitBtn.textContent = "Submit";
    submitBtn.style.cssText = `
      padding: 10px 20px;
      border: none;
      background-color: #3b82f6;
      color: white;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    submitBtn.addEventListener("mouseenter", () => {
      submitBtn.style.backgroundColor = "#2563eb";
    });
    submitBtn.addEventListener("mouseleave", () => {
      submitBtn.style.backgroundColor = "#3b82f6";
    });
    submitBtn.addEventListener("click", () => {
      const stakeValue = parseFloat(manualStakeInput.value);
      if (isNaN(stakeValue) || stakeValue < 0) {
        alert("Please enter a valid stake amount (must be 0 or greater)");
        return;
      }
      if (stakeAllowed > 0 && stakeValue > stakeAllowed) {
        alert(
          `Stake cannot exceed the maximum allowed: $${stakeAllowed.toFixed(2)}`
        );
        return;
      }

      // Save stake usage
      if (window.betIQ && window.betIQ.setStakeUsed) {
        window.betIQ.setStakeUsed(betId, stakeValue);
      }

      console.log(
        `[betIQ-Plugin] Stake updated for ${betId}: $${stakeValue.toFixed(2)}`
      );
      if (window.betIQ.showNotification) {
        window.betIQ.showNotification(
          `Stake updated: $${stakeValue.toFixed(2)} / $${stakeAllowed.toFixed(
            2
          )}`
        );
      }
      overlay.remove();
    });
    buttonContainer.appendChild(submitBtn);
    modal.appendChild(buttonContainer);

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  };
})();
