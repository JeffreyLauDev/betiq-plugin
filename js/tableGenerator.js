// Main table generator - matches rows with API data and assigns IDs
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  /**
   * Validate selectors and table structure - detects website changes
   * Returns diagnostic information about selector mismatches
   */
  window.betIQ.validateSelectors = function () {
    var config =
      (window.betIQ.getSiteConfig && window.betIQ.getSiteConfig()) || {};
    var headerCellSel = config.headerCellSelector || "th";
    var dataCellSel = config.dataCellSelector || "td";
    var rowCellSel = config.rowCellSelector || "td, th";
    var tbodySel = config.tbodySelector || "tbody";
    var theadSel = config.theadSelector || "thead";

    const diagnostics = {
      isValid: true,
      errors: [],
      warnings: [],
      tableStructure: {},
      cellIndices: {},
      sampleRow: null,
    };

    // Check if table/container exists
    const tables =
      (window.betIQ.getAllTablesOrContainers &&
        window.betIQ.getAllTablesOrContainers()) ||
      [];
    if (tables.length === 0) {
      diagnostics.isValid = false;
      diagnostics.errors.push("❌ No table found on page");
      return diagnostics;
    }

    diagnostics.tableStructure.tableCount = tables.length;

    // If multiple tables, analyze all of them
    if (tables.length > 1) {
      diagnostics.warnings.push(
        `⚠️ Found ${tables.length} tables on page - analyzing first one`
      );
      diagnostics.tableStructure.allTables = Array.from(tables).map(
        (tbl, idx) => {
          const rows = window.betIQ.getDataRows(tbl);
          const rowArr = Array.isArray(rows) ? rows : Array.from(rows);
          const dataRows = rowArr.filter((row) => {
            const hasTh = row.querySelectorAll(headerCellSel).length > 0;
            const hasTd = row.querySelectorAll(dataCellSel).length > 0;
            return hasTd && !hasTh;
          });
          return {
            index: idx,
            id: tbl.id || "",
            className: tbl.className || "",
            totalRows: rowArr.length,
            dataRows: dataRows.length,
            firstRowCellCount:
              dataRows.length > 0
                ? dataRows[0].querySelectorAll(dataCellSel).length
                : 0,
          };
        }
      );
    }

    const table = tables[0];
    diagnostics.tableStructure.analyzedTable = {
      id: table.id || "",
      className: table.className || "",
      hasTbody: !!table.querySelector && table.querySelector(tbodySel),
      hasThead: !!table.querySelector && table.querySelector(theadSel),
    };

    // Check for data rows - filter out header rows and rows with insufficient cells
    const allRows = Array.from(window.betIQ.getDataRows(table));

    const dataRows = allRows.filter((row) => {
      const hasTh = row.querySelectorAll(headerCellSel).length > 0;
      const hasTd = row.querySelectorAll(dataCellSel).length > 0;
      const cellCount = row.querySelectorAll(dataCellSel).length;
      // Filter out header rows and rows with too few cells (likely not data rows)
      var minCells = window.betIQ.getMinDataRowCells
        ? window.betIQ.getMinDataRowCells()
        : 9;
      return hasTd && !hasTh && cellCount >= minCells;
    });

    // Also track rows with insufficient cells for diagnostics
    const invalidRows = allRows.filter((row) => {
      const hasTh = row.querySelectorAll(headerCellSel).length > 0;
      const hasTd = row.querySelectorAll(dataCellSel).length > 0;
      const cellCount = row.querySelectorAll(dataCellSel).length;
      var minCells = window.betIQ.getMinDataRowCells
        ? window.betIQ.getMinDataRowCells()
        : 9;
      return hasTd && !hasTh && cellCount > 0 && cellCount < minCells;
    });

    var minCells = window.betIQ.getMinDataRowCells
      ? window.betIQ.getMinDataRowCells()
      : 9;
    if (dataRows.length === 0) {
      diagnostics.isValid = false;
      diagnostics.errors.push(
        "❌ No valid data rows found in table (need at least " +
          minCells +
          " cells)"
      );
      if (invalidRows.length > 0) {
        diagnostics.warnings.push(
          "⚠️ Found " +
            invalidRows.length +
            " row(s) with insufficient cells (< " +
            minCells +
            " cells) - these may be spacer/empty rows"
        );
      }
      return diagnostics;
    }

    if (invalidRows.length > 0) {
      diagnostics.warnings.push(
        "⚠️ Found " +
          invalidRows.length +
          " row(s) with insufficient cells (< " +
          minCells +
          " cells) - these are being skipped"
      );
    }

    diagnostics.tableStructure.dataRowCount = dataRows.length;
    diagnostics.tableStructure.invalidRowCount = invalidRows.length;

    // Use first valid row as sample
    const sampleRow = dataRows[0];
    diagnostics.sampleRow = sampleRow;

    // Get detailed info about all rows to understand structure
    diagnostics.tableStructure.allRowsInfo = [];
    dataRows.slice(0, 5).forEach((row, idx) => {
      const rowCells = row.querySelectorAll(dataCellSel);
      const rowThs = row.querySelectorAll(headerCellSel);
      const allCells = Array.from(rowCells).map((cell, i) => ({
        index: i,
        tag: cell.tagName,
        text: (cell.textContent || "").trim().substring(0, 50),
        className: cell.className || "",
        attributes: Array.from(cell.attributes)
          .map((attr) => `${attr.name}="${attr.value}"`)
          .join(" "),
      }));

      diagnostics.tableStructure.allRowsInfo.push({
        rowIndex: idx,
        tdCount: rowCells.length,
        thCount: rowThs.length,
        cells: allCells,
        rowHTML: row.outerHTML.substring(0, 200), // First 200 chars of HTML
      });
    });

    // Validate cell indices
    const cells = sampleRow.querySelectorAll(dataCellSel);
    const cellCount = cells.length;
    diagnostics.cellIndices.actualCount = cellCount;

    // Log all cells found in sample row for debugging
    diagnostics.cellIndices.allCells = Array.from(cells).map((cell, i) => ({
      index: i,
      text: (cell.textContent || "").trim().substring(0, 100),
      tag: cell.tagName,
      className: cell.className || "",
    }));

    // Also check table headers to understand column structure
    var headerRowSel = config.headerRowSelector;
    var rootForHeader =
      table.tagName === "TABLE" ? table : table.parentElement || table;
    var headerSel = headerRowSel;
    const headerRow =
      rootForHeader && headerSel
        ? rootForHeader.querySelector(headerSel)
        : null;
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll(rowCellSel);
      diagnostics.tableStructure.headers = Array.from(headerCells).map(
        (cell, i) => ({
          index: i,
          text: (cell.textContent || "").trim(),
        })
      );
    }

    // Expected cell indices from site config (so 13-column tables don't warn about index 18)
    var col = config.columnIndices || {
      game: 3,
      gameTime: 4,
      player: 5,
      betType: 6,
      prop: 8,
      confidence: 18,
    };
    const expectedCells = {
      [col.game]: { name: "Game", required: true },
      [col.gameTime]: { name: "Game Time", required: false },
      [col.player]: { name: "Player", required: true },
      [col.betType]: { name: "Bet Type", required: false },
      [col.prop]: { name: "Prop", required: true },
    };
    if (col.confidence != null) {
      expectedCells[col.confidence] = { name: "Confidence", required: false };
    }

    diagnostics.cellIndices.expected = expectedCells;
    diagnostics.cellIndices.missing = [];
    diagnostics.cellIndices.found = {};

    // Check each expected cell
    Object.keys(expectedCells).forEach((indexStr) => {
      const index = parseInt(indexStr, 10);
      const cellInfo = expectedCells[index];

      if (index >= cellCount) {
        if (cellInfo.required) {
          diagnostics.isValid = false;
          diagnostics.errors.push(
            `❌ Missing REQUIRED cell [${index}] (${cellInfo.name}) - Only ${cellCount} cells found`
          );
          diagnostics.cellIndices.missing.push({
            index,
            name: cellInfo.name,
            required: true,
          });
        } else {
          diagnostics.warnings.push(
            `⚠️ Missing optional cell [${index}] (${cellInfo.name}) - Only ${cellCount} cells found`
          );
        }
      } else {
        const cell = cells[index];
        const cellText = window.betIQ.extractCellText
          ? window.betIQ.extractCellText(cell)
          : (cell?.textContent || "").trim();

        diagnostics.cellIndices.found[index] = {
          name: cellInfo.name,
          text: cellText.substring(0, 50), // First 50 chars
          isEmpty: !cellText,
        };

        if (cellInfo.required && !cellText) {
          diagnostics.warnings.push(
            `⚠️ Cell [${index}] (${cellInfo.name}) exists but is empty`
          );
        }
      }
    });

    // Check if minimum required cells exist
    if (cellCount < 9) {
      diagnostics.isValid = false;
      diagnostics.errors.push(
        `❌ Insufficient cells: Found ${cellCount}, need at least 9`
      );
    }

    // Validate checkbox selector (for selection overlay) - only warn if site uses overlay and selector is missing
    var rowCheckboxSel =
      config.rowCheckboxSelector || 'button[role="checkbox"]';
    const checkbox = sampleRow.querySelector(rowCheckboxSel);
    if (!checkbox && config.rowCheckboxSelector != null) {
      diagnostics.warnings.push(
        "⚠️ Checkbox selector not found: " + rowCheckboxSel
      );
    }

    // Sample data from first few rows
    diagnostics.sampleData = [];
    var minCells = window.betIQ.getMinDataRowCells
      ? window.betIQ.getMinDataRowCells()
      : 9;
    var col = config.columnIndices;
    if (!col) col = { game: 3, gameTime: 4, player: 5, betType: 6, prop: 8 };
    dataRows.slice(0, 3).forEach((row, idx) => {
      const rowCells = row.querySelectorAll(dataCellSel);
      if (rowCells.length >= minCells) {
        const extractCellText =
          window.betIQ.extractCellText || ((cell) => cell?.textContent || "");
        diagnostics.sampleData.push({
          rowIndex: idx,
          cellCount: rowCells.length,
          game: extractCellText(rowCells[col.game]),
          player: extractCellText(rowCells[col.player]),
          prop: extractCellText(rowCells[col.prop]),
          betType: extractCellText(rowCells[col.betType]),
          gameTime: extractCellText(rowCells[col.gameTime]),
        });
      }
    });

    return diagnostics;
  };

  /**
   * Inspect table columns - shows what data is in each column
   * Useful for identifying which columns contain bookie, line, odds, etc.
   */
  window.betIQ.inspectTableColumns = function () {
    var config =
      (window.betIQ.getSiteConfig && window.betIQ.getSiteConfig()) || {};
    var headerCellSel = config.headerCellSelector || "th";
    var dataCellSel = config.dataCellSelector || "td";
    var rowCellSel = config.rowCellSelector || "td, th";

    const tables =
      (window.betIQ.getAllTablesOrContainers &&
        window.betIQ.getAllTablesOrContainers()) ||
      [];
    if (tables.length === 0) {
      console.error("[betIQ-Plugin] No tables found");
      return null;
    }

    const table = tables[0];
    var headerRowSel = config.headerRowSelector;
    var rootForHeader =
      table.tagName === "TABLE" ? table : table.parentElement || table;
    var headerSel = headerRowSel;
    const headerRow =
      rootForHeader && headerSel
        ? rootForHeader.querySelector(headerSel)
        : null;
    const dataRows = Array.from(window.betIQ.getDataRows(table)).filter(
      (row) => {
        const hasTh = row.querySelectorAll(headerCellSel).length > 0;
        const hasTd = row.querySelectorAll(dataCellSel).length > 0;
        return hasTd && !hasTh;
      }
    );

    const extractCellText =
      window.betIQ.extractCellText ||
      ((cell) => (cell?.textContent || "").trim());

    const report = {
      headerRow: null,
      columnCount: 0,
      sampleData: [],
    };

    // Get headers
    if (headerRow) {
      const headers = headerRow.querySelectorAll(rowCellSel);
      report.headerRow = Array.from(headers).map((cell, idx) => ({
        index: idx,
        text: extractCellText(cell),
      }));
      report.columnCount = headers.length;
    }

    // Get sample data from first 3 rows
    dataRows.slice(0, 3).forEach((row, rowIdx) => {
      const cells = row.querySelectorAll(dataCellSel);
      const rowData = {
        rowIndex: rowIdx,
        cells: Array.from(cells).map((cell, idx) => ({
          index: idx,
          text: extractCellText(cell).substring(0, 50),
        })),
      };
      report.sampleData.push(rowData);
    });

    console.group("[betIQ-Plugin] Table Column Inspection");
    console.log("Column Count:", report.columnCount);
    if (report.headerRow) {
      console.group("Headers:");
      report.headerRow.forEach((h) => {
        console.log(`[${h.index}]: ${h.text}`);
      });
      console.groupEnd();
    }
    console.group("Sample Data (First 3 rows):");
    report.sampleData.forEach((rowData) => {
      console.group(`Row ${rowData.rowIndex}:`);
      rowData.cells.forEach((cell) => {
        console.log(`[${cell.index}]: ${cell.text}`);
      });
      console.groupEnd();
    });
    console.groupEnd();
    console.log("Full report:", report);
    console.groupEnd();

    return report;
  };

  /**
   * Test matching on a specific row - useful for debugging why a row isn't matching
   * @param {HTMLElement|number} rowOrIndex - The row element or index of unmatched row (0-based)
   */
  window.betIQ.testRowMatching = function (rowOrIndex) {
    var config =
      (window.betIQ.getSiteConfig && window.betIQ.getSiteConfig()) || {};
    var headerCellSel = config.headerCellSelector || "th";
    var dataCellSel = config.dataCellSelector || "td";

    const capturedBettingData = window.betIQ.getCapturedBettingData();
    const tables =
      (window.betIQ.getAllTablesOrContainers &&
        window.betIQ.getAllTablesOrContainers()) ||
      [];

    if (tables.length === 0) {
      console.error("[betIQ-Plugin] No tables found");
      return null;
    }

    const table = tables[0];
    const allRows = Array.from(window.betIQ.getDataRows(table));
    const unmatchedRows = allRows.filter((row) => {
      const hasTh = row.querySelectorAll(headerCellSel).length > 0;
      const hasTd = row.querySelectorAll(dataCellSel).length > 0;
      const cellCount = row.querySelectorAll(dataCellSel).length;
      const hasId = row.getAttribute("data-id") || row.id;
      var minC = window.betIQ.getMinDataRowCells
        ? window.betIQ.getMinDataRowCells()
        : 9;
      return hasTd && !hasTh && cellCount >= minC && !hasId;
    });

    let testRow;
    if (typeof rowOrIndex === "number") {
      if (rowOrIndex >= unmatchedRows.length) {
        console.error(
          `[betIQ-Plugin] Row index ${rowOrIndex} out of range. Total unmatched: ${unmatchedRows.length}`
        );
        return null;
      }
      testRow = unmatchedRows[rowOrIndex];
    } else {
      testRow = rowOrIndex;
    }

    if (!testRow) {
      console.error("[betIQ-Plugin] Invalid row");
      return null;
    }

    console.group("[betIQ-Plugin] Testing Row Matching");

    // Extract row data
    const cells = testRow.querySelectorAll(dataCellSel);
    const extractCellText =
      window.betIQ.extractCellText ||
      ((cell) => (cell?.textContent || "").trim());
    const normalizeText =
      window.betIQ.normalizeText ||
      ((text) => (text || "").toLowerCase().trim());
    const col = (window.betIQ.getSiteConfig &&
      window.betIQ.getSiteConfig().columnIndices) || {
      game: 3,
      gameTime: 4,
      player: 5,
      betType: 6,
      prop: 8,
    };

    const rowData = {
      game: extractCellText(cells[col.game]),
      player: extractCellText(cells[col.player]),
      prop: extractCellText(cells[col.prop]),
      betType: extractCellText(cells[col.betType]),
      gameTime: extractCellText(cells[col.gameTime]),
      normalized: {
        game: normalizeText(extractCellText(cells[col.game])),
        player: normalizeText(extractCellText(cells[col.player])),
        prop: normalizeText(extractCellText(cells[col.prop])),
        betType: normalizeText(extractCellText(cells[col.betType])),
        gameTime: normalizeText(extractCellText(cells[col.gameTime])),
      },
    };

    console.log("Row Data:", rowData);

    // Test the actual matching function
    const matchedBet = window.betIQ.matchRowWithData
      ? window.betIQ.matchRowWithData(testRow, capturedBettingData)
      : null;

    console.log(
      "Matching Function Result:",
      matchedBet ? "✅ MATCHED" : "❌ NO MATCH"
    );

    if (matchedBet) {
      console.log("Matched Bet:", {
        bet_id: matchedBet.bet_id || matchedBet.id,
        game: matchedBet.game,
        player: matchedBet.player,
        prop: matchedBet.prop,
      });
    } else {
      console.warn(
        "⚠️ Matching function returned null even though perfect match exists!"
      );
      console.log("This indicates a bug in the matching logic.");
    }

    console.groupEnd();
    return { rowData, matchedBet };
  };

  /**
   * Debug unmatched rows - analyzes all rows without IDs to see why they're not matching
   * Returns detailed analysis of each unmatched row
   */
  window.betIQ.debugUnmatchedRows = function () {
    var config =
      (window.betIQ.getSiteConfig && window.betIQ.getSiteConfig()) || {};
    var headerCellSel = config.headerCellSelector || "th";
    var dataCellSel = config.dataCellSelector || "td";

    const capturedBettingData = window.betIQ.getCapturedBettingData();
    const tables =
      (window.betIQ.getAllTablesOrContainers &&
        window.betIQ.getAllTablesOrContainers()) ||
      [];

    if (tables.length === 0) {
      return null;
    }

    const table = tables[0];
    const allRows = Array.from(window.betIQ.getDataRows(table));

    // Get all rows without IDs
    const unmatchedRows = allRows.filter((row) => {
      const hasTh = row.querySelectorAll(headerCellSel).length > 0;
      const hasTd = row.querySelectorAll(dataCellSel).length > 0;
      const cellCount = row.querySelectorAll(dataCellSel).length;
      const hasId = row.getAttribute("data-id") || row.id;
      var minC = window.betIQ.getMinDataRowCells
        ? window.betIQ.getMinDataRowCells()
        : 9;
      return hasTd && !hasTh && cellCount >= minC && !hasId;
    });

    // Silent analysis - no console spam, just return data

    const extractCellText =
      window.betIQ.extractCellText ||
      ((cell) => (cell?.textContent || "").trim());
    const normalizeText =
      window.betIQ.normalizeText ||
      ((text) => (text || "").toLowerCase().trim());
    const normalizeGameTime = window.betIQ.normalizeGameTime || normalizeText;
    const normalizeAPIGameTime =
      window.betIQ.normalizeAPIGameTime || (() => "");
    const getAPIBetType = window.betIQ.getAPIBetType || (() => "");

    const analysis = {
      totalUnmatched: unmatchedRows.length,
      rows: [],
      summary: {
        foundInAPI: 0,
        notFoundInAPI: 0,
        matchingIssues: 0,
      },
    };

    const col = config.columnIndices || {
      game: 3,
      gameTime: 4,
      player: 5,
      betType: 6,
      prop: 8,
      bookieIndices: [1],
    };
    const bookieIndices = col.bookieIndices || [1];
    unmatchedRows.forEach((row, rowIdx) => {
      const cells = row.querySelectorAll(dataCellSel);
      const game = normalizeText(extractCellText(cells[col.game]));
      const player = normalizeText(extractCellText(cells[col.player]));
      const prop = normalizeText(extractCellText(cells[col.prop]));
      const betType = normalizeText(extractCellText(cells[col.betType]));
      const gameTime = normalizeGameTime(extractCellText(cells[col.gameTime]));
      let tableBookie = null;
      for (const idx of bookieIndices) {
        if (idx < cells.length) {
          const t = normalizeText(extractCellText(cells[idx]));
          if (t) {
            tableBookie = t;
            break;
          }
        }
      }

      const rowData = {
        rowIndex: rowIdx,
        game: extractCellText(cells[col.game]),
        player: extractCellText(cells[col.player]),
        prop: extractCellText(cells[col.prop]),
        betType: extractCellText(cells[col.betType]),
        gameTime: extractCellText(cells[col.gameTime]),
        normalized: { game, player, prop, betType, gameTime },
        tableBookie,
      };

      // Skip rows where game or prop is empty (player may be empty for game/team totals)
      if (!game || !prop) {
        return; // Skip this row - table data not loaded yet
      }

      // Try to find matches in API data
      const potentialMatches = [];
      let perfectMatch = null;
      let closestMatch = null;
      let closestScore = 0;

      const apiBookieNorm = (b) =>
        normalizeText(
          b.bookie ||
            b.bookmaker ||
            b.book ||
            (b.book_id != null ? String(b.book_id) : "")
        );
      const bookieMatch = (tb, ab) =>
        !tb && !ab
          ? true
          : !tb || !ab
          ? false
          : tb === ab || tb.includes(ab) || ab.includes(tb);
      const betTypeMatch = (tb, ab) =>
        !tb && !ab
          ? true
          : !tb || !ab
          ? false
          : tb === ab || tb.includes(ab) || ab.includes(tb);

      capturedBettingData.forEach((bet, betIdx) => {
        const apiGame = normalizeText(
          bet.game || bet.game_name || bet.match || bet.matchup || ""
        );
        const apiPlayer = normalizeText(
          bet.player || bet.player_name || bet.athlete || ""
        );
        const apiProp = normalizeText(
          bet.prop || bet.prop_type || bet.stat_type || ""
        );
        const apiBetType = getAPIBetType(bet);
        const apiGameTime = normalizeAPIGameTime(bet);
        const apiBookie = apiBookieNorm(bet);

        const betTypeOk = betTypeMatch(betType, apiBetType);
        const bookieOk = bookieMatch(tableBookie, apiBookie);

        // Calculate match score
        let score = 0;
        const matchDetails = {
          game: apiGame === game,
          player: apiPlayer === player,
          prop: apiProp === prop,
          betType: betTypeOk,
          bookie: bookieOk,
          gameTime:
            gameTime && apiGameTime
              ? gameTime === apiGameTime ||
                (window.betIQ.compareGameTimes &&
                  window.betIQ.compareGameTimes(gameTime, apiGameTime))
              : null,
        };

        if (matchDetails.game) score += 3;
        if (matchDetails.player) score += 3;
        if (matchDetails.prop) score += 3;
        if (matchDetails.betType) score += 1;
        if (matchDetails.bookie) score += 1;
        if (matchDetails.gameTime === true) score += 1;

        // Perfect match = same as rowMatcher: game, player, prop, betType, and bookie must all match
        if (
          matchDetails.game &&
          matchDetails.player &&
          matchDetails.prop &&
          matchDetails.betType &&
          matchDetails.bookie
        ) {
          if (!perfectMatch || score > perfectMatch.score) {
            perfectMatch = {
              bet,
              betIndex: betIdx,
              score,
              matchDetails,
              bet_id: bet.bet_id || bet.id,
              apiGame,
              apiPlayer,
              apiProp,
              apiBetType,
              apiGameTime,
              apiBookie,
            };
          }
          potentialMatches.push({
            bet,
            betIndex: betIdx,
            score,
            matchDetails,
            bet_id: bet.bet_id || bet.id,
          });
        }

        // Track closest match
        if (score > closestScore) {
          closestScore = score;
          closestMatch = {
            bet,
            betIndex: betIdx,
            score,
            matchDetails,
            bet_id: bet.bet_id || bet.id,
            apiGame,
            apiPlayer,
            apiProp,
            apiBetType,
            apiGameTime,
          };
        }
      });

      const rowAnalysis = {
        rowData,
        perfectMatch,
        closestMatch: closestScore > 0 ? closestMatch : null,
        potentialMatchesCount: potentialMatches.length,
        status: perfectMatch
          ? "FOUND_IN_API"
          : closestScore > 0
          ? "SIMILAR_IN_API"
          : "NOT_IN_API",
      };

      analysis.rows.push(rowAnalysis);

      if (perfectMatch) {
        analysis.summary.foundInAPI++;
      } else if (closestScore > 0) {
        analysis.summary.matchingIssues++;
      } else {
        analysis.summary.notFoundInAPI++;
      }
    });

    // Return analysis without console spam

    return analysis;
  };

  /**
   * Diagnose matching issues - compares API data with table rows
   * Helps identify why rows aren't matching
   */
  window.betIQ.diagnoseMatching = function () {
    var config =
      (window.betIQ.getSiteConfig && window.betIQ.getSiteConfig()) || {};
    var headerCellSel = config.headerCellSelector || "th";
    var dataCellSel = config.dataCellSelector || "td";

    const capturedBettingData = window.betIQ.getCapturedBettingData();
    const tables =
      (window.betIQ.getAllTablesOrContainers &&
        window.betIQ.getAllTablesOrContainers()) ||
      [];

    const report = {
      apiDataCount: capturedBettingData.length,
      tableCount: tables.length,
      issues: [],
      sampleApiData: [],
      sampleTableRows: [],
      matchingTest: null,
      unmatchedRowsAnalysis: null,
    };

    // Check if API data exists
    if (capturedBettingData.length === 0) {
      report.issues.push(
        "❌ No API data captured - extension may not be intercepting API calls"
      );
    } else {
      // Show sample API data
      report.sampleApiData = capturedBettingData
        .slice(0, 3)
        .map((bet, idx) => ({
          index: idx,
          bet_id: bet.bet_id || bet.id || "(no ID)",
          game:
            bet.game ||
            bet.game_name ||
            bet.match ||
            bet.matchup ||
            "(no game)",
          player: bet.player || bet.player_name || bet.athlete || "(no player)",
          prop: bet.prop || bet.prop_type || bet.stat_type || "(no prop)",
          betType: bet.bet_type || bet.type || "(no bet type)",
          gameTime: bet.game_time || bet.time || "(no game time)",
          allFields: Object.keys(bet),
        }));
    }

    // Get sample table rows
    if (tables.length > 0) {
      const table = tables[0];
      const dataRows = Array.from(window.betIQ.getDataRows(table)).filter(
        (row) => {
          const hasTh = row.querySelectorAll(headerCellSel).length > 0;
          const hasTd = row.querySelectorAll(dataCellSel).length > 0;
          return hasTd && !hasTh;
        }
      );

      report.tableRowCount = dataRows.length;

      // Extract data from first 3 rows
      const col = config.columnIndices || {
        game: 3,
        gameTime: 4,
        player: 5,
        betType: 6,
        prop: 8,
      };
      dataRows.slice(0, 3).forEach((row, idx) => {
        const cells = row.querySelectorAll(dataCellSel);
        const extractCellText =
          window.betIQ.extractCellText ||
          ((cell) => (cell?.textContent || "").trim());

        report.sampleTableRows.push({
          rowIndex: idx,
          cellCount: cells.length,
          game:
            cells.length > col.game
              ? extractCellText(cells[col.game])
              : "(cell missing)",
          player:
            cells.length > col.player
              ? extractCellText(cells[col.player])
              : "(cell missing)",
          prop:
            cells.length > col.prop
              ? extractCellText(cells[col.prop])
              : "(cell missing)",
          betType:
            cells.length > col.betType
              ? extractCellText(cells[col.betType])
              : "(cell missing)",
          gameTime:
            cells.length > col.gameTime
              ? extractCellText(cells[col.gameTime])
              : "(cell missing)",
          hasDataId: !!row.getAttribute("data-id"),
          dataId: row.getAttribute("data-id") || null,
        });
      });

      // Test matching on first row if we have API data
      if (dataRows.length > 0 && capturedBettingData.length > 0) {
        const testRow = dataRows[0];
        const cells = testRow.querySelectorAll(dataCellSel);

        // Extract normalized values from table row
        const extractCellText =
          window.betIQ.extractCellText ||
          ((cell) => (cell?.textContent || "").trim());
        const normalizeText =
          window.betIQ.normalizeText ||
          ((text) => (text || "").toLowerCase().trim());
        const normalizeGameTime =
          window.betIQ.normalizeGameTime || normalizeText;
        const normalizeAPIGameTime =
          window.betIQ.normalizeAPIGameTime || (() => "");
        const getAPIBetType = window.betIQ.getAPIBetType || (() => "");

        const colDiag = (window.betIQ.getSiteConfig &&
          window.betIQ.getSiteConfig().columnIndices) || {
          game: 3,
          gameTime: 4,
          player: 5,
          betType: 6,
          prop: 8,
        };
        const tableGame = normalizeText(extractCellText(cells[colDiag.game]));
        const tablePlayer = normalizeText(
          extractCellText(cells[colDiag.player])
        );
        const tableProp = normalizeText(extractCellText(cells[colDiag.prop]));
        const tableBetType = normalizeText(
          extractCellText(cells[colDiag.betType])
        );
        const tableGameTime = normalizeGameTime(
          extractCellText(cells[colDiag.gameTime])
        );
        const bookieIndicesDiag = colDiag.bookieIndices || [1];
        let tableBookieDiag = null;
        for (const bi of bookieIndicesDiag) {
          if (bi < cells.length) {
            const t = normalizeText(extractCellText(cells[bi]));
            if (t) {
              tableBookieDiag = t;
              break;
            }
          }
        }
        const apiBookieNorm = (b) =>
          normalizeText(
            b.bookie ||
              b.bookmaker ||
              b.book ||
              (b.book_id != null ? String(b.book_id) : "")
          );
        const bookieMatchDiag = (tb, ab) =>
          !tb && !ab
            ? true
            : !tb || !ab
            ? false
            : tb === ab || tb.includes(ab) || ab.includes(tb);
        const betTypeMatchDiag = (tb, ab) =>
          !tb && !ab
            ? true
            : !tb || !ab
            ? false
            : tb === ab || tb.includes(ab) || ab.includes(tb);

        // Try to find a match manually to see why it fails
        // Check ALL records, not just first 10 (use same rules as rowMatcher: game, player, prop, betType, bookie)
        let closestMatch = null;
        let closestMatchScore = 0;
        const matchDetails = [];
        let perfectMatches = 0;
        let partialMatches = [];

        // First, try to find actual matches in ALL data
        capturedBettingData.forEach((bet, idx) => {
          const apiGame = normalizeText(
            bet.game || bet.game_name || bet.match || bet.matchup || ""
          );
          const apiPlayer = normalizeText(
            bet.player || bet.player_name || bet.athlete || ""
          );
          const apiProp = normalizeText(
            bet.prop || bet.prop_type || bet.stat_type || ""
          );
          const apiBetType = getAPIBetType(bet);
          const apiGameTime = normalizeAPIGameTime(bet);
          const apiBookie = apiBookieNorm(bet);
          const betTypeOk = betTypeMatchDiag(tableBetType, apiBetType);
          const bookieOk = bookieMatchDiag(tableBookieDiag, apiBookie);

          // Perfect match = same as rowMatcher: game, player, prop, betType, bookie
          if (
            apiGame === tableGame &&
            apiPlayer === tablePlayer &&
            apiProp === tableProp &&
            betTypeOk &&
            bookieOk
          ) {
            perfectMatches++;
            matchDetails.push({
              index: idx,
              bet_id: bet.bet_id || bet.id,
              matched: true,
              apiGame,
              apiPlayer,
              apiProp,
              apiBetType,
              apiBookie,
              apiGameTime,
              tableGameTime: tableGameTime,
              gameTimeMatch: apiGameTime === tableGameTime,
              betTypeMatch: betTypeOk,
              bookieMatch: bookieOk,
            });
          }
        });

        // If no perfect matches, find closest match from first 20 for analysis
        if (perfectMatches === 0) {
          capturedBettingData.slice(0, 20).forEach((bet, idx) => {
            const apiGame = normalizeText(
              bet.game || bet.game_name || bet.match || bet.matchup || ""
            );
            const apiPlayer = normalizeText(
              bet.player || bet.player_name || bet.athlete || ""
            );
            const apiProp = normalizeText(
              bet.prop || bet.prop_type || bet.stat_type || ""
            );
            const apiBetType = getAPIBetType(bet);
            const apiGameTime = normalizeAPIGameTime(bet);
            const apiBookie = apiBookieNorm(bet);

            let score = 0;
            const reasons = [];

            if (apiGame === tableGame) {
              score += 3;
            } else {
              reasons.push(`Game mismatch: "${apiGame}" vs "${tableGame}"`);
            }

            if (apiPlayer === tablePlayer) {
              score += 3;
            } else {
              reasons.push(
                `Player mismatch: "${apiPlayer}" vs "${tablePlayer}"`
              );
            }

            if (apiProp === tableProp) {
              score += 3;
            } else {
              reasons.push(`Prop mismatch: "${apiProp}" vs "${tableProp}"`);
            }

            if (betTypeMatchDiag(tableBetType, apiBetType)) {
              score += 1;
            } else {
              reasons.push(
                `BetType mismatch: "${apiBetType}" vs "${tableBetType}"`
              );
            }

            if (bookieMatchDiag(tableBookieDiag, apiBookie)) {
              score += 1;
            } else {
              reasons.push(
                `Bookie mismatch: "${tableBookieDiag || ""}" vs "${apiBookie}"`
              );
            }

            if (tableGameTime && apiGameTime) {
              if (apiGameTime === tableGameTime) {
                score += 1;
              } else {
                reasons.push(
                  `GameTime mismatch: "${apiGameTime}" vs "${tableGameTime}"`
                );
              }
            }

            if (score > closestMatchScore) {
              closestMatchScore = score;
              closestMatch = {
                bet,
                score,
                reasons,
                apiGame,
                apiPlayer,
                apiProp,
                apiBetType,
                apiGameTime,
              };
            }
          });
        }

        const matchedBet = window.betIQ.matchRowWithData
          ? window.betIQ.matchRowWithData(testRow, capturedBettingData)
          : null;

        report.matchingTest = {
          rowMatched: !!matchedBet,
          matchedBet: matchedBet
            ? {
                bet_id: matchedBet.bet_id || matchedBet.id,
                game: matchedBet.game || matchedBet.game_name,
                player: matchedBet.player || matchedBet.player_name,
                prop: matchedBet.prop || matchedBet.prop_type,
              }
            : null,
          rowData: report.sampleTableRows[0],
          normalizedRowData: {
            game: tableGame,
            player: tablePlayer,
            prop: tableProp,
            betType: tableBetType,
            gameTime: tableGameTime,
            tableBookie: tableBookieDiag || null,
          },
          perfectMatches: perfectMatches,
          matchDetails: matchDetails,
          closestMatch: closestMatch,
        };

        if (!matchedBet) {
          if (perfectMatches > 0) {
            report.issues.push(
              `⚠️ Found ${perfectMatches} perfect match(es) in API data, but matching function returned null - possible matching logic issue`
            );
          } else {
            report.issues.push("⚠️ First table row did not match any API data");
            if (closestMatch) {
              report.issues.push(
                `⚠️ Closest match score: ${closestMatchScore}/10 - ${closestMatch.reasons.join(
                  ", "
                )}`
              );
            }
          }
        } else if (perfectMatches === 0) {
          report.issues.push(
            "⚠️ Matching function found a match, but manual search found 0 perfect matches - possible normalization issue"
          );
        }
      }
    } else {
      report.issues.push("❌ No tables found on page");
    }

    // Log report
    console.group("[betIQ-Plugin] 🔍 Matching Diagnosis");
    console.log("API Data:", {
      count: report.apiDataCount,
      sample: report.sampleApiData,
    });
    console.log("Table Rows:", {
      count: report.tableRowCount,
      sample: report.sampleTableRows,
    });
    if (report.matchingTest) {
      console.group("Matching Test:");
      console.log("Row Matched:", report.matchingTest.rowMatched);
      if (report.matchingTest.normalizedRowData) {
        console.log(
          "Normalized Row Data:",
          report.matchingTest.normalizedRowData
        );
      }
      if (report.matchingTest.perfectMatches !== undefined) {
        console.log(
          "Perfect Matches Found:",
          report.matchingTest.perfectMatches
        );
        if (
          report.matchingTest.matchDetails &&
          report.matchingTest.matchDetails.length > 0
        ) {
          console.log("Match Details:", report.matchingTest.matchDetails);
        }
      }
      if (report.matchingTest.closestMatch) {
        console.group("Closest Match (Best Score):");
        console.log("Score:", report.matchingTest.closestMatch.score, "/ 10");
        console.log("API Data:", {
          game: report.matchingTest.closestMatch.apiGame,
          player: report.matchingTest.closestMatch.apiPlayer,
          prop: report.matchingTest.closestMatch.apiProp,
          betType: report.matchingTest.closestMatch.apiBetType,
          gameTime: report.matchingTest.closestMatch.apiGameTime,
        });
        if (report.matchingTest.closestMatch.reasons.length > 0) {
          console.log(
            "Mismatch Reasons:",
            report.matchingTest.closestMatch.reasons
          );
        }
        console.groupEnd();
      }
      if (report.matchingTest.matchedBet) {
        console.log("✅ Matched Bet:", report.matchingTest.matchedBet);
      }
      console.groupEnd();
    }
    // Analyze unmatched rows (silently, then show in output)
    if (tables.length > 0 && capturedBettingData.length > 0) {
      const unmatchedAnalysis = window.betIQ.debugUnmatchedRows();
      if (unmatchedAnalysis && unmatchedAnalysis.totalUnmatched > 0) {
        report.unmatchedRowsAnalysis = {
          totalUnmatched: unmatchedAnalysis.totalUnmatched,
          summary: unmatchedAnalysis.summary,
          sampleRows: unmatchedAnalysis.rows.slice(0, 5), // First 5 for display
        };
      }
    }

    // Show unmatched rows analysis
    if (report.unmatchedRowsAnalysis) {
      console.group("Unmatched Rows Analysis:");
      console.log(
        `Total Unmatched: ${report.unmatchedRowsAnalysis.totalUnmatched}`
      );
      console.log(
        `✅ Found in API (should match): ${report.unmatchedRowsAnalysis.summary.foundInAPI}`
      );
      console.log(
        `⚠️ Similar in API (field differences): ${report.unmatchedRowsAnalysis.summary.matchingIssues}`
      );
      console.log(
        `❌ Not in API: ${report.unmatchedRowsAnalysis.summary.notFoundInAPI}`
      );

      if (report.unmatchedRowsAnalysis.summary.foundInAPI > 0) {
        console.warn(
          `⚠️ ${report.unmatchedRowsAnalysis.summary.foundInAPI} row(s) have perfect matches in API but didn't match - this indicates a matching logic bug!`
        );
      }

      if (report.unmatchedRowsAnalysis.sampleRows.length > 0) {
        console.group("Sample Unmatched Rows (First 5):");
        report.unmatchedRowsAnalysis.sampleRows.forEach((rowAnalysis, idx) => {
          const status =
            rowAnalysis.status === "FOUND_IN_API"
              ? "✅"
              : rowAnalysis.status === "SIMILAR_IN_API"
              ? "⚠️"
              : "❌";
          console.log(
            `${status} Row ${idx + 1}: ${rowAnalysis.rowData.game} - ${
              rowAnalysis.rowData.player
            } - ${rowAnalysis.rowData.prop}`
          );
          if (rowAnalysis.perfectMatch) {
            console.log(
              `   → Perfect match found (bet_id: ${rowAnalysis.perfectMatch.bet_id}) but didn't match!`
            );
          } else if (rowAnalysis.closestMatch) {
            console.log(
              `   → Closest match score: ${rowAnalysis.closestMatch.score}/10 (bet_id: ${rowAnalysis.closestMatch.bet_id})`
            );
            const mismatches = Object.entries(
              rowAnalysis.closestMatch.matchDetails
            )
              .filter(([_, matched]) => !matched)
              .map(([field, _]) => field);
            if (mismatches.length > 0) {
              console.log(`   → Mismatched fields: ${mismatches.join(", ")}`);
            }
          }
        });
        console.groupEnd();
      }
      console.groupEnd();
    }

    if (report.issues.length > 0) {
      console.group("Issues Found:");
      report.issues.forEach((issue) => console.warn(issue));
      console.groupEnd();
    }
    console.groupEnd();

    return report;
  };

  /**
   * Inspect table structure - useful for debugging selector issues
   * Returns detailed information about all tables and rows on the page
   */
  window.betIQ.inspectTableStructure = function () {
    var config =
      (window.betIQ.getSiteConfig && window.betIQ.getSiteConfig()) || {};
    var headerCellSel = config.headerCellSelector || "th";
    var dataCellSel = config.dataCellSelector || "td";

    const tables =
      (window.betIQ.getAllTablesOrContainers &&
        window.betIQ.getAllTablesOrContainers()) ||
      [];
    const report = {
      tableCount: tables.length,
      tables: [],
    };

    tables.forEach((table, tableIdx) => {
      const allRows = window.betIQ.getDataRows(table);
      const allRowsArr = Array.isArray(allRows) ? allRows : Array.from(allRows);
      const headerRows = allRowsArr.filter((row) => {
        return row.querySelectorAll(headerCellSel).length > 0;
      });
      const dataRows = allRowsArr.filter((row) => {
        const hasTh = row.querySelectorAll(headerCellSel).length > 0;
        const hasTd = row.querySelectorAll(dataCellSel).length > 0;
        return hasTd && !hasTh;
      });

      const tableInfo = {
        index: tableIdx,
        id: table.id || "",
        className: table.className || "",
        selector: "getAllTablesOrContainers()[" + tableIdx + "]",
        totalRows: allRowsArr.length,
        headerRows: headerRows.length,
        dataRows: dataRows.length,
        sampleDataRows: [],
      };

      // Analyze first 3 data rows
      dataRows.slice(0, 3).forEach((row, rowIdx) => {
        const cells = row.querySelectorAll(dataCellSel);
        const cellData = Array.from(cells).map((cell, cellIdx) => ({
          index: cellIdx,
          text: (cell.textContent || "").trim(),
          tag: cell.tagName,
          className: cell.className || "",
        }));

        tableInfo.sampleDataRows.push({
          rowIndex: rowIdx,
          cellCount: cells.length,
          cells: cellData,
          hasDataId: !!row.getAttribute("data-id"),
          dataId: row.getAttribute("data-id") || null,
        });
      });

      report.tables.push(tableInfo);
    });

    console.group("[betIQ-Plugin] 🔍 Table Structure Inspection");
    console.log("Total tables found:", report.tableCount);
    report.tables.forEach((tableInfo) => {
      console.group(`Table ${tableInfo.index}:`);
      console.log("ID:", tableInfo.id || "(none)");
      console.log("Class:", tableInfo.className || "(none)");
      console.log("Total rows:", tableInfo.totalRows);
      console.log("Header rows:", tableInfo.headerRows);
      console.log("Data rows:", tableInfo.dataRows);
      console.log("Sample data rows:", tableInfo.sampleDataRows);
      console.groupEnd();
    });
    console.groupEnd();

    return report;
  };

  /**
   * Log selector validation results
   */
  window.betIQ.logSelectorDiagnostics = function (diagnostics) {
    if (!diagnostics) {
      diagnostics = window.betIQ.validateSelectors();
    }

    console.group("[betIQ-Plugin] 🔍 Selector Validation Report");

    if (diagnostics.isValid) {
      console.log("✅ All selectors are valid");
    } else {
      console.error("❌ Selector validation failed!");
    }

    if (diagnostics.errors.length > 0) {
      console.group("Errors:");
      diagnostics.errors.forEach((error) => console.error(error));
      console.groupEnd();
    }

    if (diagnostics.warnings.length > 0) {
      console.group("Warnings:");
      diagnostics.warnings.forEach((warning) => console.warn(warning));
      console.groupEnd();
    }

    console.log("Table Structure:", diagnostics.tableStructure);
    console.log("Cell Indices:", diagnostics.cellIndices);

    // Show detailed row structure if validation failed
    if (!diagnostics.isValid && diagnostics.tableStructure.allRowsInfo) {
      console.group("📋 Detailed Row Structure (First 5 rows):");
      diagnostics.tableStructure.allRowsInfo.forEach((rowInfo) => {
        console.log(`Row ${rowInfo.rowIndex}:`, {
          tdCount: rowInfo.tdCount,
          thCount: rowInfo.thCount,
          cells: rowInfo.cells,
          htmlPreview: rowInfo.rowHTML,
        });
      });
      console.groupEnd();
    }

    // Show all cells in sample row if cell count is wrong
    if (
      diagnostics.cellIndices.actualCount < 9 &&
      diagnostics.cellIndices.allCells
    ) {
      console.group("🔍 All Cells Found in Sample Row:");
      diagnostics.cellIndices.allCells.forEach((cell) => {
        console.log(`Cell [${cell.index}]:`, {
          text: cell.text,
          tag: cell.tag,
          className: cell.className,
        });
      });
      console.groupEnd();
    }

    if (diagnostics.sampleData && diagnostics.sampleData.length > 0) {
      console.log("Sample Row Data:", diagnostics.sampleData);
    }

    console.groupEnd();

    return diagnostics;
  };

  /**
   * Update ID cell with click handler
   */
  function updateIdCell(idCell, betId, row) {
    if (!idCell || !betId) return;

    // Remove old click handler by cloning
    const oldCell = idCell;
    const newCell = idCell.cloneNode(false);
    newCell.textContent = betId;
    oldCell.parentNode.replaceChild(newCell, oldCell);

    // Apply styling and add click handler
    newCell.style.color = "#3b82f6";
    newCell.style.textDecoration = "underline";
    newCell.style.cursor = "pointer";
    newCell.title = "Click to view stake details";

    newCell.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (window.betIQ && window.betIQ.showStakePopup) {
        window.betIQ.showStakePopup(betId, row);
      }
    });
  }

  /**
   * Match existing table rows with API data and add IDs
   * Only works if user is logged in
   */
  window.betIQ.generateBettingDataTable = function () {
    var config =
      (window.betIQ.getSiteConfig && window.betIQ.getSiteConfig()) || {};
    var headerCellSel = config.headerCellSelector || "th";
    var dataCellSel = config.dataCellSelector || "td";
    var idCellSel =
      (config.betiqSelectors && config.betiqSelectors.idCell) ||
      "[data-betiq-cell='id']";
    var dataIdRowSel = config.dataIdRowSelector || "tr[data-id]";
    var duplicateErrorId =
      config.duplicateIdErrorElementId || "betiq-duplicate-id-error";

    // Check if user is logged in - don't generate table if not logged in (unless skipAuthForColumnInject)
    var skipAuth = config.skipAuthForColumnInject === true;
    if (!skipAuth && !window.betIQ.auth?.isLoggedIn()) {
      if (window.betIQ.addKellyStakeColumn) {
        window.betIQ.addKellyStakeColumn();
      }
      const tables =
        (window.betIQ.getAllTablesOrContainers &&
          window.betIQ.getAllTablesOrContainers()) ||
        [];
      tables.forEach((table) => {
        const rows = table.querySelectorAll
          ? table.querySelectorAll(dataIdRowSel)
          : [];
        rows.forEach((row) => {
          row.removeAttribute("data-id");
        });
      });
      return;
    }

    const capturedBettingData = window.betIQ.getCapturedBettingData();

    if (capturedBettingData.length === 0) {
      return;
    }

    const tables =
      (window.betIQ.getAllTablesOrContainers &&
        window.betIQ.getAllTablesOrContainers()) ||
      [];
    if (tables.length === 0) {
      return;
    }

    // Ensure config section (bankroll, kelly fraction) is injected so Stake Allowed can be calculated
    if (window.betIQ.debouncedAddConfigSection) {
      window.betIQ.debouncedAddConfigSection();
    }
    // Ensure plugin columns (Kelly, Allocation, Monitor, ID) are injected before matching/ID assignment
    if (window.betIQ.addKellyStakeColumn) {
      window.betIQ.addKellyStakeColumn();
    }

    // Run selector validation on first call or when errors occur
    // But only store errors if we actually can't find valid rows after processing
    if (!window.betIQ._selectorValidationRun) {
      window.betIQ._selectorValidationRun = true;
      // Don't validate immediately - wait to see if we can process rows
    }

    let matchedCount = 0;
    const betIdMap = new Map();
    let hasDuplicateIds = false;
    let missingIdRows = [];
    let duplicateRows = []; // Track rows that matched but are duplicates
    let totalDataRows = 0;

    tables.forEach((table) => {
      const dataRows = Array.from(window.betIQ.getDataRows(table)).filter(
        (row) => {
          const hasTh = row.querySelectorAll(headerCellSel).length > 0;
          const hasTd = row.querySelectorAll(dataCellSel).length > 0;
          const cellCount = row.querySelectorAll(dataCellSel).length;
          // Filter out header rows and rows with insufficient cells (< 9 required for matching)
          var minC = window.betIQ.getMinDataRowCells
            ? window.betIQ.getMinDataRowCells()
            : 9;
          return hasTd && !hasTh && cellCount >= minC;
        }
      );

      totalDataRows += dataRows.length;

      dataRows.forEach((row) => {
        const existingId = row.getAttribute("data-id") || row.id;

        if (existingId) {
          // Row already has ID, check for duplicates
          if (betIdMap.has(existingId)) {
            hasDuplicateIds = true;
            console.error(
              `[betIQ-Plugin] ⚠️ DUPLICATE ID DETECTED!`,
              `bet_id: ${existingId}`
            );
          } else {
            betIdMap.set(existingId, row);
          }

          // Update ID cell if it exists
          const idCell = row.querySelector(idCellSel);
          if (idCell && existingId) {
            updateIdCell(idCell, existingId, row);
          }
          return;
        }

        // Try to match and assign ID
        const matchedBet =
          window.betIQ.matchRowWithData &&
          window.betIQ.matchRowWithData(row, capturedBettingData);

        if (matchedBet) {
          const betId =
            matchedBet.bet_id ||
            matchedBet.id ||
            matchedBet.bet_key ||
            (matchedBet.game && matchedBet.player && matchedBet.prop
              ? `${matchedBet.game}_${matchedBet.player}_${matchedBet.prop}`
              : null);

          if (!betId) {
            if (window.betiqDebugEnabled) {
              console.warn(
                "[betIQ-Plugin] Matched bet has no ID field:",
                matchedBet,
                "Available fields:",
                Object.keys(matchedBet)
              );
            }
            missingIdRows.push(row);
            return;
          }

          // Check for duplicate ID
          if (betIdMap.has(betId)) {
            hasDuplicateIds = true;
            const existingRow = betIdMap.get(betId);
            duplicateRows.push({
              row,
              betId,
              existingRow,
            });
            // Don't log every duplicate - just track them for summary
            // Don't add to missingIdRows - it's a duplicate, not truly missing
            return;
          }

          // Add data-id attribute
          row.setAttribute("data-id", betId);
          betIdMap.set(betId, row);
          matchedCount++;

          // Update ID cell if it exists
          const idCell = row.querySelector(idCellSel);
          if (idCell) {
            updateIdCell(idCell, betId, row);
          }
        } else {
          missingIdRows.push(row);
          if (window.betiqDebugEnabled) {
            const extractCellText = window.betIQ.extractCellText;
            const cells = row.querySelectorAll(dataCellSel);
            const col = config.columnIndices || {
              game: 3,
              gameTime: 4,
              player: 5,
              betType: 6,
              prop: 8,
            };
            var minC = window.betIQ.getMinDataRowCells
              ? window.betIQ.getMinDataRowCells()
              : 9;
            if (cells.length >= minC) {
              console.log(
                "[betIQ-Plugin] Could not match row:",
                'Game: "' + extractCellText(cells[col.game]) + '"',
                'Player: "' + extractCellText(cells[col.player]) + '"',
                'Prop: "' + extractCellText(cells[col.prop]) + '"',
                'Bet Type: "' + extractCellText(cells[col.betType]) + '"',
                'Game Time: "' + extractCellText(cells[col.gameTime]) + '"'
              );
            }
          }
        }
      });
    });

    // After processing all tables, validate selectors if we found rows
    // This ensures validation runs when table is actually ready
    if (totalDataRows > 0 && !window.betIQ._selectorValidationCompleted) {
      const diagnostics = window.betIQ.validateSelectors();
      if (!diagnostics.isValid || diagnostics.errors.length > 0) {
        // Only log if we actually have a problem (no valid rows found in validation)
        if (diagnostics.tableStructure.dataRowCount === 0) {
          window.betIQ.logSelectorDiagnostics(diagnostics);
          window.betIQ._lastSelectorDiagnostics = diagnostics;
        }
      }
      window.betIQ._selectorValidationCompleted = true;
    }

    // If we successfully processed rows, clear any previous validation errors
    if (totalDataRows > 0 && window.betIQ._lastSelectorDiagnostics) {
      // Clear validation errors if we successfully processed rows
      if (
        window.betIQ._lastSelectorDiagnostics.tableStructure.dataRowCount === 0
      ) {
        window.betIQ._lastSelectorDiagnostics = null;
      }
    }

    // Show error if needed
    if (missingIdRows.length > 0 || hasDuplicateIds) {
      // Detect bookie mismatch whenever we have missing rows (so we can suppress banner and noisy logs)
      let isLikelyBookieMismatch = false;
      if (missingIdRows.length > 0 && capturedBettingData.length > 0) {
        const colB = config.columnIndices || {};
        const bookieIndicesB = colB.bookieIndices || [1];
        const extractCellTextB =
          window.betIQ.extractCellText ||
          ((c) => c && (c.textContent || c.innerText || "").trim());
        const normalizeTextB =
          window.betIQ.normalizeText || ((s) => (s || "").toLowerCase().trim());
        let tableBookieSampleB = null;
        const firstRowB = missingIdRows[0];
        const cellsB = firstRowB.querySelectorAll(dataCellSel);
        for (const idx of bookieIndicesB) {
          if (idx < cellsB.length) {
            const t = normalizeTextB(extractCellTextB(cellsB[idx]));
            if (t) {
              tableBookieSampleB = t;
              break;
            }
          }
        }
        const apiBookieSampleB = normalizeTextB(
          capturedBettingData[0].bookie ||
            capturedBettingData[0].bookmaker ||
            capturedBettingData[0].book ||
            (capturedBettingData[0].book_id != null
              ? String(capturedBettingData[0].book_id)
              : "")
        );
        isLikelyBookieMismatch =
          !!tableBookieSampleB &&
          !!apiBookieSampleB &&
          tableBookieSampleB !== apiBookieSampleB &&
          !tableBookieSampleB.includes(apiBookieSampleB) &&
          !apiBookieSampleB.includes(tableBookieSampleB);
      }

      let errorMessage = "⚠️ Row Identifier Issue Detected: ";

      if (missingIdRows.length > 0 && hasDuplicateIds) {
        errorMessage += `${missingIdRows.length} row(s) missing ID(s) and ${duplicateRows.length} duplicate row(s) detected. `;
        errorMessage += `Duplicates occur when multiple table rows match the same API record (bet_id).`;
      } else if (missingIdRows.length > 0) {
        errorMessage += `${missingIdRows.length} row(s) missing ID(s). `;

        // Check if API data is available
        if (capturedBettingData.length === 0) {
          errorMessage +=
            "\n\n⚠️ NO API DATA CAPTURED - Extension may not be intercepting API calls!";
          errorMessage += "\nCheck console for API interception status.";
        } else {
          errorMessage += `\n\n📊 API Data: ${capturedBettingData.length} records available`;
          errorMessage +=
            "\nRun window.betIQ.diagnoseMatching() to see why rows aren't matching";
        }
      } else if (hasDuplicateIds) {
        errorMessage += `${duplicateRows.length} duplicate row(s) detected. `;
        errorMessage += `Multiple table rows match the same API record. Only the first occurrence gets an ID.`;
      }

      // Check for selector issues and add to error message
      if (window.betIQ._lastSelectorDiagnostics) {
        const diagnostics = window.betIQ._lastSelectorDiagnostics;
        if (!diagnostics.isValid || diagnostics.errors.length > 0) {
          errorMessage +=
            "\n\n🔍 SELECTOR VALIDATION FAILED - Website structure may have changed!";
          errorMessage += "\nCheck console for detailed diagnostics:";
          errorMessage +=
            "\n  - window.betIQ.diagnoseMatching() - Compare API data with table rows";
          errorMessage +=
            "\n  - window.betIQ.logSelectorDiagnostics() - Full validation report";
          errorMessage +=
            "\n  - window.betIQ.inspectTableStructure() - Inspect all tables on page";

          // Add specific errors
          diagnostics.errors.forEach((error) => {
            errorMessage += `\n${error}`;
          });
        }
      }

      // Re-run validation only when >50% fail and NOT bookie mismatch
      if (
        missingIdRows.length > 0 &&
        totalDataRows > 0 &&
        missingIdRows.length > totalDataRows * 0.5 &&
        !isLikelyBookieMismatch
      ) {
        console.warn(
          "[betIQ-Plugin] ⚠️ More than 50% of rows failed to match - possible selector mismatch!"
        );
        const diagnostics = window.betIQ.validateSelectors();
        window.betIQ.logSelectorDiagnostics(diagnostics);
        window.betIQ._lastSelectorDiagnostics = diagnostics;
      }

      // Only show error bar in debug mode; do not show when the only issue is bookie mismatch (expected)
      if (
        window.betIQ.showRowIdError &&
        window.betiqDebugEnabled &&
        !isLikelyBookieMismatch
      ) {
        window.betIQ.showRowIdError(errorMessage);
      }

      // Report duplicates separately from missing rows (only once per table generation cycle)
      if (duplicateRows.length > 0 && !window.betIQ._duplicatesReported) {
        console.warn(
          `[betIQ-Plugin] ℹ️ ${duplicateRows.length} duplicate row(s) detected - multiple table rows match the same API record. Only the first occurrence gets an ID.`
        );
        if (window.betiqDebugEnabled) {
          console.group("[betIQ-Plugin] Duplicate Rows (First 5):");
          const colDup = config.columnIndices || {
            game: 3,
            player: 5,
            prop: 8,
          };
          duplicateRows.slice(0, 5).forEach((dup, idx) => {
            const cells = dup.row.querySelectorAll(dataCellSel);
            const extractCellText =
              window.betIQ.extractCellText ||
              ((cell) => (cell?.textContent || "").trim());
            console.log("Duplicate " + (idx + 1) + ":", {
              bet_id: dup.betId,
              game: extractCellText(cells[colDup.game]),
              player: extractCellText(cells[colDup.player]),
              prop: extractCellText(cells[colDup.prop]),
            });
          });
          console.groupEnd();
        }
        // Mark as reported to avoid spam on subsequent calls
        window.betIQ._duplicatesReported = true;
        // Reset after 5 seconds in case table updates
        setTimeout(() => {
          window.betIQ._duplicatesReported = false;
        }, 5000);
      }

      if (missingIdRows.length > 0 && !isLikelyBookieMismatch) {
        console.warn(
          `[betIQ-Plugin] ⚠️ ${missingIdRows.length} row(s) without ID (truly unmatched):`,
          missingIdRows
        );

        // Log detailed diagnostics when many rows fail or debug is on
        const showFailedAnalysis =
          window.betiqDebugEnabled ||
          (totalDataRows > 0 && missingIdRows.length > totalDataRows * 0.5);
        if (showFailedAnalysis && missingIdRows.length > 0) {
          const col = config.columnIndices || {
            game: 3,
            gameTime: 4,
            player: 5,
            betType: 6,
            prop: 8,
          };
          const extractCellText =
            window.betIQ.extractCellText ||
            ((cell) =>
              cell && (cell.textContent || cell.innerText || "").trim());
          console.group("[betIQ-Plugin] Failed Row Analysis");
          console.log(
            "[betIQ-Plugin] Host:",
            typeof window !== "undefined" && window.location
              ? window.location.hostname
              : ""
          );
          console.log(
            "[betIQ-Plugin] columnIndices in use:",
            JSON.stringify(col)
          );
          missingIdRows.slice(0, 3).forEach((row, idx) => {
            const cells = row.querySelectorAll(dataCellSel);
            const cellTexts = Array.from(cells).map((c) =>
              (extractCellText(c) || "").substring(0, 50)
            );
            console.log(
              `[betIQ-Plugin] Row ${idx + 1} cell texts [0..${
                cellTexts.length - 1
              }]:`,
              cellTexts
            );
            console.log(
              `[betIQ-Plugin] Row ${idx + 1} extracted for matching:`,
              {
                game: col.game != null ? cellTexts[col.game] : "(no index)",
                gameTime:
                  col.gameTime != null ? cellTexts[col.gameTime] : "(no index)",
                player:
                  col.player != null ? cellTexts[col.player] : "(no index)",
                betType:
                  col.betType != null ? cellTexts[col.betType] : "(no index)",
                prop: col.prop != null ? cellTexts[col.prop] : "(no index)",
              }
            );
          });
          if (capturedBettingData && capturedBettingData.length > 0) {
            console.log(
              "[betIQ-Plugin] API sample (first 2 records - fields used for matching):"
            );
            capturedBettingData.slice(0, 2).forEach((bet, idx) => {
              const apiGame =
                bet.game || bet.game_name || bet.match || bet.matchup || "";
              const apiPlayer =
                bet.player || bet.player_name || bet.athlete || "";
              const apiProp = bet.prop || bet.prop_type || bet.stat_type || "";
              const apiBetType =
                bet.bet_type || bet.type || bet.direction || "";
              const apiBookie = bet.bookie || bet.bookmaker || bet.book || "";
              console.log(`[betIQ-Plugin] API record ${idx + 1}:`, {
                game: apiGame,
                player: apiPlayer,
                prop: apiProp,
                bet_type: apiBetType,
                bookie: apiBookie,
                bet_id: bet.bet_id || bet.id,
              });
            });
            const first = capturedBettingData[0];
            const hasEmpty =
              !(
                first.game ||
                first.game_name ||
                first.match ||
                first.matchup
              ) ||
              !(first.prop || first.prop_type || first.stat_type) ||
              !(first.bet_type || first.type || first.direction);
            if (hasEmpty) {
              console.log(
                "[betIQ-Plugin] API record 1 – all keys (for mapping):",
                Object.keys(first)
              );
              console.log("[betIQ-Plugin] API record 1 – full:", first);
            }
          } else {
            console.log(
              "[betIQ-Plugin] No captured API data - cannot compare with table."
            );
          }
          console.groupEnd();
        }
      }
    } else {
      // Remove error bar if everything is OK
      const existingError = document.getElementById(duplicateErrorId);
      if (existingError) {
        existingError.remove();
      }
    }

    if (matchedCount > 0 && window.betiqDebugEnabled) {
      console.log(`[betIQ-Plugin] Matched ${matchedCount} rows with IDs`);
    }

    // Recalculate stake amounts after IDs are assigned
    if (window.betIQ.recalculateStakeAmounts) {
      window.betIQ.recalculateStakeAmounts();
    }

    // Update allocation cells after IDs are assigned
    if (window.betIQ.updateAllocationCells) {
      window.betIQ.updateAllocationCells();
    }
  };
})();
