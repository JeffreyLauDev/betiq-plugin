// Table utility functions for text extraction and normalization
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  /**
   * Extract text content from a cell, handling nested elements
   */
  window.betIQ.extractCellText = function (cell) {
    if (!cell) return "";
    return cell.innerText || cell.textContent || "";
  };

  /**
   * Extract numeric value from text (for line, odds)
   */
  window.betIQ.extractNumber = function (text) {
    if (!text) return null;
    const match = text.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  };

  /**
   * Normalize text for comparison (lowercase, trim, collapse whitespace/newlines)
   */
  window.betIQ.normalizeText = function (text) {
    return (text || "").toLowerCase().trim().replace(/\s+/g, " ");
  };

  /**
   * Normalize game time for comparison (handle different formats)
   */
  window.betIQ.normalizeGameTime = function (gameTimeText) {
    if (!gameTimeText) return "";
    return window.betIQ.normalizeText(gameTimeText);
  };

  /**
   * Normalize game time from API (handle different formats)
   */
  window.betIQ.normalizeAPIGameTime = function (apiBet) {
    const normalizeText = window.betIQ.normalizeText;

    // Try game_datetime first (betting_alerts endpoint format: "13/11 14:00")
    if (apiBet.game_datetime) {
      const gameTime = apiBet.game_datetime;
      if (typeof gameTime === "string") {
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
            // Format as MM/DD HH:MM:SS
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
          return normalizeText(gameTime);
        }
      }
      return normalizeText(gameTime);
    }

    return "";
  };

  /**
   * Get bet type from API data
   */
  window.betIQ.getAPIBetType = function (bet) {
    const normalizeText = window.betIQ.normalizeText;

    if (bet.bet_type) {
      return normalizeText(bet.bet_type);
    }
    if (bet.type) {
      return normalizeText(bet.type);
    }
    if (bet.direction) {
      return normalizeText(bet.direction);
    }

    return "";
  };

  /**
   * Extract numeric value from confidence text
   */
  window.betIQ.extractConfidence = function (text) {
    if (!text) return null;
    const match = text.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  };

  /**
   * Normalize date format - handles both MM/DD and DD/MM formats
   * Returns both interpretations for comparison
   */
  function normalizeDateFormat(dateStr) {
    if (!dateStr || !dateStr.includes("/")) return dateStr;

    const parts = dateStr.split("/");
    if (parts.length !== 2) return dateStr;

    const [part1, part2] = parts;
    const num1 = parseInt(part1, 10);
    const num2 = parseInt(part2, 10);

    // If both parts are valid numbers, return both format interpretations
    if (!isNaN(num1) && !isNaN(num2)) {
      return {
        mmdd: `${String(num1).padStart(2, "0")}/${String(num2).padStart(
          2,
          "0"
        )}`,
        ddmm: `${String(num2).padStart(2, "0")}/${String(num1).padStart(
          2,
          "0"
        )}`,
      };
    }

    return dateStr;
  }

  /**
   * Normalize time by removing seconds if present
   */
  function normalizeTime(timeStr) {
    const parts = timeStr.split(" ");
    if (parts.length < 2) return timeStr;

    const datePart = parts[0];
    const timePart = parts[1];

    // If time part has 2 colons (HH:MM:SS), remove seconds
    if ((timePart.match(/:/g) || []).length === 2) {
      const timeWithoutSeconds = timePart.replace(/:\d{2}$/, "");
      return `${datePart} ${timeWithoutSeconds}`;
    }

    return timeStr;
  }

  /**
   * Compare two game time strings, handling date format differences (MM/DD vs DD/MM)
   * Returns true if times match (accounting for format differences)
   */
  window.betIQ.compareGameTimes = function (time1, time2) {
    if (!time1 || !time2) return false;

    const normalized1 = normalizeTime(time1.trim());
    const normalized2 = normalizeTime(time2.trim());

    // Exact match
    if (normalized1 === normalized2) return true;

    // Try date format conversion
    const parts1 = normalized1.split(" ");
    const parts2 = normalized2.split(" ");

    if (parts1.length === 2 && parts2.length === 2) {
      const date1 = normalizeDateFormat(parts1[0]);
      const date2 = normalizeDateFormat(parts2[0]);
      const time1 = parts1[1];
      const time2 = parts2[1];

      // Times must match
      if (time1 !== time2) return false;

      // Try both date format interpretations
      if (typeof date1 === "object" && typeof date2 === "object") {
        // Check if any combination matches (MM/DD vs DD/MM)
        return (
          date1.mmdd === date2.mmdd ||
          date1.mmdd === date2.ddmm ||
          date1.ddmm === date2.mmdd ||
          date1.ddmm === date2.ddmm
        );
      }

      // If one is object and one is string, try matching
      if (typeof date1 === "object") {
        return date1.mmdd === date2 || date1.ddmm === date2;
      }
      if (typeof date2 === "object") {
        return date1 === date2.mmdd || date1 === date2.ddmm;
      }
    }

    return false;
  };
})();
