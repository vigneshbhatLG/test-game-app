"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");

if (!canvas || !ctx) {
  document.body.innerHTML += '<div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#1a1a1a;color:#fff;z-index:9999;display:grid;place-items:center;font-size:2rem;">Canvas not supported or failed to initialize.</div>';
  throw new Error("Canvas not supported or failed to initialize.");
} // Global error handler to show errors on screen


window.onerror = function (msg, url, line, col, error) {
  var message = msg + '\n' + (error && error.stack ? error.stack : 'at ' + url + ':' + line + ':' + col);
  document.body.innerHTML += "<div style=\"position:fixed;top:0;left:0;width:100vw;height:100vh;background:#b91c1c;color:#fff;z-index:9999;display:grid;place-items:center;font-size:1.2rem;padding:2rem;white-space:pre-wrap;\">JavaScript Error:<br>".concat(message, "</div>");
  requestRelaunch("Fatal JavaScript error");
  return false;
};

var scoreEl = document.getElementById("score");
var livesEl = document.getElementById("lives");
var highScoreEl = document.getElementById("high-score");
var levelEl = document.getElementById("level");
var overlayEl = document.getElementById("overlay");
var overlayTitleEl = document.getElementById("overlay-title");
var overlayMessageEl = document.getElementById("overlay-message");
var deeplinkStatusEl = document.getElementById("deeplink-status");
var TILE = 24;
var ROWS = 21;
var COLS = 28;
var MAX_LEVEL = 5;
var SERVICE_ID = "com.game.gamepac.service";
var SERVICE_PING_INTERVAL_MS = 20000;
var RELAUNCH_COOLDOWN_MS = 60000;
var serviceState = {
  consecutiveFailures: 0,
  relaunchCooldownUntil: 0,
  lastPingAt: 0,
  available: false
};
var deeplinkApi = null;

function setServiceStatus(text, isHealthy) {
  console.log("[Service] ".concat(text, " (").concat(isHealthy ? "healthy" : "unhealthy", ")"));
}

function setLunaEvent(text) {
  console.log("[Luna] ".concat(text));
}

function hasWebOSServiceBridge() {
  return typeof window !== "undefined" && window.webOS && window.webOS.service && typeof window.webOS.service.request === "function";
}

function hasPalmServiceBridge() {
  return typeof window !== "undefined" && typeof window.PalmServiceBridge === "function";
}

function getLunaBridgeType() {
  if (hasWebOSServiceBridge()) {
    return "webos";
  }

  if (hasPalmServiceBridge()) {
    return "palm";
  }

  return "none";
}

function hasLunaBridge() {
  var bridgeType = getLunaBridgeType();
  var available = bridgeType !== "none";

  if (!available) {
    setServiceStatus("bridge unavailable", false);
    setLunaEvent("No Luna bridge found (webOS.service and PalmServiceBridge unavailable)");
  } else {
    setLunaEvent("Luna bridge active: ".concat(bridgeType));
  }

  return available;
}

