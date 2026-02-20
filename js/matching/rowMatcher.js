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
    const col =
      window.betIQ.getSiteConfig && window.betIQ.getSiteConfig().columnIndices
        ? window.betIQ.getSiteConfig().columnIndices
        : {
            game: 3,
            gameTime: 4,
            player: 5,
            betType: 6,
            prop: 8,
            confidence: 18,
            bookieIndices: [0, 1, 2, 7, 9, 10, 11, 12],
          };
    const minCells =
      Math.max(
        col.game || 0,
        col.gameTime || 0,
        col.player || 0,
        col.betType || 0,
        col.prop || 0,
        col.confidence != null ? col.confidence : 0,
        ...(col.bookieIndices || [])
      ) + 1;
    if (cells.length < minCells) {
      return null;
    }

    // Extract required fields from table row
    const gameText = normalizeText(extractCellText(cells[col.game]));
    const gameTimeText = normalizeGameTime(
      extractCellText(cells[col.gameTime])
    );
    const playerText = normalizeText(extractCellText(cells[col.player]));
    const betTypeText = normalizeText(extractCellText(cells[col.betType]));
    const propText = normalizeText(extractCellText(cells[col.prop]));

    // Try to extract bookie from table (common indices from site config)
    let tableBookie = null;
    const commonBookies = [
      "sportsbet",
      "tab",
      "bet365",
      "kambi",
      "pointsbet",
      "unibet",
      "dabble",
      "neds",
      "ladbrokes",
      "betr",
    ];
    const possibleBookieIndices = col.bookieIndices || [
      0, 1, 2, 7, 9, 10, 11, 12,
    ];

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
    const confidenceIdx = col.confidence != null ? col.confidence : 18;
    if (cells.length > confidenceIdx) {
      const confidenceText = extractCellText(cells[confidenceIdx]);
      confidenceNum = extractConfidence(confidenceText);
    }

    // Game and Prop must be present; Player may be empty for game/team totals
    if (!gameText || !propText) {
      return null;
    }

    // Try to match with API data
    var passedGamePlayerProp = 0,
      rejectedBetType = 0,
      rejectedBookie = 0;
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
      const apiLine = normalizeText(String(bet.line ?? bet.line_value ?? ""));
      const apiDirection = normalizeText(String(bet.direction ?? ""));
      const apiPropWithLine = [apiDirection, apiLine]
        .filter(Boolean)
        .join(" ")
        .trim();
      const apiPropMatch =
        propText === apiProp ||
        propText === apiPropWithLine ||
        (apiPropWithLine && propText.includes(apiPropWithLine)) ||
        (apiProp && propText.includes(apiProp));
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
      // Prop can match exactly or via API direction+line (e.g. "under 18.5")
      if (apiGame !== gameText || apiPlayer !== playerText || !apiPropMatch) {
        continue;
      }
      passedGamePlayerProp++;

      // Bet Type matching (REQUIRED - prevents false duplicates)
      // Allow table "Pts+Rebs ALT" to match API "Pts+Rebs"; exact match or table contains API (e.g. stat type + " ALT")
      if (betTypeText && apiBetType) {
        const betTypeMatch =
          apiBetType === betTypeText ||
          betTypeText.includes(apiBetType) ||
          apiBetType.includes(betTypeText);
        if (!betTypeMatch) {
          rejectedBetType++;
          continue;
        }
      } else if (betTypeText || apiBetType) {
        rejectedBetType++;
        continue;
      }

      // Bookie matching (REQUIRED if both have bookie - prevents false duplicates)
      // Skip bookie requirement when table shows Kambi or Tab: API uses book_id (e.g. 104, 365) so names never match
      var tableBookieNorm = tableBookie ? tableBookie.toLowerCase().trim() : "";
      var skipBookieCheck =
        tableBookieNorm === "kambi" || tableBookieNorm === "tab";
      if (!skipBookieCheck && tableBookie && apiBookie) {
        const bookieMatch =
          apiBookie === tableBookie ||
          tableBookie.includes(apiBookie) ||
          apiBookie.includes(tableBookie);
        if (!bookieMatch) {
          rejectedBookie++;
          continue;
        }
      }
      // If only one has bookie (or Kambi/Tab), we allow match

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
