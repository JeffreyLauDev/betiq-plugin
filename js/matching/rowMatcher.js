// Row matching logic for matching table rows with API data
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

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
   * Match a table row with API data
   * Required fields: Game, Player, Prop
   * Optional fields: Game Time, Bet Type, Confidence
   */
  window.betIQ.matchRowWithData = function (row, apiData) {
    const extractCellText = window.betIQ.extractCellText;
    const normalizeText = window.betIQ.normalizeText;
    const normalizeGameTime = window.betIQ.normalizeGameTime;
    const normalizeAPIGameTime = window.betIQ.normalizeAPIGameTime;
    const getAPIBetType = window.betIQ.getAPIBetType;
    const extractConfidence = window.betIQ.extractConfidence;

    const cells = row.querySelectorAll("td");
    if (cells.length < 9) return null;

    // Extract required fields from table row
    const gameText = normalizeText(extractCellText(cells[3]));
    const gameTimeText = normalizeGameTime(extractCellText(cells[4]));
    const playerText = normalizeText(extractCellText(cells[5]));
    const betTypeText = normalizeText(extractCellText(cells[6]));
    const propText = normalizeText(extractCellText(cells[8]));

    // Confidence column
    let confidenceNum = null;
    if (cells.length > 18) {
      const confidenceText = extractCellText(cells[18]);
      confidenceNum = extractConfidence(confidenceText);
    }

    // Game, Player, and Prop must be present
    if (!gameText || !playerText || !propText) {
      return null;
    }

    // Try to match with API data
    for (const bet of apiData) {
      // Extract and normalize API fields
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

      // Required fields must match
      if (
        apiGame !== gameText ||
        apiPlayer !== playerText ||
        apiProp !== propText
      ) {
        continue;
      }

      // Game Time matching (handle formats with/without seconds)
      if (gameTimeText && apiGameTime) {
        const normalizedTableTime = normalizeTime(gameTimeText);
        const normalizedAPITime = normalizeTime(apiGameTime);
        if (normalizedAPITime !== normalizedTableTime) {
          continue;
        }
      }

      // Bet Type matching
      if (betTypeText && apiBetType) {
        if (apiBetType !== betTypeText) {
          continue;
        }
      }

      // Confidence matching (within tolerance)
      if (confidenceNum !== null && apiConfidence !== null) {
        if (Math.abs(confidenceNum - apiConfidence) >= 0.01) {
          continue;
        }
      }

      // All fields match
      return bet;
    }

    return null;
  };
})();