function lunaRequest(serviceId, method) {
  var parameters = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var timeoutMs = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 5000;
  return new Promise(function (resolve, reject) {
    var bridgeType = getLunaBridgeType();

    if (bridgeType === "none") {
      setLunaEvent("".concat(serviceId, "/").concat(method, " blocked - no bridge"));
      reject(new Error("Luna bridge not available in this runtime"));
      return;
    }

    var completed = false;
    var timeoutId = setTimeout(function () {
      if (!completed) {
        completed = true;
        setLunaEvent("".concat(serviceId, "/").concat(method, " timeout"));
        reject(new Error("Luna request timeout: ".concat(serviceId, "/").concat(method)));
      }
    }, timeoutMs);

    function finishSuccess(response) {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(timeoutId);
      setLunaEvent("".concat(serviceId, "/").concat(method, " success"));
      resolve(response);
    }

    function finishError(error) {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(timeoutId);
      setLunaEvent("".concat(serviceId, "/").concat(method, " failure: ").concat(error.message || error));
      reject(error instanceof Error ? error : new Error(String(error)));
    }

    try {
      if (bridgeType === "webos") {
        window.webOS.service.request("luna://".concat(serviceId), {
          method: "/".concat(method),
          parameters: parameters,
          onSuccess: function onSuccess(res) {
            if (res && res.returnValue === false) {
              finishError(new Error(res.errorText || res.errorMessage || "Luna request failed"));
              return;
            }

            finishSuccess(res || {});
          },
          onFailure: function onFailure(err) {
            finishError(new Error(err && (err.errorText || err.errorMessage) || "Luna transport failure"));
          }
        });
        setLunaEvent("".concat(serviceId, "/").concat(method, " request sent (webos bridge)"));
      } else {
        var bridge = new window.PalmServiceBridge();

        bridge.onservicecallback = function (responseText) {
          try {
            var response = typeof responseText === "string" ? JSON.parse(responseText) : responseText;

            if (response && response.returnValue === false) {
              finishError(new Error(response.errorText || response.errorMessage || "Luna request failed"));
              return;
            }

            finishSuccess(response || {});
          } catch (parseError) {
            finishError(new Error("Failed to parse service response: ".concat(parseError.message || parseError)));
          }
        };

        var uri = "luna://".concat(serviceId, "/").concat(method);
        bridge.call(uri, JSON.stringify(parameters || {}));
        setLunaEvent("".concat(serviceId, "/").concat(method, " request sent (PalmServiceBridge)"));
      }
    } catch (error) {
      finishError(error);
    }
  });
}

function requestRelaunch(reason) {
  var now;
  return regeneratorRuntime.async(function requestRelaunch$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          now = Date.now();

          if (!(now < serviceState.relaunchCooldownUntil)) {
            _context.next = 3;
            break;
          }

          return _context.abrupt("return");

        case 3:
          serviceState.relaunchCooldownUntil = now + RELAUNCH_COOLDOWN_MS;
          _context.prev = 4;
          _context.next = 7;
          return regeneratorRuntime.awrap(lunaRequest(SERVICE_ID, "relaunchGame", {
            reason: reason
          }, 5000));

        case 7:
          _context.next = 12;
          break;

        case 9:
          _context.prev = 9;
          _context.t0 = _context["catch"](4);
          console.warn("Relaunch request failed:", _context.t0.message || _context.t0);

        case 12:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[4, 9]]);
}

function checkServiceHealth() {
  return regeneratorRuntime.async(function checkServiceHealth$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          if (hasLunaBridge()) {
            _context2.next = 2;
            break;
          }

          return _context2.abrupt("return");

        case 2:
          _context2.prev = 2;
          _context2.next = 5;
          return regeneratorRuntime.awrap(lunaRequest(SERVICE_ID, "ping", {}, 3500));

        case 5:
          serviceState.available = true;
          serviceState.lastPingAt = Date.now();
          serviceState.consecutiveFailures = 0;
          setServiceStatus("connected", true);
          _context2.next = 18;
          break;

        case 11:
          _context2.prev = 11;
          _context2.t0 = _context2["catch"](2);
          serviceState.available = false;
          serviceState.consecutiveFailures += 1;
          setServiceStatus("disconnected (".concat(serviceState.consecutiveFailures, ")"), false);
          console.warn("Service health check failed:", _context2.t0.message || _context2.t0);

          if (serviceState.consecutiveFailures >= 3) {
            requestRelaunch("Service unreachable from game app");
            serviceState.consecutiveFailures = 0;
          }

        case 18:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[2, 11]]);
}

function startServiceMonitor() {
  if (!hasLunaBridge()) {
    setServiceStatus("bridge unavailable", false);
    return;
  }

  setServiceStatus("starting checks", true);
  checkServiceHealth();
  setInterval(checkServiceHealth, SERVICE_PING_INTERVAL_MS);
}

