// Error notification UI
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  /**
   * Show error notification for row identifier issues
   */
  window.betIQ.showRowIdError = function (message) {
    const existingError = document.getElementById("betiq-duplicate-id-error");
    if (existingError) {
      existingError.remove();
    }

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
  };
})();

