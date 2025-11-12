// Utility functions for betIQ extension
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  /**
   * Debounce function to avoid excessive re-renders with frequent React updates
   */
  window.betIQ.debounce = function (func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  /**
   * Helper function to create table cells
   */
  window.betIQ.createCell = function (text) {
    const cell = document.createElement("td");
    cell.className = "px-2 py-2 align-middle";
    cell.textContent = text;
    return cell;
  };

  /**
   * Show a temporary notification message
   */
  window.betIQ.showNotification = function (message) {
    // Create a temporary notification element
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      background-color: #10b981;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      font-size: 14px;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    `;

    // Add animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = "slideIn 0.3s ease-out reverse";
      setTimeout(() => {
        notification.remove();
        style.remove();
      }, 300);
    }, 3000);
  };

  /**
   * Inject Tailwind CSS for styling
   */
  window.betIQ.injectTailwind = function () {
    if (document.getElementById("betiq-tailwind")) {
      return;
    }

    const tailwindLink = document.createElement("link");
    tailwindLink.id = "betiq-tailwind";
    tailwindLink.rel = "stylesheet";
    tailwindLink.href =
      "https://cdn.jsdelivr.net/npm/tailwindcss@3.3.6/dist/tailwind.min.css";
    document.head.appendChild(tailwindLink);
  };
})();