function pullTopHighScoreFromService() {
  var response, top;
  return regeneratorRuntime.async(function pullTopHighScoreFromService$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          if (hasLunaBridge()) {
            _context3.next = 2;
            break;
          }

          return _context3.abrupt("return");

        case 2:
          _context3.prev = 2;
          _context3.next = 5;
          return regeneratorRuntime.awrap(lunaRequest(SERVICE_ID, "getHighScores", {}, 4000));

        case 5:
          response = _context3.sent;
          top = response && Array.isArray(response.highScores) && response.highScores.length > 0 ? Number(response.highScores[0].score) : 0;

          if (Number.isFinite(top) && top > game.highScore) {
            game.highScore = top;
            setStoredHighScore(game.highScore);
            updateHud();
          }

          _context3.next = 13;
          break;

        case 10:
          _context3.prev = 10;
          _context3.t0 = _context3["catch"](2);
          console.warn("Failed to pull highscores from service:", _context3.t0.message || _context3.t0);

        case 13:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[2, 10]]);
}

function pushHighScoreToService(player, score) {
  if (!hasLunaBridge()) {
    return;
  }

  lunaRequest(SERVICE_ID, "saveHighScore", {
    player: player,
    score: score
  }, 4000)["catch"](function (error) {
    console.warn("Failed to push highscore to service:", error.message || error);
  });
}

function getServiceMonitorSnapshot() {
  return {
    serviceId: SERVICE_ID,
    available: serviceState.available,
    consecutiveFailures: serviceState.consecutiveFailures,
    lastPingAt: serviceState.lastPingAt,
    relaunchCooldownUntil: serviceState.relaunchCooldownUntil
  };
}

function registerServiceDebugCommands() {
  window.packmanServiceDebug = {
    ping: function ping() {
      return lunaRequest(SERVICE_ID, "ping", {}, 3500);
    },
    status: function status() {
      return lunaRequest(SERVICE_ID, "getStatus", {}, 4000);
    },
    launch: function launch() {
      return lunaRequest(SERVICE_ID, "launchGame", {
        reason: "manual console launch"
      }, 5000);
    },
    relaunch: function relaunch() {
      return requestRelaunch("manual console relaunch");
    },
    deeplink: function deeplink(contentId) {
      if (!deeplinkApi) {
        return {
          handled: false,
          success: false,
          errorText: "Deeplink module is not loaded"
        };
      }

      return deeplinkApi.applyDeeplinkPayload({
        contentId: contentId
      }, "manual-debug");
    },
    pullScores: function pullScores() {
      return lunaRequest(SERVICE_ID, "getHighScores", {}, 4000);
    },
    monitorNow: function monitorNow() {
      return checkServiceHealth();
    },
    snapshot: function snapshot() {
      return getServiceMonitorSnapshot();
    }
  };
  console.log("[PackMan] Luna debug commands ready: window.packmanServiceDebug.ping(), status(), launch(), relaunch(), deeplink(contentId), pullScores(), monitorNow(), snapshot()");
}

function initDeeplinkModule() {
  if (typeof window === "undefined" || !window.PackManDeeplink || typeof window.PackManDeeplink.create !== "function") {
    console.warn("[DeepLink] Module not loaded; deeplink launch testing disabled");
    return null;
  }

  return window.PackManDeeplink.create({
    maxLevel: MAX_LEVEL,
    startNewGame: function startNewGame(level) {
      return _startNewGame(level);
    },
    onObserved: function onObserved(result) {
      var summary = result && result.summary ? result.summary : "payload observed";
      setDeeplinkStatus("".concat(result.source, ": ").concat(summary));
    },
    onInvalid: function onInvalid(result) {
      var message = "".concat(result.errorText, ". Valid IDs: level1-level").concat(MAX_LEVEL, ", boss_level, final_boss.");
      setDeeplinkStatus("".concat(result.source, ": invalid ").concat(result.contentId || "payload"));
      showOverlay("Deep Link Error", "".concat(message, " Press Enter for Level 1."));
      game.running = false;
      game.paused = true;
      game.win = false;
      game.level = 1;
      updateHud();
    },
    onSuccess: function onSuccess(result) {
      setDeeplinkStatus("".concat(result.source, ": ").concat(result.contentId, " -> level ").concat(result.level));
      showOverlay("Deep Link Loaded", "".concat(result.contentId, " -> Level ").concat(result.level));
      setTimeout(function () {
        if (game.running && game.paused) {
          game.paused = false;
          hideOverlay();
        }
      }, 500);
    }
  });
}

