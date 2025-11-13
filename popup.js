// Popup script for login/logout UI
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    // Set Supabase credentials (TO BE CONFIGURED BY USER)
    // These should be set before auth module loads
    if (!window.betIQ) {
      window.betIQ = {};
    }

    // TODO: User needs to set these values
    // window.betIQ.supabaseUrl = "https://xxxxx.supabase.co";
    // window.betIQ.supabaseAnonKey = "your-anon-key-here";

    // Check for OAuth callback first
    handleOAuthCallbackIfPresent();

    // Initialize auth
    if (window.betIQ.auth && window.betIQ.auth.init) {
      window.betIQ.auth.init().then(() => {
        updateUI();
      });
    } else {
      // Wait a bit for scripts to load
      setTimeout(() => {
        if (window.betIQ.auth && window.betIQ.auth.init) {
          window.betIQ.auth.init().then(() => {
            updateUI();
          });
        } else {
          showError("Auth module not loaded. Please check console for errors.");
        }
      }, 100);
    }

    // Setup form handlers
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", handleLogin);
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", handleLogout);
    }
  }

  /**
   * Handle OAuth callback if present in URL
   */
  async function handleOAuthCallbackIfPresent() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const error = urlParams.get("error");

    if (code || error) {
      // Wait for auth module to be ready
      const checkAuth = setInterval(() => {
        if (window.betIQ.auth && window.betIQ.auth.handleOAuthCallback) {
          clearInterval(checkAuth);
          window.betIQ.auth.handleOAuthCallback().then((result) => {
            if (result && result.error) {
              showError(
                result.errorDescription || result.error || "OAuth authentication failed"
              );
            } else if (result && result.session) {
              showSuccess("Successfully authenticated!");
              updateUI();
              // Clean up URL
              setTimeout(() => {
                window.history.replaceState({}, document.title, window.location.pathname);
              }, 1000);
            }
          });
        }
      }, 50);

      // Stop checking after 5 seconds
      setTimeout(() => clearInterval(checkAuth), 5000);
    }
  }

  /**
   * Update UI based on auth state
   */
  function updateUI() {
    const isLoggedIn = window.betIQ.auth?.isLoggedIn() || false;
    const loginSection = document.getElementById("loginSection");
    const loggedInSection = document.getElementById("loggedInSection");
    const syncIndicator = document.getElementById("syncIndicator");
    const syncStatusText = document.getElementById("syncStatusText");

    if (isLoggedIn) {
      // Show logged in section
      if (loginSection) loginSection.classList.remove("active");
      if (loggedInSection) loggedInSection.classList.add("active");

      // Update sync status
      if (syncIndicator) {
        syncIndicator.classList.remove("disconnected");
      }
      if (syncStatusText) {
        syncStatusText.textContent = "Synced";
      }
    } else {
      // Show login section
      if (loginSection) loginSection.classList.add("active");
      if (loggedInSection) loggedInSection.classList.remove("active");
    }
  }

  /**
   * Handle login form submission
   */
  async function handleLogin(e) {
    e.preventDefault();

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const loginBtn = document.getElementById("loginBtn");

    if (!emailInput || !passwordInput || !loginBtn) {
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError("Please enter both email and password");
      return;
    }

    // Disable button and show loading
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="loading"></span> Logging in...';
    hideError();
    hideSuccess();

    try {
      if (!window.betIQ.auth || !window.betIQ.auth.login) {
        throw new Error("Auth module not available");
      }

      await window.betIQ.auth.login(email, password);
      showSuccess("Login successful!");
      updateUI();

      // Close popup after successful login (optional)
      setTimeout(() => {
        window.close();
      }, 1000);
    } catch (error) {
      console.error("[betIQ-Plugin] Login error:", error);
      showError(error.message || "Login failed. Please check your credentials.");
      loginBtn.disabled = false;
      loginBtn.textContent = "Login";
    }
  }

  /**
   * Handle logout
   */
  async function handleLogout() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.disabled = true;
      logoutBtn.textContent = "Logging out...";
    }

    try {
      if (!window.betIQ.auth || !window.betIQ.auth.logout) {
        throw new Error("Auth module not available");
      }

      await window.betIQ.auth.logout();
      updateUI();
      hideError();
      hideSuccess();
    } catch (error) {
      console.error("[betIQ-Plugin] Logout error:", error);
      showError("Logout failed. Please try again.");
    } finally {
      if (logoutBtn) {
        logoutBtn.disabled = false;
        logoutBtn.textContent = "Logout";
      }
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    const errorEl = document.getElementById("errorMessage");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("show");
    }
  }

  /**
   * Hide error message
   */
  function hideError() {
    const errorEl = document.getElementById("errorMessage");
    if (errorEl) {
      errorEl.classList.remove("show");
    }
  }

  /**
   * Show success message
   */
  function showSuccess(message) {
    const successEl = document.getElementById("successMessage");
    if (successEl) {
      successEl.textContent = message;
      successEl.classList.add("show");
    }
  }

  /**
   * Hide success message
   */
  function hideSuccess() {
    const successEl = document.getElementById("successMessage");
    if (successEl) {
      successEl.classList.remove("show");
    }
  }
})();

