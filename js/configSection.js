// Configuration section UI for bankroll and Kelly fraction
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  /**
   * Add configuration section for bankroll and kelly fraction
   * Shows when user is logged in, or when skipAuthForColumnInject is true (e.g. www.bet-iq.app)
   */
  window.betIQ.addConfigurationSection = function () {
    const config = window.betIQ.getSiteConfig && window.betIQ.getSiteConfig();
    const skipAuth = config && config.skipAuthForColumnInject === true;
    const isLoggedIn = window.betIQ.auth?.isLoggedIn();
    if (!skipAuth && !isLoggedIn) {
      const existingSection = document.getElementById("betiq-config-section");
      if (existingSection) {
        existingSection.remove();
      }
      return;
    }

    // Check if section already exists
    if (document.getElementById("betiq-config-section")) {
      return;
    }

    // Inject Tailwind CSS
    window.betIQ.injectTailwind();

    // Find target element from site config, with fallback
    const selector = config && config.configSectionSelector;
    let targetElement = selector ? document.querySelector(selector) : null;
    let insertBeforeTable = false;
    let tableOrContainer = null;
    if (!targetElement) {
      // Fallback: insert before the table/container or at start of main/body
      tableOrContainer =
        window.betIQ.getTableOrContainer && window.betIQ.getTableOrContainer();
      if (tableOrContainer && tableOrContainer.parentNode) {
        targetElement = tableOrContainer;
        insertBeforeTable = true;
      } else {
        var fallbackSel =
          (config && config.configSectionFallbackSelector) || "main";
        var fallbackEl = document.querySelector(fallbackSel);
        targetElement = fallbackEl || document.body;
      }
    }
    if (!targetElement) {
      return;
    }

    // Create configuration section
    const configSection = document.createElement("div");
    configSection.id = "betiq-config-section";
    configSection.className = "bg-card border rounded-lg shadow-sm p-3 mb-6";

    // Create title
    const title = document.createElement("h2");
    title.textContent = "Kelly Criterion Configuration";
    title.className = "text-sm font-semibold mb-2";
    configSection.appendChild(title);

    // Create form container
    const formContainer = document.createElement("div");
    formContainer.className = "flex flex-wrap gap-2";
    configSection.appendChild(formContainer);

    // Fixed Bankroll input
    const bankrollContainer = document.createElement("div");
    bankrollContainer.className = "flex flex-col gap-1.5";

    const bankrollLabel = document.createElement("label");
    bankrollLabel.textContent = "Fixed Bankroll";
    bankrollLabel.className = "text-sm font-medium";
    bankrollLabel.setAttribute("for", "betiq-bankroll-input");

    const bankrollInput = document.createElement("input");
    bankrollInput.id = "betiq-bankroll-input";
    bankrollInput.type = "number";
    bankrollInput.placeholder = "Enter total bankroll";
    bankrollInput.step = "0.01";
    bankrollInput.min = "0";
    bankrollInput.className =
      "px-3 py-2 border rounded-md text-sm w-48 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

    bankrollInput.addEventListener("blur", () => {
      const value = bankrollInput.value
        ? parseFloat(bankrollInput.value)
        : null;
      if (window.betIQ.state) {
        window.betIQ.state.set("config.bankroll", value);
        if (window.betIQ.recalculateStakeAmounts) {
          window.betIQ.recalculateStakeAmounts();
        }
        if (window.betIQ.auth?.refreshLoginCache) {
          window.betIQ.auth.refreshLoginCache();
        }
        if (!window.betIQ.auth?.isLoggedIn()) {
          console.warn(
            "[betIQ-Plugin] ⚠️ You are not logged in. Bankroll will not be saved to Supabase. Please log in to enable sync."
          );
        }
      }
    });

    bankrollInput.addEventListener("input", () => {
      if (window.betIQ.state && !window.betIQ._isUpdatingConfigFromState) {
        const value = bankrollInput.value
          ? parseFloat(bankrollInput.value)
          : null;
        window.betIQ.state.set("config.bankroll", value);
        if (window.betIQ.recalculateStakeAmounts) {
          window.betIQ.recalculateStakeAmounts();
        }
      }
    });

    // Load saved value from state (loaded from Supabase)
    if (window.betIQ.state) {
      const bankroll = window.betIQ.state.get("config.bankroll");
      if (bankroll !== null && bankroll !== undefined) {
        bankrollInput.value = bankroll;
      }
    }

    bankrollContainer.appendChild(bankrollLabel);
    bankrollContainer.appendChild(bankrollInput);
    formContainer.appendChild(bankrollContainer);

    // Kelly Fraction input
    const kellyContainer = document.createElement("div");
    kellyContainer.className = "flex flex-col gap-1.5";

    const kellyLabel = document.createElement("label");
    kellyLabel.textContent = "Kelly Fraction";
    kellyLabel.className = "text-sm font-medium";
    kellyLabel.setAttribute("for", "betiq-kelly-input");

    const kellyInput = document.createElement("input");
    kellyInput.id = "betiq-kelly-input";
    kellyInput.type = "number";
    kellyInput.placeholder = "e.g., 0.25 for quarter-Kelly";
    kellyInput.step = "0.01";
    kellyInput.min = "0";
    kellyInput.max = "1";
    kellyInput.className =
      "px-3 py-2 border rounded-md text-sm w-48 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

    kellyInput.addEventListener("blur", () => {
      const value = kellyInput.value ? parseFloat(kellyInput.value) : null;
      if (window.betIQ.state) {
        window.betIQ.state.set("config.kellyFraction", value);
        if (window.betIQ.recalculateStakeAmounts) {
          window.betIQ.recalculateStakeAmounts();
        }
        if (window.betIQ.auth?.refreshLoginCache) {
          window.betIQ.auth.refreshLoginCache();
        }
        if (!window.betIQ.auth?.isLoggedIn()) {
          console.warn(
            "[betIQ-Plugin] ⚠️ You are not logged in. Kelly fraction will not be saved to Supabase. Please log in to enable sync."
          );
        }
      }
    });

    kellyInput.addEventListener("input", () => {
      if (window.betIQ.state && !window.betIQ._isUpdatingConfigFromState) {
        const value = kellyInput.value ? parseFloat(kellyInput.value) : null;
        window.betIQ.state.set("config.kellyFraction", value);
        if (window.betIQ.recalculateStakeAmounts) {
          window.betIQ.recalculateStakeAmounts();
        }
      }
    });

    // Load saved value from state (loaded from Supabase)
    if (window.betIQ.state) {
      const kellyFraction = window.betIQ.state.get("config.kellyFraction");
      if (kellyFraction !== null && kellyFraction !== undefined) {
        kellyInput.value = kellyFraction;
      }
    }

    kellyContainer.appendChild(kellyLabel);
    kellyContainer.appendChild(kellyInput);
    formContainer.appendChild(kellyContainer);

    // Show Plugin Debug checkbox
    const debugContainer = document.createElement("div");
    debugContainer.className = "flex items-center gap-2";

    const debugCheckbox = document.createElement("input");
    debugCheckbox.id = "betiq-debug-checkbox";
    debugCheckbox.type = "checkbox";
    debugCheckbox.className =
      "w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500";

    const debugLabel = document.createElement("label");
    debugLabel.textContent = "Show Plugin Debug";
    debugLabel.className = "text-sm font-medium cursor-pointer";
    debugLabel.setAttribute("for", "betiq-debug-checkbox");

    // Load saved debug state from state
    if (window.betIQ.state) {
      const debugEnabled = window.betIQ.state.get("config.debugEnabled");
      debugCheckbox.checked = debugEnabled !== false; // Default to true
    } else {
      // Fallback to localStorage
      const savedDebugState = localStorage.getItem("betiq-debug-enabled");
      if (savedDebugState === null || savedDebugState === "true") {
        debugCheckbox.checked = true;
        window.betiqDebugEnabled = true;
        localStorage.setItem("betiq-debug-enabled", "true");
      } else if (savedDebugState === "false") {
        debugCheckbox.checked = false;
        window.betiqDebugEnabled = false;
      }
    }

    debugCheckbox.addEventListener("change", (e) => {
      const enabled = e.target.checked;
      if (window.betIQ.state) {
        window.betIQ.state.set("config.debugEnabled", enabled);
      } else {
        // Fallback to localStorage
        localStorage.setItem("betiq-debug-enabled", enabled.toString());
        window.betiqDebugEnabled = enabled;
      }

      if (enabled) {
        console.log("[betIQ-Plugin] Debug mode enabled");
      } else {
        console.log("[betIQ-Plugin] Debug mode disabled");
      }
    });

    // Subscribe to state changes to sync UI
    if (window.betIQ.state) {
      // Flag to prevent input events when updating from state
      let isUpdatingFromState = false;

      // Function to update inputs from state
      const updateInputsFromState = () => {
        // Set global flag to prevent input events from triggering state updates
        window.betIQ._isUpdatingConfigFromState = true;

        const bankroll = window.betIQ.state.get("config.bankroll");
        const kellyFraction = window.betIQ.state.get("config.kellyFraction");
        const debugEnabled = window.betIQ.state.get("config.debugEnabled");

        // Update bankroll input
        if (bankroll !== null && bankroll !== undefined) {
          const currentBankroll = bankrollInput.value
            ? parseFloat(bankrollInput.value)
            : null;
          if (currentBankroll !== bankroll) {
            bankrollInput.value = bankroll;
          }
        } else if (bankrollInput.value !== "") {
          bankrollInput.value = "";
        }

        // Update kelly fraction input
        if (kellyFraction !== null && kellyFraction !== undefined) {
          const currentKelly = kellyInput.value
            ? parseFloat(kellyInput.value)
            : null;
          if (currentKelly !== kellyFraction) {
            kellyInput.value = kellyFraction;
          }
        } else if (kellyInput.value !== "") {
          kellyInput.value = "";
        }

        // Update debug checkbox
        if (debugEnabled !== undefined) {
          debugCheckbox.checked = debugEnabled !== false;
        }

        // Reset flag after a short delay to allow any events to process
        setTimeout(() => {
          window.betIQ._isUpdatingConfigFromState = false;
        }, 0);
      };

      // Initial update
      updateInputsFromState();

      // Subscribe to state changes
      window.betIQ.state.subscribe(
        (state, changedKeys, newValue, oldValue, options) => {
          // Only update UI if change came from remote (to avoid loops with local changes)
          // Local changes (from user typing) will update state, and we don't need to update the input
          // since the user is already typing in it
          if (options?.fromRemote) {
            updateInputsFromState();
          }
        }
      );
    }

    debugContainer.appendChild(debugCheckbox);
    debugContainer.appendChild(debugLabel);
    formContainer.appendChild(debugContainer);

    // Insert: before table (outside table), or after target element (from selector), or append to main/body
    if (insertBeforeTable && tableOrContainer && tableOrContainer.parentNode) {
      const tableElement =
        tableOrContainer.tagName === "TABLE"
          ? tableOrContainer
          : (tableOrContainer.closest && tableOrContainer.closest("table")) ||
            tableOrContainer.parentNode;
      if (tableElement && tableElement.parentNode) {
        tableElement.parentNode.insertBefore(configSection, tableElement);
      } else {
        tableOrContainer.parentNode.insertBefore(
          configSection,
          tableOrContainer
        );
      }
    } else if (selector && targetElement.parentNode) {
      if (targetElement.nextSibling) {
        targetElement.parentNode.insertBefore(
          configSection,
          targetElement.nextSibling
        );
      } else {
        targetElement.parentNode.appendChild(configSection);
      }
    } else {
      targetElement.appendChild(configSection);
    }
  };

  // Debounced version for configuration section
  window.betIQ.debouncedAddConfigSection = window.betIQ.debounce(
    window.betIQ.addConfigurationSection,
    100
  );
})();