function getStoredHighScore() {
  try {
    return Number(localStorage.getItem("pacman-highscore") || 0);
  } catch (error) {
    return 0;
  }
}

function setStoredHighScore(value) {
  try {
    localStorage.setItem("pacman-highscore", String(value));
  } catch (error) {// Ignore storage errors on restricted platforms.
  }
}

var levelLayouts = [["############################", "#P...........##...........P#", "#.####.#####.##.#####.####.#", "#.####.#####.##.#####.####.#", "#..........................#", "#.####.##.########.##.####.#", "#......##....##....##......#", "######.##### ## #####.######", "######.##          ##.######", "######.## ###--### ##.######", "      .   #GGGGGG#   .      ", "######.## ######## ##.######", "######.##          ##.######", "######.## ######## ##.######", "#............##............#", "#.####.#####.##.#####.####.#", "#P..##................##..P#", "###.##.##.########.##.##.###", "#......##....##....##......#", "#.##########.##.##########.#", "############################"], ["############################", "#P...........##...........P#", "#.####.#####.##.#####.####.#", "#.#  #.#   #.##.#   #.#  #.#", "#.#  #.# # #.##.# # #.#  #.#", "#..........................#", "#.####.##.########.##.####.#", "#..P...##....##....##...P..#", "######.##### ## #####.######", "######.##          ##.######", "######.## ###--### ##.######", "      .   #GGGGGG#   .      ", "######.## ######## ##.######", "######.##          ##.######", "######.## ######## ##.######", "#............##............#", "#.####.#####.##.#####.####.#", "#P..##................##..P#", "###.##.##.########.##.##.###", "#......##....##....##......#", "############################"], ["############################", "#..P.........##.........P..#", "#.####.#####.##.#####.####.#", "#.####.#####.##.#####.####.#", "#..........................#", "#.####.##.########.##.####.#", "#......##....##....##......#", "######.##### ## #####.######", "######.##          ##.######", "######.## ###--### ##.######", "      .   #GGGGGG#   .      ", "######.## ######## ##.######", "######.##          ##.######", "######.## ######## ##.######", "#............##............#", "#.####.#####.##.#####.####.#", "#...##..P........P..##...#.#", "###.##.##.########.##.##.###", "#......##....##....##......#", "#.##########.##.##########.#", "############################"], ["############################", "#..P.........##.........P..#", "#.####.#####.##.#####.####.#", "#.#..#.#...#.##.#...#.#..#.#", "#.#.##.#.#.#.##.#.#.#.##.#.#", "#..........................#", "#.####.##.########.##.####.#", "#......##....##....##......#", "######.##### ## #####.######", "######.##          ##.######", "######.## ###--### ##.######", "      .   #GGGGGG#   .      ", "######.## ######## ##.######", "######.##          ##.######", "######.## ######## ##.######", "#............##............#", "#.####.#####.##.#####.####.#", "#...##..P........P..##...#.#", "###.##.##.########.##.##.###", "#......##....##....##......#", "############################"], ["############################", "#P...........##...........P#", "#.####.#####.##.#####.####.#", "#.#..#.#...#.##.#...#.#..#.#", "#.#.##.#.#.#.##.#.#.#.##.#.#", "#..........................#", "#.####.##.########.##.####.#", "#......##....##....##......#", "######.##### ## #####.######", "######.##          ##.######", "######.## ###--### ##.######", "      .   #GGGGGG#   .      ", "######.## ######## ##.######", "######.##          ##.######", "######.## ######## ##.######", "#............##............#", "#.####.#####.##.#####.####.#", "#P..##..P........P..##..P..#", "###.##.##.########.##.##.###", "#......##....##....##......#", "############################"]];
var game = {
  level: 1,
  score: 0,
  highScore: getStoredHighScore(),
  lives: 3,
  running: false,
  paused: true,
  win: false,
  map: [],
  dotsLeft: 0,
  player: null,
  ghosts: [],
  powerTimer: 0,
  lastTime: 0,
  moveAccumulator: 0,
  stepInterval: 130,
  ghostStepInterval: 165,
  ghostAccumulator: 0
};
var DIRS = {
  left: {
    x: -1,
    y: 0
  },
  right: {
    x: 1,
    y: 0
  },
  up: {
    x: 0,
    y: -1
  },
  down: {
    x: 0,
    y: 1
  }
};

