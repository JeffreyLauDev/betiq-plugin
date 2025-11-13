// Snackbar notification system for sync events
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};
  window.betIQ.snackbar = window.betIQ.snackbar || {};

  let snackbarContainer = null;
  let activeSnackbars = [];

  /**
   * Create snackbar container if it doesn't exist
   */
  function ensureContainer() {
    if (!snackbarContainer) {
      snackbarContainer = document.createElement("div");
      snackbarContainer.id = "betiq-snackbar-container";
      snackbarContainer.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10002;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: 500px;
        width: calc(100% - 40px);
      `;
      document.body.appendChild(snackbarContainer);
    }
    return snackbarContainer;
  }

  /**
   * Show a snackbar notification
   * @param {string} message - Message to display
   * @param {Object} options - Options { type: 'info'|'success'|'warning'|'error', duration: number, user: string }
   */
  function show(message, options = {}) {
    const {
      type = "info",
      duration = 5000,
      user = null,
      action = null,
    } = options;

    const container = ensureContainer();
    const snackbar = document.createElement("div");
    const snackbarId = `betiq-snackbar-${Date.now()}-${Math.random()}`;
    snackbar.id = snackbarId;

    // Color scheme based on type
    const colors = {
      info: { bg: "#3b82f6", text: "#ffffff" },
      success: { bg: "#10b981", text: "#ffffff" },
      warning: { bg: "#f59e0b", text: "#ffffff" },
      error: { bg: "#ef4444", text: "#ffffff" },
    };

    const color = colors[type] || colors.info;

    snackbar.style.cssText = `
      background-color: ${color.bg};
      color: ${color.text};
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 14px;
      line-height: 1.5;
      pointer-events: auto;
      animation: slideDownSnackbar 0.3s ease-out;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    `;

    // Add animation if not already added
    if (!document.getElementById("betiq-snackbar-animations")) {
      const style = document.createElement("style");
      style.id = "betiq-snackbar-animations";
      style.textContent = `
        @keyframes slideDownSnackbar {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes slideUpSnackbar {
          from {
            transform: translateY(0);
            opacity: 1;
          }
          to {
            transform: translateY(-100%);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Message content
    const messageContent = document.createElement("div");
    messageContent.style.cssText = `flex: 1;`;

    // User badge if provided
    if (user) {
      const userBadge = document.createElement("span");
      userBadge.style.cssText = `
        font-weight: 600;
        margin-right: 6px;
        opacity: 0.9;
      `;
      userBadge.textContent = `${user}:`;
      messageContent.appendChild(userBadge);
    }

    const messageText = document.createElement("span");
    messageText.textContent = message;
    messageContent.appendChild(messageText);

    snackbar.appendChild(messageContent);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: ${color.text};
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      transition: opacity 0.2s;
      flex-shrink: 0;
    `;
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.opacity = "1";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.opacity = "0.8";
    });
    closeBtn.addEventListener("click", () => {
      remove(snackbarId);
    });
    snackbar.appendChild(closeBtn);

    container.appendChild(snackbar);
    activeSnackbars.push(snackbarId);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        remove(snackbarId);
      }, duration);
    }

    return snackbarId;
  }

  /**
   * Remove a snackbar
   */
  function remove(snackbarId) {
    const snackbar = document.getElementById(snackbarId);
    if (snackbar) {
      snackbar.style.animation = "slideUpSnackbar 0.3s ease-out";
      setTimeout(() => {
        if (snackbar.parentNode) {
          snackbar.parentNode.removeChild(snackbar);
        }
        activeSnackbars = activeSnackbars.filter((id) => id !== snackbarId);
      }, 300);
    }
  }

  /**
   * Remove all snackbars
   */
  function removeAll() {
    activeSnackbars.forEach((id) => remove(id));
  }

  // Expose API
  window.betIQ.snackbar = {
    show,
    remove,
    removeAll,
  };
})();

