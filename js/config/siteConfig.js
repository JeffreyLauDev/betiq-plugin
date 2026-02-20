// Centralized site configuration - one place for endpoints, selectors, column indices
// Using global namespace for Chrome extension compatibility

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  var SITE_CONFIG = {
    "betiq.vercel.app": {
      apiInterceptEndpoint: "betting_alerts",
      apiInterceptBaseUrl: "https://swryqkixpqhvuagnqqul.supabase.co/rest/v1",
      tableSelector: "table",
      tableContainerSelector: null,
      dataRowSelector: "tbody tr, table > tr",
      columnIndices: {
        game: 3,
        gameTime: 4,
        player: 5,
        betType: 6,
        prop: 8,
        confidence: 18,
        bookieIndices: [0, 1, 2, 7, 9, 10, 11, 12],
      },
      configSectionSelector: "main > main > div > div:nth-child(2)",
      configSectionFallbackSelector: "main",
      pluginColumnsInsertBeforeIndex: 10,
      headerRowSelector: "thead tr, tr:first-child",
      rowCheckboxSelector: 'button[role="checkbox"]',
      allRowsSelector: "tr",
      headerCellSelector: "th",
      dataCellSelector: "td",
      rowCellSelector: "td, th",
      betiqCellsSelector: "[data-betiq-column], [data-betiq-cell]",
      betiqSelectors: {
        kellyStakeCell: "[data-betiq-cell='kelly-stake']",
        kellyStakeColumn: "[data-betiq-column='kelly-stake']",
        allocationCell: "[data-betiq-cell='allocation']",
        allocationColumn: "[data-betiq-column='allocation']",
        monitorCell: "[data-betiq-cell='monitor']",
        monitorColumn: "[data-betiq-column='monitor']",
        idCell: "[data-betiq-cell='id']",
        idColumn: "[data-betiq-column='id']",
      },
      tbodySelector: "tbody",
      theadSelector: "thead",
      dataIdRowSelector: "tr[data-id]",
      duplicateIdErrorElementId: "betiq-duplicate-id-error",
      selectionOverlayHeaderSelector: "div:first-child",
    },
    "www.bet-iq.app": {
      apiInterceptEndpoint: "live_bets",
      apiInterceptBaseUrl: "https://ordcenhiggsmcjtzgjyb.supabase.co/rest/v1",
      skipAuthForColumnInject: true,
      tableSelector: null,
      tableContainerSelector: "#markets-tbody",
      dataRowSelector: "tr",
      columnIndices: {
        game: 2,
        gameTime: 3,
        player: 4,
        betType: 5,
        prop: 6,
        confidence: 10,
        bookieIndices: [1],
      },
      configSectionSelector: null,
      configSectionFallbackSelector: "main",
      pluginColumnsInsertBeforeIndex: 10,
      headerRowSelector: "thead tr, tr:first-child",
      rowCheckboxSelector: "input.bet-checkbox",
      allRowsSelector: "tr",
      dataIdRowSelector: "tr[data-id]",
    },
  };

  /**
   * Get site config for current hostname. Uses betiq.vercel.app as base; www.bet-iq.app (and any host) merges overrides on top. Unknown hosts get betiq.vercel.app.
   */
  window.betIQ.getSiteConfig = function () {
    var host =
      typeof window !== "undefined" && window.location
        ? window.location.hostname
        : "";
    var base = SITE_CONFIG["betiq.vercel.app"];
    var overrides = SITE_CONFIG[host];
    if (!overrides) return base;
    return Object.assign({}, base, overrides);
  };

  /**
   * Get the table element or table container (e.g. tbody#markets-tbody).
   * Returns the first matching element for the current site config.
   */
  window.betIQ.getTableOrContainer = function () {
    var config = window.betIQ.getSiteConfig();
    if (config.tableContainerSelector) {
      var el = document.querySelector(config.tableContainerSelector);
      if (el) return el;
    }
    if (config.tableSelector) {
      var table = document.querySelector(config.tableSelector);
      if (table) return table;
    }
    return document.querySelector(config.tableSelector || "table");
  };

  /**
   * Get all tables (or containers) for pages that have multiple. Used by tableGenerator diagnostics.
   */
  window.betIQ.getAllTablesOrContainers = function () {
    var config = window.betIQ.getSiteConfig();
    if (config.tableContainerSelector) {
      var el = document.querySelector(config.tableContainerSelector);
      if (el) return [el];
    }
    if (config.tableSelector) {
      return Array.from(document.querySelectorAll(config.tableSelector));
    }
    return Array.from(document.querySelectorAll("table"));
  };

  /**
   * Get data rows from a table or container element.
   * @param {Element} tableOrContainer - table or tbody/container element
   * @returns {Element[]}
   */
  window.betIQ.getDataRows = function (tableOrContainer) {
    if (!tableOrContainer) return [];
    var config = window.betIQ.getSiteConfig();
    var selector = config.dataRowSelector || "tbody tr, table > tr";
    return Array.from(tableOrContainer.querySelectorAll(selector));
  };

  /**
   * Get all rows (header + data) from a table or container. Uses config.allRowsSelector.
   */
  window.betIQ.getAllRows = function (tableOrContainer) {
    if (!tableOrContainer) return [];
    var config = window.betIQ.getSiteConfig();
    var selector =
      config.allRowsSelector != null ? config.allRowsSelector : "tr";
    return Array.from(tableOrContainer.querySelectorAll(selector));
  };

  /**
   * Minimum number of cells required in a data row for matching (derived from columnIndices).
   */
  window.betIQ.getMinDataRowCells = function () {
    var col = window.betIQ.getSiteConfig().columnIndices;
    var indices = [col.game, col.gameTime, col.player, col.betType, col.prop];
    if (col.confidence != null) indices.push(col.confidence);
    if (col.bookieIndices && col.bookieIndices.length)
      indices = indices.concat(col.bookieIndices);
    return indices.length ? Math.max.apply(null, indices) + 1 : 9;
  };

  /**
   * Check if URL is the target API endpoint for the current site.
   */
  window.betIQ.isTargetEndpointUrl = function (urlString) {
    if (!urlString) return false;
    var config = window.betIQ.getSiteConfig();
    var path = config.apiInterceptEndpoint || "betting_alerts";
    try {
      var decoded = decodeURIComponent(urlString);
      return decoded.indexOf(path) !== -1 || urlString.indexOf(path) !== -1;
    } catch (e) {
      return urlString.indexOf(path) !== -1;
    }
  };

  /**
   * Check if table injection is set up properly for the current site.
   * Run in console on the dashboard: window.betIQ.checkInjectionSetup()
   * Returns { ok, host, tableFound, dataRowCount, message } and logs a short report.
   */
  window.betIQ.checkInjectionSetup = function () {
    var host =
      typeof window !== "undefined" && window.location
        ? window.location.hostname
        : "";
    var config = window.betIQ.getSiteConfig();
    var table =
      window.betIQ.getTableOrContainer && window.betIQ.getTableOrContainer();
    var dataRows =
      table && window.betIQ.getDataRows ? window.betIQ.getDataRows(table) : [];
    var dataRowCount = Array.isArray(dataRows)
      ? dataRows.length
      : (dataRows && dataRows.length) || 0;
    var minCells = window.betIQ.getMinDataRowCells
      ? window.betIQ.getMinDataRowCells()
      : 9;
    var tableFound = !!table;
    var selectorUsed =
      config.tableContainerSelector || config.tableSelector || "table";
    var ok = tableFound && dataRowCount >= 0;
    var message = tableFound
      ? "Table/container found: " +
        selectorUsed +
        ", " +
        dataRowCount +
        " data row(s). Min cells required: " +
        minCells +
        "."
      : "Table/container NOT found (selector: " +
        selectorUsed +
        "). Check siteConfig for this host.";
    console.log("[betIQ-Plugin] Injection check:", message);
    if (!tableFound) {
      console.warn(
        "[betIQ-Plugin] Make sure the page has loaded and the element exists:",
        selectorUsed
      );
    }
    return {
      ok: ok,
      host: host,
      tableFound: tableFound,
      dataRowCount: dataRowCount,
      minCells: minCells,
      selector: selectorUsed,
      message: message,
    };
  };

  /**
   * Log column setup for the current site and sample the first data row so you can verify indices.
   * Run in console: window.betIQ.checkColumnSetup()
   * Returns { columnIndices, pluginColumnsInsertBeforeIndex, sampleRow, headerLabels }.
   */
  window.betIQ.checkColumnSetup = function () {
    var config = window.betIQ.getSiteConfig();
    var table =
      window.betIQ.getTableOrContainer && window.betIQ.getTableOrContainer();
    var dataRows =
      table && window.betIQ.getDataRows ? window.betIQ.getDataRows(table) : [];
    var dataRowsArr = Array.isArray(dataRows)
      ? dataRows
      : (dataRows && Array.from(dataRows)) || [];
    var col = config.columnIndices || {};
    var dataCellSel = config.dataCellSelector || "td";
    var headerCellSel = config.headerCellSelector || "th";
    var headerRowSelector = config.headerRowSelector;
    var root =
      table &&
      (table.tagName === "TABLE" ? table : table.parentElement || table);
    var headerRow =
      root && headerRowSelector ? root.querySelector(headerRowSelector) : null;
    var rowCellSel = config.rowCellSelector || "td, th";
    var headerLabels = [];
    if (headerRow) {
      var headerCells = headerRow.querySelectorAll(rowCellSel);
      headerLabels = Array.from(headerCells).map(function (c) {
        return (c.textContent || "").trim().substring(0, 25);
      });
    }
    var sampleRow = null;
    var sampleByIndex = {};
    if (dataRowsArr.length > 0) {
      var first = dataRowsArr[0];
      var cells = first.querySelectorAll(dataCellSel);
      for (var i = 0; i < cells.length; i++) {
        sampleByIndex[i] = (cells[i].textContent || "").trim().substring(0, 40);
      }
      sampleRow = sampleByIndex;
    }
    var out = {
      host:
        typeof window !== "undefined" && window.location
          ? window.location.hostname
          : "",
      columnIndices: col,
      pluginColumnsInsertBeforeIndex: config.pluginColumnsInsertBeforeIndex,
      insertBeforeColumnLabel:
        headerLabels[config.pluginColumnsInsertBeforeIndex] || "(no header)",
      headerLabels: headerLabels,
      sampleRowByIndex: sampleRow,
      mappedForMatching: sampleRow
        ? {
            game: sampleRow[col.game],
            gameTime: sampleRow[col.gameTime],
            player: sampleRow[col.player],
            prop: sampleRow[col.prop],
            betType: sampleRow[col.betType],
            confidence: sampleRow[col.confidence],
          }
        : null,
    };
    console.log("[betIQ-Plugin] Column setup:", out);
    return out;
  };
})();