function cloneLayout(layout) {
  return layout.map(function (row) {
    return row.split("");
  });
}

var LEVEL_WALL_PATCHES = Object.freeze({
  2: [[13, 5], [14, 5], [13, 6], [14, 6], [8, 10], [19, 10], [8, 11], [19, 11]],
  3: [[4, 4], [5, 4], [22, 4], [23, 4], [4, 16], [5, 16], [22, 16], [23, 16], [13, 3], [14, 3], [13, 17], [14, 17]],
  4: [[10, 8], [11, 8], [16, 8], [17, 8], [10, 12], [11, 12], [16, 12], [17, 12], [7, 14], [20, 14]],
  5: [[6, 5], [7, 5], [20, 5], [21, 5], [6, 15], [7, 15], [20, 15], [21, 15], [12, 9], [13, 9], [14, 9], [15, 9], [12, 13], [13, 13], [14, 13], [15, 13]]
});

function applyLevelWallPatches(map, level) {
  var patches = LEVEL_WALL_PATCHES[level] || [];
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = patches[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var _step$value = _slicedToArray(_step.value, 2),
          x = _step$value[0],
          y = _step$value[1];

      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) {
        continue;
      }

      if (x === 1 && y === 1) {
        continue;
      }

      if (map[y][x] === "G") {
        continue;
      }

      map[y][x] = "#";
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
}

function configureDifficulty(level) {
  // Make first two levels easier
  if (level === 1) {
    game.stepInterval = 160; // slower player

    game.ghostStepInterval = 220; // much slower ghosts
  } else if (level === 2) {
    game.stepInterval = 140;
    game.ghostStepInterval = 180;
  } else {
    game.stepInterval = Math.max(90, 140 - level * 8);
    game.ghostStepInterval = Math.max(85, 180 - level * 16);
  }
}

function initLevel() {
  var layout = levelLayouts[game.level - 1];
  game.map = cloneLayout(layout);
  applyLevelWallPatches(game.map, game.level);
  game.dotsLeft = 0;
  game.powerTimer = 0;
  game.ghosts = [];
  var spawnX = 1;
  var spawnY = 1;

  for (var y = 0; y < ROWS; y += 1) {
    for (var x = 0; x < COLS; x += 1) {
      var cell = game.map[y][x];

      if ((cell === "." || cell === "P") && !(x === spawnX && y === spawnY)) {
        game.dotsLeft += 1;
      }

      if (cell === "G") {
        game.ghosts.push({
          x: x,
          y: y,
          startX: x,
          startY: y,
          dir: randomDir(),
          color: ["#ff4e50", "#5cc8ff", "#ff9f1c", "#d16dff"][game.ghosts.length % 4]
        });
        game.map[y][x] = " ";
      }
    }
  }

  game.player = {
    x: spawnX,
    y: spawnY,
    dir: DIRS.right,
    wanted: DIRS.right,
    mouth: 0
  };
  game.map[spawnY][spawnX] = " ";
  configureDifficulty(game.level);
  updateHud();
}

