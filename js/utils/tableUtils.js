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
   * Normalize text for comparison (lowercase, trim)
   */
  window.betIQ.normalizeText = function (text) {
    return (text || "").toLowerCase().trim();
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
})();

