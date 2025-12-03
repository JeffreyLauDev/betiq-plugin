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
   *
   * Required fields: Game, Player, Prop, Bet Type
   * Optional but used when available: Bookie (prevents false duplicates)
   * Optional fields: Game Time, Confidence
   *
   * Matching rules:
   * - Bet Type is required to prevent false duplicates (Over vs Under are different bets)
   * - Bookie is required if both table and API have it (same bet from different bookies are different)
   * - Game Time and Confidence are optional and don't block matching
   */
  window.betIQ.matchRowWithData = function (row, apiData) {
    // Check if functions are available
    if (!window.betIQ.extractCellText || !window.betIQ.normalizeText) {
      console.error(
        "[betIQ-Plugin] Required functions not available for matching"
      );
      return null;
    }

    const extractCellText = window.betIQ.extractCellText;
    const normalizeText = window.betIQ.normalizeText;
    const normalizeGameTime = window.betIQ.normalizeGameTime || normalizeText;
    const normalizeAPIGameTime =
      window.betIQ.normalizeAPIGameTime || (() => "");
    const getAPIBetType = window.betIQ.getAPIBetType || (() => "");
    const extractConfidence = window.betIQ.extractConfidence || (() => null);

    const cells = row.querySelectorAll("td");
    if (cells.length < 9) return null;

    // Extract required fields from table row
    const gameText = normalizeText(extractCellText(cells[3]));
    const gameTimeText = normalizeGameTime(extractCellText(cells[4]));
    const playerText = normalizeText(extractCellText(cells[5]));
    const betTypeText = normalizeText(extractCellText(cells[6]));
    const propText = normalizeText(extractCellText(cells[8]));

    // Try to extract bookie from table (common indices: 0, 1, 2, 7, 9, 10, etc.)
    // Bookie is often in early columns or near the game/player columns
    let tableBookie = null;
    const commonBookies = [
      "sportsbet",
      "tab",
      "bet365",
      "pointsbet",
      "unibet",
      "dabble",
      "neds",
      "ladbrokes",
      "betr",
    ];
    const possibleBookieIndices = [0, 1, 2, 7, 9, 10, 11, 12];

    for (const idx of possibleBookieIndices) {
      if (idx >= cells.length) continue;

      const cellText = normalizeText(extractCellText(cells[idx]));
      if (!cellText) continue;

      // Check for known bookie names first (most reliable)
      if (commonBookies.some((bookie) => cellText.includes(bookie))) {
        tableBookie = cellText;
        break;
      }

      // Fallback: if cell text looks like a bookie name (short, mostly letters)
      if (
        !tableBookie &&
        cellText.length >= 2 &&
        cellText.length <= 15 &&
        /^[a-z\s]+$/.test(cellText)
      ) {
        tableBookie = cellText;
      }
    }

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
      const apiBookie = normalizeText(
        bet.bookie || bet.bookmaker || bet.book || ""
      );
      const apiConfidence =
        bet.confidence_score !== undefined && bet.confidence_score !== null
          ? parseFloat(bet.confidence_score)
          : bet.confidence !== undefined && bet.confidence !== null
          ? parseFloat(bet.confidence)
          : null;

      // Required fields must match: Game, Player, Prop, Bet Type
      // Bet Type is required to prevent false duplicates (Over vs Under are different bets)
      if (
        apiGame !== gameText ||
        apiPlayer !== playerText ||
        apiProp !== propText
      ) {
        continue;
      }

      // Bet Type matching (REQUIRED - prevents false duplicates)
      // Over and Under for the same prop are different bets and should match different API records
      if (betTypeText && apiBetType) {
        if (apiBetType !== betTypeText) {
          continue; // Reject if bet type doesn't match
        }
      } else if (betTypeText || apiBetType) {
        // If one has bet type but the other doesn't, reject to be safe
        continue;
      }

      // Bookie matching (REQUIRED if both have bookie - prevents false duplicates)
      // Same bet from different bookies should match different API records
      if (tableBookie && apiBookie) {
        if (apiBookie !== tableBookie) {
          continue; // Reject if bookie doesn't match
        }
      }
      // If only one has bookie, we still allow match (bookie might not be in table or API)

      // Game Time matching (optional - if required fields match, we accept even if game time differs)
      // We check it but don't reject matches based on it
      if (gameTimeText && apiGameTime) {
        // Use flexible comparison that handles MM/DD vs DD/MM format differences
        // But don't reject if it doesn't match - it's optional
        if (window.betIQ && window.betIQ.compareGameTimes) {
          // compareGameTimes handles the comparison, but we don't use the result to reject
          window.betIQ.compareGameTimes(gameTimeText, apiGameTime);
        }
        // Game time differences could be due to format, timezone, or display differences
        // We don't reject matches based on game time
      }

      // All required fields match: Game, Player, Prop, Bet Type
      // Bookie matches if both have it (prevents false duplicates)
      // Optional fields (gameTime, confidence) are checked but don't block matching
      return bet;
    }

    return null;
  };
})();