function updateHud() {
  scoreEl.textContent = String(game.score);
  livesEl.textContent = String(game.lives);
  highScoreEl.textContent = String(game.highScore);
  levelEl.textContent = "".concat(game.level, " / ").concat(MAX_LEVEL);
}

function showOverlay(title, message) {
  overlayTitleEl.textContent = title;
  overlayMessageEl.textContent = message;
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

function setDeeplinkStatus(text) {
  if (deeplinkStatusEl) {
    deeplinkStatusEl.textContent = "Deep link: ".concat(text);
  }

  console.log("[DeepLinkStatus] ".concat(text));
}

function _startNewGame() {
  var startLevel = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
  game.level = Math.min(MAX_LEVEL, Math.max(1, Number(startLevel) || 1));
  game.score = 0;
  game.lives = 3;
  game.win = false;
  game.running = true;
  game.paused = false;
  initLevel();
  hideOverlay();
}

function nextLevel() {
  if (game.level >= MAX_LEVEL) {
    game.running = false;
    game.paused = true;
    game.win = true;
    showOverlay("You Won!", "All 5 levels cleared. Press Enter to play again.");
    return;
  }

  game.level += 1;
  initLevel();
  game.paused = true;
  showOverlay("Level ".concat(game.level), "Press Enter to continue.");
}

function loseLife() {
  game.lives -= 1;

  if (game.lives <= 0) {
    game.running = false;
    game.paused = true;
    showOverlay("Game Over", "Press Enter to restart.");
  } else {
    game.player.x = 1;
    game.player.y = 1;
    game.player.dir = DIRS.right;
    game.player.wanted = DIRS.right;
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = game.ghosts[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var ghost = _step2.value;
        ghost.x = ghost.startX;
        ghost.y = ghost.startY;
        ghost.dir = randomDir();
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
          _iterator2["return"]();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }

    game.paused = true;
    showOverlay("Life Lost", "Press Enter to resume.");
  }

  updateHud();
}

function inBounds(x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}

function isWalkable(x, y) {
  if (!inBounds(x, y)) {
    return false;
  }

  return game.map[y][x] !== "#";
}

function randomDir() {
  var all = [DIRS.left, DIRS.right, DIRS.up, DIRS.down];
  return all[Math.floor(Math.random() * all.length)];
}

function dirEquals(a, b) {
  return a.x === b.x && a.y === b.y;
}

function reverseDir(dir) {
  return {
    x: -dir.x,
    y: -dir.y
  };
}

function tryMove(entity, dir) {
  var nx = entity.x + dir.x;
  var ny = entity.y + dir.y;

  if (!isWalkable(nx, ny)) {
    return false;
  }

  entity.x = nx;
  entity.y = ny;
  entity.dir = dir;
  return true;
}

function playerStep() {
  if (!game.running || game.paused) {
    return;
  }

  var moved = false;

  if (!dirEquals(game.player.dir, game.player.wanted)) {
    moved = tryMove(game.player, game.player.wanted);
  }

  if (!moved) {
    tryMove(game.player, game.player.dir);
  } // Fix: Always collect dots and power pellets reliably


  var cell = game.map[game.player.y][game.player.x];

  if (cell === "." || cell === "·") {
    game.score += 10;
    game.map[game.player.y][game.player.x] = " ";
    game.dotsLeft -= 1;
  } else if (cell === "P" || cell === "●") {
    game.score += 50;
    game.map[game.player.y][game.player.x] = " ";
    game.dotsLeft -= 1;
    game.powerTimer = 7000;
  }

  if (game.score > game.highScore) {
    game.highScore = game.score;
    setStoredHighScore(game.highScore);
    pushHighScoreToService("Player1", game.highScore);
  }

  if (game.dotsLeft <= 0) {
    nextLevel();
  }

  updateHud();
}

function ghostStep() {
  if (!game.running || game.paused) {
    return;
  }

  var _iteratorNormalCompletion3 = true;
  var _didIteratorError3 = false;
  var _iteratorError3 = undefined;

  try {
    var _loop = function _loop() {
      var ghost = _step3.value;
      var candidates = [DIRS.left, DIRS.right, DIRS.up, DIRS.down].filter(function (d) {
        var nx = ghost.x + d.x;
        var ny = ghost.y + d.y;
        return isWalkable(nx, ny);
      });

      if (candidates.length === 0) {
        return "continue";
      }

      var notReverse = candidates.filter(function (d) {
        return !dirEquals(d, reverseDir(ghost.dir));
      });
      var chosen = notReverse.length > 0 ? notReverse[Math.floor(Math.random() * notReverse.length)] : candidates[Math.floor(Math.random() * candidates.length)];

      if (game.level >= 3 && Math.random() < 0.35) {
        var towardPlayer = candidates.slice().sort(function (a, b) {
          var da = Math.abs(game.player.x - (ghost.x + a.x)) + Math.abs(game.player.y - (ghost.y + a.y));
          var db = Math.abs(game.player.x - (ghost.x + b.x)) + Math.abs(game.player.y - (ghost.y + b.y));
          return da - db;
        });
        chosen = towardPlayer[0];
      }

      ghost.x += chosen.x;
      ghost.y += chosen.y;
      ghost.dir = chosen;
    };

    for (var _iterator3 = game.ghosts[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
      var _ret = _loop();

      if (_ret === "continue") continue;
    }
  } catch (err) {
    _didIteratorError3 = true;
    _iteratorError3 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
        _iterator3["return"]();
      }
    } finally {
      if (_didIteratorError3) {
        throw _iteratorError3;
      }
    }
  }
}

