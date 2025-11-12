// Stake popup modal UI
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  /**
   * Show stake popup modal for a specific bet ID
   */
  window.betIQ.showStakePopup = function (betId, row) {
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
    stakeUsedDisplay.textContent = `$${stakeUsed.toFixed(2)} / $${stakeAllowed.toFixed(2)}`;
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
        fillColor = "#22c55e";
      } else if (percentage < 80) {
        fillColor = "#eab308";
      } else {
        fillColor = "#ef4444";
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
    manualStakeInput.placeholder = `Enter stake amount (max: $${stakeAllowed.toFixed(2)})`;
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

      if (window.betIQ && window.betIQ.setStakeUsed) {
        window.betIQ.setStakeUsed(betId, stakeValue);
      }

      if (window.betIQ.showNotification) {
        window.betIQ.showNotification(
          `Stake updated: $${stakeValue.toFixed(2)} / $${stakeAllowed.toFixed(2)}`
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

