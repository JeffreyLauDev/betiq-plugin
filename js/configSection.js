// Configuration section UI for bankroll and Kelly fraction
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Create global namespace if it doesn't exist
  window.betIQ = window.betIQ || {};

  /**
   * Add configuration section for bankroll and kelly fraction
   */
  window.betIQ.addConfigurationSection = function () {
    // Check if section already exists
    if (document.getElementById("betiq-config-section")) {
      return;
    }

    // Inject Tailwind CSS
    window.betIQ.injectTailwind();

    // Find target element: main > main > div > div:nth-child(2)
    const targetElement = document.querySelector(
      "main > main > div > div:nth-child(2)"
    );
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
      // Update state (will trigger effects and persist to localStorage)
      const value = bankrollInput.value
        ? parseFloat(bankrollInput.value)
        : null;
      if (window.betIQ.state) {
        window.betIQ.state.set("config.bankroll", value);
      } else {
        // Fallback to localStorage if state not initialized
        if (bankrollInput.value) {
          localStorage.setItem("betiq-bankroll", bankrollInput.value);
        }
      }
    });

    bankrollInput.addEventListener("input", () => {
      // Update state on input for real-time updates
      const value = bankrollInput.value
        ? parseFloat(bankrollInput.value)
        : null;
      if (window.betIQ.state) {
        window.betIQ.state.set("config.bankroll", value);
      }
    });

    // Load saved value from state
    if (window.betIQ.state) {
      const bankroll = window.betIQ.state.get("config.bankroll");
      if (bankroll !== null && bankroll !== undefined) {
        bankrollInput.value = bankroll;
      }
    } else {
      // Fallback to localStorage
      const savedBankroll = localStorage.getItem("betiq-bankroll");
      if (savedBankroll) {
        bankrollInput.value = savedBankroll;
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
      // Update state (will trigger effects and persist to localStorage)
      const value = kellyInput.value ? parseFloat(kellyInput.value) : null;
      if (window.betIQ.state) {
        window.betIQ.state.set("config.kellyFraction", value);
      } else {
        // Fallback to localStorage if state not initialized
        if (kellyInput.value) {
          localStorage.setItem("betiq-kelly-fraction", kellyInput.value);
        }
      }
    });

    kellyInput.addEventListener("input", () => {
      // Update state on input for real-time updates
      const value = kellyInput.value ? parseFloat(kellyInput.value) : null;
      if (window.betIQ.state) {
        window.betIQ.state.set("config.kellyFraction", value);
      }
    });

    // Load saved value from state
    if (window.betIQ.state) {
      const kellyFraction = window.betIQ.state.get("config.kellyFraction");
      if (kellyFraction !== null && kellyFraction !== undefined) {
        kellyInput.value = kellyFraction;
      }
    } else {
      // Fallback to localStorage
      const savedKelly = localStorage.getItem("betiq-kelly-fraction");
      if (savedKelly) {
        kellyInput.value = savedKelly;
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
      window.betIQ.state.subscribe((state, changedKeys, newValue, oldValue) => {
        // Sync UI when state changes externally
        // changedKeys can be a single key (string) or array of keys
        const keys = Array.isArray(changedKeys) ? changedKeys : [changedKeys];

        keys.forEach((key) => {
          if (key === "config.bankroll" || key === "bankroll") {
            const value = state.config?.bankroll ?? state.bankroll;
            const currentValue = bankrollInput.value
              ? parseFloat(bankrollInput.value)
              : null;
            if (currentValue !== value) {
              bankrollInput.value =
                value !== null && value !== undefined ? value : "";
            }
          }
          if (key === "config.kellyFraction" || key === "kellyFraction") {
            const value = state.config?.kellyFraction ?? state.kellyFraction;
            const currentValue = kellyInput.value
              ? parseFloat(kellyInput.value)
              : null;
            if (currentValue !== value) {
              kellyInput.value =
                value !== null && value !== undefined ? value : "";
            }
          }
          if (key === "config.debugEnabled" || key === "debugEnabled") {
            const value = state.config?.debugEnabled ?? state.debugEnabled;
            debugCheckbox.checked = value !== false;
          }
        });
      });
    }

    debugContainer.appendChild(debugCheckbox);
    debugContainer.appendChild(debugLabel);
    formContainer.appendChild(debugContainer);

    // Insert after target element
    if (targetElement.nextSibling) {
      targetElement.parentNode.insertBefore(
        configSection,
        targetElement.nextSibling
      );
    } else {
      targetElement.parentNode.appendChild(configSection);
    }
  };

  // Debounced version for configuration section
  window.betIQ.debouncedAddConfigSection = window.betIQ.debounce(
    window.betIQ.addConfigurationSection,
    100
  );
})();