function checkCollisions() {
  var _iteratorNormalCompletion4 = true;
  var _didIteratorError4 = false;
  var _iteratorError4 = undefined;

  try {
    for (var _iterator4 = game.ghosts[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
      var ghost = _step4.value;

      if (ghost.x === game.player.x && ghost.y === game.player.y) {
        if (game.powerTimer > 0) {
          game.score += 200;
          ghost.x = ghost.startX;
          ghost.y = ghost.startY;
          ghost.dir = randomDir();
          updateHud();
        } else {
          loseLife();
        }

        break;
      }
    }
  } catch (err) {
    _didIteratorError4 = true;
    _iteratorError4 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion4 && _iterator4["return"] != null) {
        _iterator4["return"]();
      }
    } finally {
      if (_didIteratorError4) {
        throw _iteratorError4;
      }
    }
  }
}

function drawTile(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#060b17";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  var pulse = (Math.sin(performance.now() * 0.008) + 1) / 2; // Only draw the board if game.map is a valid 2D array

  if (Array.isArray(game.map) && game.map.length === ROWS && Array.isArray(game.map[0]) && game.map[0].length === COLS) {
    for (var y = 0; y < ROWS; y += 1) {
      for (var x = 0; x < COLS; x += 1) {
        var cell = game.map[y][x];

        if (cell === "#") {
          drawTile(x, y, "#1d4ed8");
        } else {
          drawTile(x, y, "#0b1220");
        }

        if (cell === ".") {
          ctx.fillStyle = "#f8f5e4";
          ctx.beginPath();
          ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === "P") {
          ctx.fillStyle = "#fde047";
          ctx.shadowColor = "rgba(253, 224, 71, 0.9)";
          ctx.shadowBlur = 8 + pulse * 8;
          ctx.beginPath();
          ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 6 + pulse * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  var _iteratorNormalCompletion5 = true;
  var _didIteratorError5 = false;
  var _iteratorError5 = undefined;

  try {
    for (var _iterator5 = game.ghosts[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
      var ghost = _step5.value;
      var gx = ghost.x * TILE + TILE / 2;
      var gy = ghost.y * TILE + TILE / 2;
      var ghostBodyColor = ghost.color;

      if (game.powerTimer > 0) {
        ghostBodyColor = game.powerTimer < 2000 && pulse > 0.5 ? "#f8fafc" : "#60a5fa";
      }

      ctx.fillStyle = ghostBodyColor;
      ctx.beginPath();
      ctx.arc(gx, gy, TILE * 0.38, Math.PI, 0, false);
      ctx.lineTo(gx + TILE * 0.38, gy + TILE * 0.32);
      ctx.lineTo(gx - TILE * 0.38, gy + TILE * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = game.powerTimer > 0 ? "#0f172a" : "#ffffff";
      ctx.beginPath();
      ctx.arc(gx - 4, gy - 1, 3, 0, Math.PI * 2);
      ctx.arc(gx + 4, gy - 1, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } catch (err) {
    _didIteratorError5 = true;
    _iteratorError5 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion5 && _iterator5["return"] != null) {
        _iterator5["return"]();
      }
    } finally {
      if (_didIteratorError5) {
        throw _iteratorError5;
      }
    }
  }

  if (game.player) {
    var px = game.player.x * TILE + TILE / 2;
    var py = game.player.y * TILE + TILE / 2;
    var mouth = 0.2 + Math.abs(Math.sin(game.player.mouth)) * 0.35;
    var angle = 0;

    if (dirEquals(game.player.dir, DIRS.right)) {
      angle = 0;
    } else if (dirEquals(game.player.dir, DIRS.left)) {
      angle = Math.PI;
    } else if (dirEquals(game.player.dir, DIRS.up)) {
      angle = -Math.PI / 2;
    } else if (dirEquals(game.player.dir, DIRS.down)) {
      angle = Math.PI / 2;
    }

    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, TILE * 0.44, angle + mouth, angle - mouth + Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();
  }
}

function loop(timestamp) {
  if (!game.lastTime) {
    game.lastTime = timestamp;
  }

  var dt = timestamp - game.lastTime;
  game.lastTime = timestamp;

  if (game.running && !game.paused) {
    game.moveAccumulator += dt;
    game.ghostAccumulator += dt;
    game.player.mouth += dt * 0.02;

    if (game.powerTimer > 0) {
      game.powerTimer = Math.max(0, game.powerTimer - dt);
    }

    while (game.moveAccumulator >= game.stepInterval) {
      playerStep();
      game.moveAccumulator -= game.stepInterval;
      checkCollisions();
    }

    while (game.ghostAccumulator >= game.ghostStepInterval) {
      ghostStep();
      game.ghostAccumulator -= game.ghostStepInterval;
      checkCollisions();
    }
  }

  drawBoard();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", function (event) {
  var key = event.key.toLowerCase();

  if (key === "enter") {
    if (!game.running) {
      _startNewGame();
    } else if (game.paused) {
      game.paused = false;
      hideOverlay();
    }

    return;
  }

  if (!game.running) {
    return;
  }

  if (key === "arrowleft" || key === "a") {
    game.player.wanted = DIRS.left;
  } else if (key === "arrowright" || key === "d") {
    game.player.wanted = DIRS.right;
  } else if (key === "arrowup" || key === "w") {
    game.player.wanted = DIRS.up;
  } else if (key === "arrowdown" || key === "s") {
    game.player.wanted = DIRS.down;
  }
});
updateHud();
console.log("[PackMan] App boot complete. Luna service integration enabled for", SERVICE_ID);
setDeeplinkStatus("waiting for launch params");
deeplinkApi = initDeeplinkModule();

if (typeof window !== "undefined") {
  window.packmanDeeplinkApi = deeplinkApi;
}

registerServiceDebugCommands();
pullTopHighScoreFromService();
startServiceMonitor();
showOverlay("Pac Man", "Press Enter to start Level 1.");

if (deeplinkApi) {
  deeplinkApi.registerRelaunchLaunchParamHandler();
  deeplinkApi.tryApplyInitialLaunchParams();
  deeplinkApi.startLaunchParamPolling();
}

requestAnimationFrame(loop);
//# sourceMappingURL=app.dev.js.map
