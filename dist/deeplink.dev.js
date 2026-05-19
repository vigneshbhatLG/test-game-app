"use strict";

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

(function () {
  "use strict";

  var LEVEL_METADATA = Object.freeze({
    1: {
      title: "Level 1"
    },
    2: {
      title: "Level 2"
    },
    3: {
      title: "Level 3"
    },
    4: {
      title: "Level 4"
    },
    5: {
      title: "Level 5"
    }
  });
  var CONTENT_ID_LOOKUP = Object.freeze({
    level1: 1,
    level2: 2,
    level3: 3,
    level4: 4,
    level5: 5,
    pacman_level_1: 1,
    pacman_level_2: 2,
    pacman_level_3: 3,
    pacman_level_4: 4,
    pacman_level_5: 5,
    lvl1: 1,
    lvl2: 2,
    lvl3: 3,
    lvl4: 4,
    lvl5: 5,
    stage1: 1,
    stage2: 2,
    stage3: 3,
    stage4: 4,
    stage5: 5,
    boss_level: 5,
    final_boss: 5
  });

  var levels = require("./levels.json"); // Declare loadLevel function at the top to ensure it is accessible


  function loadLevel(contentId) {
    if (levels[contentId]) {
      var level = levels[contentId];
      console.log("Loading ".concat(level.name, " (Difficulty: ").concat(level.difficulty, ")")); // Add logic to load the level
    } else if (contentId.startsWith("level")) {
      var levelNumber = contentId.replace("level", "");
      console.log("Loading Level ".concat(levelNumber)); // Add logic to load the level dynamically
    } else if (contentId.startsWith("boss")) {
      console.log("Loading Boss Fight: ".concat(contentId)); // Add logic for boss fights
    } else {
      console.error("Invalid contentId:", contentId); // Handle invalid contentId
    }
  }

  function safePreview(value) {
    if (typeof value === "undefined") {
      return "undefined";
    }

    if (value === null) {
      return "null";
    }

    if (typeof value === "string") {
      return value.trim() || "empty string";
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function parseLaunchPayload(rawValue) {
    if (!rawValue) {
      return {};
    }

    if (typeof rawValue === "number") {
      return {
        contentId: "level".concat(rawValue)
      };
    }

    if (_typeof(rawValue) === "object") {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      var text = rawValue.trim();

      if (!text) {
        return {};
      }

      try {
        var parsed = JSON.parse(text);

        if (typeof parsed === "string") {
          return {
            contentId: parsed.trim()
          };
        }

        if (typeof parsed === "number") {
          return {
            contentId: "level".concat(parsed)
          };
        }

        if (parsed && _typeof(parsed) === "object") {
          return parsed;
        }

        return {
          contentId: text
        };
      } catch (error) {
        var querySource = text.includes("?") ? text.slice(text.indexOf("?") + 1) : text;
        var queryOnly = querySource.includes("#") ? querySource.slice(0, querySource.indexOf("#")) : querySource;
        var params = new URLSearchParams(queryOnly.startsWith("?") ? queryOnly.slice(1) : queryOnly);
        var contentId = params.get("contentId");

        if (contentId) {
          return {
            contentId: contentId
          };
        }

        var contentIdLower = params.get("contentid");

        if (contentIdLower) {
          return {
            contentId: contentIdLower
          };
        }

        var content = params.get("content");

        if (content) {
          return {
            contentId: content
          };
        }

        var level = params.get("level");

        if (level) {
          return {
            contentId: level
          };
        }

        var _levels = params.get("levels");

        if (_levels) {
          return {
            contentId: _levels
          };
        }

        return {
          contentId: text
        };
      }
    }

    return {};
  }

  function sanitizeContentToken(value) {
    var text = String(value || "").trim();

    if (!text) {
      return "";
    }

    var singleQuoted = text.startsWith("'") && text.endsWith("'") && text.length >= 2;
    var doubleQuoted = text.startsWith('"') && text.endsWith('"') && text.length >= 2;
    return (singleQuoted || doubleQuoted ? text.slice(1, -1) : text).trim();
  }

  function extractContentIdFromRawText(rawPayload) {
    var preview = safePreview(rawPayload);

    if (!preview || preview === "undefined" || preview === "null") {
      return "";
    }

    var lower = preview.toLowerCase();
    var keyValue = lower.match(/(?:contentid|content_id|level|levels|lvl|stage)\s*["':=_-]+\s*(?:level|levels|lvl|stage)?_?(\d+)/);

    if (keyValue) {
      return "level".concat(keyValue[1]);
    }

    var compactLevel = lower.match(/\b(?:level|levels|lvl|stage)[_\-\s:]?(\d+)\b/);

    if (compactLevel) {
      return "level".concat(compactLevel[1]);
    }

    var urlLike = lower.match(/[?&](?:contentid|content_id|level|levels|lvl|stage)=([^&#\s"]+)/);

    if (urlLike && urlLike[1]) {
      return urlLike[1].trim();
    }

    return "";
  }

  function extractContentId(payload) {
    if (!payload || _typeof(payload) !== "object") {
      return "";
    }

    var deeplinkParams = payload.deeplinkingParams || payload.params && payload.params.deeplinkingParams || payload.replaceParams && payload.replaceParams.deeplinkingParams || payload.params && payload.params.replaceParams && payload.params.replaceParams.deeplinkingParams;

    if (deeplinkParams && _typeof(deeplinkParams) === "object") {
      if (typeof deeplinkParams.contentId === "string" && deeplinkParams.contentId.trim()) {
        return deeplinkParams.contentId.trim();
      }

      if (typeof deeplinkParams.levels === "string" && deeplinkParams.levels.trim()) {
        return deeplinkParams.levels.trim();
      }

      if (typeof deeplinkParams.levels === "number") {
        return "level".concat(deeplinkParams.levels);
      }

      if (typeof deeplinkParams.value === "string" && deeplinkParams.value.trim()) {
        var target = typeof deeplinkParams.target === "string" ? deeplinkParams.target.trim().toLowerCase() : "";

        if (!target || target === "contentid" || target === "$contentid" || target === "level" || target === "$level" || target === "levels" || target === "$levels") {
          return deeplinkParams.value.trim();
        }
      }
    }

    var candidates = [payload.contentId, payload.contentID, payload.contentid, payload.content, payload.query, payload.uri, payload.url, payload.levels, payload.levelsId, payload.levelsID, payload.replaceParams && payload.replaceParams.contentId, payload.replaceParams && payload.replaceParams.contentid, payload.replaceParams && payload.replaceParams.content, payload.replaceParams && payload.replaceParams.levels, payload.replaceParams && payload.replaceParams.levelsId, payload.replaceParams && payload.replaceParams.levelId, payload.replaceParams && payload.replaceParams.level, payload.levelId, payload.levelID, payload.level, payload.params && payload.params.level, payload.params && payload.params.levels, payload.params && payload.params.levelsId, payload.id, payload.target, payload.content && payload.content.id, payload.params && payload.params.content, payload.params && payload.params.contentId, payload.params && payload.params.contentid, payload.params && payload.params.levelId, payload.params && payload.params.query, payload.params && payload.params.url, payload.params && payload.params.uri];

    for (var _i = 0, _candidates = candidates; _i < _candidates.length; _i++) {
      var value = _candidates[_i];

      if (typeof value === "number" && Number.isFinite(value)) {
        return "level".concat(value);
      }

      if (typeof value === "string" && value.trim()) {
        var text = value.trim();

        if (text.toLowerCase() === "level" || text.toLowerCase() === "levels") {
          continue;
        }

        return text;
      }
    }

    if (typeof payload.level === "number") {
      return "level".concat(payload.level);
    }

    if (typeof payload.levels === "number") {
      return "level".concat(payload.levels);
    }

    if (typeof payload.level === "string" && payload.level.trim()) {
      var levelText = payload.level.trim();

      if (/^\d+$/.test(levelText)) {
        return "level".concat(levelText);
      }

      return levelText;
    }

    if (typeof payload.levels === "string" && payload.levels.trim()) {
      var levelsText = payload.levels.trim();

      if (/^\d+$/.test(levelsText)) {
        return "level".concat(levelsText);
      }

      if (/^levels?(\d+)$/.test(levelsText.toLowerCase())) {
        var match = levelsText.toLowerCase().match(/^levels?(\d+)$/);
        return "level".concat(match[1]);
      }

      return levelsText;
    }

    return "";
  }

  function resolveContentIdToLevel(contentId, maxLevel, levelLookup) {
    var normalized = sanitizeContentToken(contentId).toLowerCase().replace(/[\s-]+/g, "_");

    if (!normalized) {
      return {
        ok: false,
        errorText: "contentId is missing"
      };
    }

    if (/^\d+$/.test(normalized)) {
      var requestedLevel = Number(normalized);

      if (requestedLevel >= 1 && requestedLevel <= maxLevel) {
        return {
          ok: true,
          level: requestedLevel,
          title: "Level ".concat(requestedLevel),
          contentId: "level".concat(requestedLevel)
        };
      }

      return {
        ok: false,
        errorText: "Requested level".concat(requestedLevel, ", but only level1 to level").concat(maxLevel, " exist")
      };
    }

    if (levelLookup[normalized]) {
      var mappedLevel = levelLookup[normalized];
      var metadata = LEVEL_METADATA[mappedLevel] || {
        title: "Level ".concat(mappedLevel)
      };
      return {
        ok: true,
        level: mappedLevel,
        title: metadata.title,
        contentId: normalized
      };
    }

    var levelMatch = normalized.match(/^level_?(\d+)$/);

    if (levelMatch) {
      var _requestedLevel = Number(levelMatch[1]);

      if (_requestedLevel >= 1 && _requestedLevel <= maxLevel) {
        return {
          ok: true,
          level: _requestedLevel,
          title: "Level ".concat(_requestedLevel),
          contentId: normalized
        };
      }

      return {
        ok: false,
        errorText: "Requested ".concat(normalized, ", but only level1 to level").concat(maxLevel, " exist")
      };
    }

    var levelsMatch = normalized.match(/^levels?_?(\d+)$/);

    if (levelsMatch) {
      var _requestedLevel2 = Number(levelsMatch[1]);

      if (_requestedLevel2 >= 1 && _requestedLevel2 <= maxLevel) {
        return {
          ok: true,
          level: _requestedLevel2,
          title: "Level ".concat(_requestedLevel2),
          contentId: "level".concat(_requestedLevel2)
        };
      }

      return {
        ok: false,
        errorText: "Requested ".concat(normalized, ", but only level1 to level").concat(maxLevel, " exist")
      };
    }

    var keyValueLevelMatch = normalized.match(/^(contentid|level|levels|lvl|stage)\s*[:=_]\s*(\d+)$/);

    if (keyValueLevelMatch) {
      var _requestedLevel3 = Number(keyValueLevelMatch[2]);

      if (_requestedLevel3 >= 1 && _requestedLevel3 <= maxLevel) {
        return {
          ok: true,
          level: _requestedLevel3,
          title: "Level ".concat(_requestedLevel3),
          contentId: "level".concat(_requestedLevel3)
        };
      }

      return {
        ok: false,
        errorText: "Requested level".concat(_requestedLevel3, ", but only level1 to level").concat(maxLevel, " exist")
      };
    }

    return {
      ok: false,
      errorText: "Unknown contentId: ".concat(contentId)
    };
  }

  function create(options) {
    var config = options || {};
    var maxLevel = Number(config.maxLevel) || 5;
    var levelLookup = config.levelLookup && _typeof(config.levelLookup) === "object" ? config.levelLookup : CONTENT_ID_LOOKUP;
    var startNewGame = typeof config.startNewGame === "function" ? config.startNewGame : function () {};
    var onInvalid = typeof config.onInvalid === "function" ? config.onInvalid : function () {};
    var onObserved = typeof config.onObserved === "function" ? config.onObserved : function () {};
    var onSuccess = typeof config.onSuccess === "function" ? config.onSuccess : function () {};
    var lastAppliedSignature = "";

    function makeSignature(contentId, source) {
      return "".concat(source, "::").concat(String(contentId || "").trim().toLowerCase());
    }

    function applyDeeplinkPayload(rawPayload, source) {
      console.log("[DeepLink] START: Applying payload from ".concat(source));
      console.log("[DeepLink] Raw payload:", rawPayload);
      onObserved({
        source: source,
        summary: safePreview(rawPayload)
      });
      var payload = parseLaunchPayload(rawPayload);
      console.log("[DeepLink] Parsed payload:", payload);
      var contentId = extractContentId(payload);
      console.log("[DeepLink] Extracted contentId:", contentId);
      var fallbackContentId = !contentId ? extractContentIdFromRawText(rawPayload) : "";
      console.log("[DeepLink] Fallback contentId:", fallbackContentId);
      var resolvedContentId = contentId || fallbackContentId;
      console.log("[DeepLink] Resolved contentId:", resolvedContentId);

      if (!resolvedContentId) {
        console.warn("[DeepLink] No valid contentId resolved from payload.");
        return {
          handled: false,
          source: source,
          summary: safePreview(payload)
        };
      }

      loadLevel(resolvedContentId);
      var signature = makeSignature(resolvedContentId, source);
      console.log("[DeepLink] Generated signature:", signature);

      if (signature === lastAppliedSignature) {
        console.log("[DeepLink] Duplicate payload detected, skipping.");
        return {
          handled: true,
          success: true,
          source: source,
          contentId: resolvedContentId,
          skipped: true,
          reason: "duplicate payload"
        };
      }

      var resolved = resolveContentIdToLevel(resolvedContentId, maxLevel, levelLookup);
      console.log("[DeepLink] Resolved level details:", resolved);

      if (!resolved.ok) {
        console.warn("[DeepLink] Invalid contentId from ".concat(source, ":"), resolvedContentId, resolved.errorText);
        var _result = {
          handled: true,
          success: false,
          source: source,
          contentId: resolvedContentId,
          errorText: resolved.errorText
        };
        onInvalid(_result);
        return _result;
      }

      console.log("[DeepLink] SUCCESS: ".concat(source, " -> ").concat(resolvedContentId, " resolved to level ").concat(resolved.level));
      debugger; // Pause execution for debugging

      lastAppliedSignature = signature;
      startNewGame(resolved.level);
      var result = {
        handled: true,
        success: true,
        source: source,
        contentId: resolvedContentId,
        level: resolved.level,
        title: resolved.title
      };
      onSuccess(result);
      return result;
    }

    function collectLaunchParamCandidates() {
      var candidates = [];

      if (typeof window !== "undefined") {
        if (window.PalmSystem && typeof window.PalmSystem.launchParams !== "undefined") {
          candidates.push({
            source: "PalmSystem.launchParams",
            value: window.PalmSystem.launchParams
          });
        }

        if (window.webOS && typeof window.webOS.launchParams !== "undefined") {
          candidates.push({
            source: "webOS.launchParams",
            value: window.webOS.launchParams
          });
        }

        if (window.webOSDev && typeof window.webOSDev.launchParams !== "undefined") {
          candidates.push({
            source: "webOSDev.launchParams",
            value: window.webOSDev.launchParams
          });
        }

        if (typeof window.launchParams !== "undefined") {
          candidates.push({
            source: "window.launchParams",
            value: window.launchParams
          });
        }
      }

      return candidates;
    }

    function tryApplyInitialLaunchParams() {
      var candidates = collectLaunchParamCandidates();

      if (candidates.length === 0) {
        onObserved({
          source: "initial-launch",
          summary: "no launchParams source found"
        });
        return {
          handled: false,
          source: "initial-launch"
        };
      }

      var lastResult = {
        handled: false,
        source: "initial-launch"
      };
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = candidates[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var candidate = _step.value;
          lastResult = applyDeeplinkPayload(candidate.value, candidate.source);

          if (lastResult && lastResult.handled) {
            return lastResult;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return lastResult;
    }

    function startLaunchParamPolling() {
      if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
        return;
      }

      var attempt = 0;
      var maxAttempts = 12;

      function poll() {
        attempt += 1;
        var result = tryApplyInitialLaunchParams();

        if (result && result.handled) {
          return;
        }

        if (attempt < maxAttempts) {
          window.setTimeout(poll, 500);
        }
      }

      window.setTimeout(poll, 250);
    }

    function registerRelaunchLaunchParamHandler() {
      if (typeof document === "undefined") {
        return;
      }

      ["webOSRelaunch", "webOSLaunch"].forEach(function (eventName) {
        document.addEventListener(eventName, function (event) {
          if (typeof window !== "undefined" && window.PalmSystem && typeof window.PalmSystem.activate === "function") {
            try {
              window.PalmSystem.activate();
            } catch (error) {
              onObserved({
                source: "".concat(eventName, ".activate"),
                summary: safePreview(error && error.message ? error.message : error)
              });
            }
          }

          var detail = event && event.detail ? event.detail : {};
          var rawPayload = detail.launchParams || detail.params || detail;
          applyDeeplinkPayload(rawPayload, eventName);
        });
      });
    }

    return {
      applyDeeplinkPayload: applyDeeplinkPayload,
      tryApplyInitialLaunchParams: tryApplyInitialLaunchParams,
      registerRelaunchLaunchParamHandler: registerRelaunchLaunchParamHandler,
      startLaunchParamPolling: startLaunchParamPolling
    };
  } // Allow manual deeplink testing from the browser console.


  function simulateDeeplink(contentId) {
    var deeplinkPayload = String(contentId || "").trim();
    var activeApi = typeof window !== "undefined" && window.packmanDeeplinkApi && typeof window.packmanDeeplinkApi.applyDeeplinkPayload === "function" ? window.packmanDeeplinkApi : null;

    if (!activeApi) {
      var _result2 = {
        handled: false,
        success: false,
        errorText: "Active deeplink API not initialized yet"
      };
      console.error("Failed to trigger deeplink:", _result2.errorText);
      return _result2;
    }

    var result = activeApi.applyDeeplinkPayload(deeplinkPayload, "simulateDeeplink");

    if (result.success) {
      console.log("Deeplink successfully triggered:", result);
    } else {
      console.error("Failed to trigger deeplink:", result.errorText);
    }

    return result;
  } // Expose the simulateDeeplink function globally for console usage


  window.simulateDeeplink = simulateDeeplink;
  window.PackManDeeplink = {
    create: create
  };
})();
//# sourceMappingURL=deeplink.dev.js.map
