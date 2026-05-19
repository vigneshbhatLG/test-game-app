
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
if (!canvas || !ctx) {
	document.body.innerHTML += '<div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#1a1a1a;color:#fff;z-index:9999;display:grid;place-items:center;font-size:2rem;">Canvas not supported or failed to initialize.</div>';
	throw new Error("Canvas not supported or failed to initialize.");
}
// Global error handler to show errors on screen
window.onerror = function (msg, url, line, col, error) {
	let message = msg + '\n' + (error && error.stack ? error.stack : 'at ' + url + ':' + line + ':' + col);
	document.body.innerHTML += `<div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#b91c1c;color:#fff;z-index:9999;display:grid;place-items:center;font-size:1.2rem;padding:2rem;white-space:pre-wrap;">JavaScript Error:<br>${message}</div>`;
	requestRelaunch("Fatal JavaScript error");
	return false;
};

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const highScoreEl = document.getElementById("high-score");
const levelEl = document.getElementById("level");

const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayMessageEl = document.getElementById("overlay-message");
const deeplinkStatusEl = document.getElementById("deeplink-status");

const TILE = 24;
const ROWS = 21;
const COLS = 28;
const MAX_LEVEL = 5;
const SERVICE_ID = "com.game.gamepac.service";
const SERVICE_PING_INTERVAL_MS = 20000;
const RELAUNCH_COOLDOWN_MS = 60000;

const serviceState = {
	consecutiveFailures: 0,
	relaunchCooldownUntil: 0,
	lastPingAt: 0,
	available: false
};

let deeplinkApi = null;

function setServiceStatus(text, isHealthy) {
	console.log(`[Service] ${text} (${isHealthy ? "healthy" : "unhealthy"})`);
}

function setLunaEvent(text) {
	console.log(`[Luna] ${text}`);
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
	const bridgeType = getLunaBridgeType();
	const available = bridgeType !== "none";
	if (!available) {
		setServiceStatus("bridge unavailable", false);
		setLunaEvent("No Luna bridge found (webOS.service and PalmServiceBridge unavailable)");
	} else {
		setLunaEvent(`Luna bridge active: ${bridgeType}`);
	}
	return available;
}

function lunaRequest(serviceId, method, parameters = {}, timeoutMs = 5000) {
	return new Promise((resolve, reject) => {
		const bridgeType = getLunaBridgeType();
		if (bridgeType === "none") {
			setLunaEvent(`${serviceId}/${method} blocked - no bridge`);
			reject(new Error("Luna bridge not available in this runtime"));
			return;
		}

		let completed = false;
		const timeoutId = setTimeout(() => {
			if (!completed) {
				completed = true;
				setLunaEvent(`${serviceId}/${method} timeout`);
				reject(new Error(`Luna request timeout: ${serviceId}/${method}`));
			}
		}, timeoutMs);

		function finishSuccess(response) {
			if (completed) {
				return;
			}
			completed = true;
			clearTimeout(timeoutId);
			setLunaEvent(`${serviceId}/${method} success`);
			resolve(response);
		}

		function finishError(error) {
			if (completed) {
				return;
			}
			completed = true;
			clearTimeout(timeoutId);
			setLunaEvent(`${serviceId}/${method} failure: ${error.message || error}`);
			reject(error instanceof Error ? error : new Error(String(error)));
		}

		try {
			if (bridgeType === "webos") {
				window.webOS.service.request(`luna://${serviceId}`, {
					method: `/${method}`,
					parameters,
					onSuccess: (res) => {
						if (res && res.returnValue === false) {
							finishError(new Error(res.errorText || res.errorMessage || "Luna request failed"));
							return;
						}
						finishSuccess(res || {});
					},
					onFailure: (err) => {
						finishError(new Error((err && (err.errorText || err.errorMessage)) || "Luna transport failure"));
					}
				});
				setLunaEvent(`${serviceId}/${method} request sent (webos bridge)`);
			} else {
				const bridge = new window.PalmServiceBridge();
				bridge.onservicecallback = (responseText) => {
					try {
						const response = typeof responseText === "string" ? JSON.parse(responseText) : responseText;
						if (response && response.returnValue === false) {
							finishError(new Error(response.errorText || response.errorMessage || "Luna request failed"));
							return;
						}
						finishSuccess(response || {});
					} catch (parseError) {
						finishError(new Error(`Failed to parse service response: ${parseError.message || parseError}`));
					}
				};

				const uri = `luna://${serviceId}/${method}`;
				bridge.call(uri, JSON.stringify(parameters || {}));
				setLunaEvent(`${serviceId}/${method} request sent (PalmServiceBridge)`);
			}
		} catch (error) {
			finishError(error);
		}
	});
}

async function requestRelaunch(reason) {
	const now = Date.now();
	if (now < serviceState.relaunchCooldownUntil) {
		return;
	}
	serviceState.relaunchCooldownUntil = now + RELAUNCH_COOLDOWN_MS;
	try {
		await lunaRequest(SERVICE_ID, "relaunchGame", { reason }, 5000);
	} catch (error) {
		console.warn("Relaunch request failed:", error.message || error);
	}
}

async function checkServiceHealth() {
	if (!hasLunaBridge()) {
		return;
	}

	try {
		await lunaRequest(SERVICE_ID, "ping", {}, 3500);
		serviceState.available = true;
		serviceState.lastPingAt = Date.now();
		serviceState.consecutiveFailures = 0;
		setServiceStatus("connected", true);
	} catch (error) {
		serviceState.available = false;
		serviceState.consecutiveFailures += 1;
		setServiceStatus(`disconnected (${serviceState.consecutiveFailures})`, false);
		console.warn("Service health check failed:", error.message || error);
		if (serviceState.consecutiveFailures >= 3) {
			requestRelaunch("Service unreachable from game app");
			serviceState.consecutiveFailures = 0;
		}
	}
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

async function pullTopHighScoreFromService() {
	if (!hasLunaBridge()) {
		return;
	}
	try {
		const response = await lunaRequest(SERVICE_ID, "getHighScores", {}, 4000);
		const top = response && Array.isArray(response.highScores) && response.highScores.length > 0 ? Number(response.highScores[0].score) : 0;
		if (Number.isFinite(top) && top > game.highScore) {
			game.highScore = top;
			setStoredHighScore(game.highScore);
			updateHud();
		}
	} catch (error) {
		console.warn("Failed to pull highscores from service:", error.message || error);
	}
}

function pushHighScoreToService(player, score) {
	if (!hasLunaBridge()) {
		return;
	}
	lunaRequest(SERVICE_ID, "saveHighScore", { player, score }, 4000).catch((error) => {
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
		ping: () => lunaRequest(SERVICE_ID, "ping", {}, 3500),
		status: () => lunaRequest(SERVICE_ID, "getStatus", {}, 4000),
		launch: () => lunaRequest(SERVICE_ID, "launchGame", { reason: "manual console launch" }, 5000),
		relaunch: () => requestRelaunch("manual console relaunch"),
		deeplink: (contentId) => {
			if (!deeplinkApi) {
				return {
					handled: false,
					success: false,
					errorText: "Deeplink module is not loaded"
				};
			}
			return deeplinkApi.applyDeeplinkPayload({ contentId }, "manual-debug");
		},
		pullScores: () => lunaRequest(SERVICE_ID, "getHighScores", {}, 4000),
		monitorNow: () => checkServiceHealth(),
		snapshot: () => getServiceMonitorSnapshot()
	};

	console.log("[PackMan] Luna debug commands ready: window.packmanServiceDebug.ping(), status(), launch(), relaunch(), deeplink(contentId), pullScores(), monitorNow(), snapshot()");
}

function initDeeplinkModule() {
	if (
		typeof window === "undefined" ||
		!window.PackManDeeplink ||
		typeof window.PackManDeeplink.create !== "function"
	) {
		console.warn("[DeepLink] Module not loaded; deeplink launch testing disabled");
		return null;
	}

	return window.PackManDeeplink.create({
		maxLevel: MAX_LEVEL,
		startNewGame: (level) => startNewGame(level),
		onObserved: (result) => {
			const summary = result && result.summary ? result.summary : "payload observed";
			setDeeplinkStatus(`${result.source}: ${summary}`);
		},
		onInvalid: (result) => {
			const message = `${result.errorText}. Valid IDs: level1-level${MAX_LEVEL}, boss_level, final_boss.`;
			setDeeplinkStatus(`${result.source}: invalid ${result.contentId || "payload"}`);
			showOverlay("Deep Link Error", `${message} Press Enter for Level 1.`);
			game.running = false;
			game.paused = true;
			game.win = false;
			game.level = 1;
			updateHud();
		},
		onSuccess: (result) => {
			setDeeplinkStatus(`${result.source}: ${result.contentId} -> level ${result.level}`);
			showOverlay("Deep Link Loaded", `${result.contentId} -> Level ${result.level}`);
			setTimeout(() => {
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
	} catch (error) {
		// Ignore storage errors on restricted platforms.
	}
}

const levelLayouts = [
	[
		"############################",
		"#P...........##...........P#",
		"#.####.#####.##.#####.####.#",
		"#.####.#####.##.#####.####.#",
		"#..........................#",
		"#.####.##.########.##.####.#",
		"#......##....##....##......#",
		"######.##### ## #####.######",
		"######.##          ##.######",
		"######.## ###--### ##.######",
		"      .   #GGGGGG#   .      ",
		"######.## ######## ##.######",
		"######.##          ##.######",
		"######.## ######## ##.######",
		"#............##............#",
		"#.####.#####.##.#####.####.#",
		"#P..##................##..P#",
		"###.##.##.########.##.##.###",
		"#......##....##....##......#",
		"#.##########.##.##########.#",
		"############################"
	],
	[
		"############################",
		"#P...........##...........P#",
		"#.####.#####.##.#####.####.#",
		"#.#  #.#   #.##.#   #.#  #.#",
		"#.#  #.# # #.##.# # #.#  #.#",
		"#..........................#",
		"#.####.##.########.##.####.#",
		"#..P...##....##....##...P..#",
		"######.##### ## #####.######",
		"######.##          ##.######",
		"######.## ###--### ##.######",
		"      .   #GGGGGG#   .      ",
		"######.## ######## ##.######",
		"######.##          ##.######",
		"######.## ######## ##.######",
		"#............##............#",
		"#.####.#####.##.#####.####.#",
		"#P..##................##..P#",
		"###.##.##.########.##.##.###",
		"#......##....##....##......#",
		"############################"
	],
	[
		"############################",
		"#..P.........##.........P..#",
		"#.####.#####.##.#####.####.#",
		"#.####.#####.##.#####.####.#",
		"#..........................#",
		"#.####.##.########.##.####.#",
		"#......##....##....##......#",
		"######.##### ## #####.######",
		"######.##          ##.######",
		"######.## ###--### ##.######",
		"      .   #GGGGGG#   .      ",
		"######.## ######## ##.######",
		"######.##          ##.######",
		"######.## ######## ##.######",
		"#............##............#",
		"#.####.#####.##.#####.####.#",
		"#...##..P........P..##...#.#",
		"###.##.##.########.##.##.###",
		"#......##....##....##......#",
		"#.##########.##.##########.#",
		"############################"
	],
	[
		"############################",
		"#..P.........##.........P..#",
		"#.####.#####.##.#####.####.#",
		"#.#..#.#...#.##.#...#.#..#.#",
		"#.#.##.#.#.#.##.#.#.#.##.#.#",
		"#..........................#",
		"#.####.##.########.##.####.#",
		"#......##....##....##......#",
		"######.##### ## #####.######",
		"######.##          ##.######",
		"######.## ###--### ##.######",
		"      .   #GGGGGG#   .      ",
		"######.## ######## ##.######",
		"######.##          ##.######",
		"######.## ######## ##.######",
		"#............##............#",
		"#.####.#####.##.#####.####.#",
		"#...##..P........P..##...#.#",
		"###.##.##.########.##.##.###",
		"#......##....##....##......#",
		"############################"
	],
	[
		"############################",
		"#P...........##...........P#",
		"#.####.#####.##.#####.####.#",
		"#.#..#.#...#.##.#...#.#..#.#",
		"#.#.##.#.#.#.##.#.#.#.##.#.#",
		"#..........................#",
		"#.####.##.########.##.####.#",
		"#......##....##....##......#",
		"######.##### ## #####.######",
		"######.##          ##.######",
		"######.## ###--### ##.######",
		"      .   #GGGGGG#   .      ",
		"######.## ######## ##.######",
		"######.##          ##.######",
		"######.## ######## ##.######",
		"#............##............#",
		"#.####.#####.##.#####.####.#",
		"#P..##..P........P..##..P..#",
		"###.##.##.########.##.##.###",
		"#......##....##....##......#",
		"############################"
	]
];

const game = {
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

const DIRS = {
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 }
};

function cloneLayout(layout) {
	return layout.map((row) => row.split(""));
}

const LEVEL_WALL_PATCHES = Object.freeze({
	2: [
		[13, 5], [14, 5], [13, 6], [14, 6],
		[8, 10], [19, 10], [8, 11], [19, 11]
	],
	3: [
		[4, 4], [5, 4], [22, 4], [23, 4],
		[4, 16], [5, 16], [22, 16], [23, 16],
		[13, 3], [14, 3], [13, 17], [14, 17]
	],
	4: [
		[10, 8], [11, 8], [16, 8], [17, 8],
		[10, 12], [11, 12], [16, 12], [17, 12],
		[7, 14], [20, 14]
	],
	5: [
		[6, 5], [7, 5], [20, 5], [21, 5],
		[6, 15], [7, 15], [20, 15], [21, 15],
		[12, 9], [13, 9], [14, 9], [15, 9],
		[12, 13], [13, 13], [14, 13], [15, 13]
	]
});

function applyLevelWallPatches(map, level) {
	const patches = LEVEL_WALL_PATCHES[level] || [];
	for (const [x, y] of patches) {
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
	const layout = levelLayouts[game.level - 1];
	game.map = cloneLayout(layout);
	applyLevelWallPatches(game.map, game.level);
	game.dotsLeft = 0;
	game.powerTimer = 0;
	game.ghosts = [];
	const spawnX = 1;
	const spawnY = 1;

	for (let y = 0; y < ROWS; y += 1) {
		for (let x = 0; x < COLS; x += 1) {
			const cell = game.map[y][x];
			if ((cell === "." || cell === "P") && !(x === spawnX && y === spawnY)) {
				game.dotsLeft += 1;
			}
			if (cell === "G") {
				game.ghosts.push({
					x,
					y,
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
	levelEl.textContent = `${game.level} / ${MAX_LEVEL}`;
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
		deeplinkStatusEl.textContent = `Deep link: ${text}`;
	}
	console.log(`[DeepLinkStatus] ${text}`);
}

function startNewGame(startLevel = 1) {
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
	showOverlay(`Level ${game.level}`, "Press Enter to continue.");
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
		for (const ghost of game.ghosts) {
			ghost.x = ghost.startX;
			ghost.y = ghost.startY;
			ghost.dir = randomDir();
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
	const all = [DIRS.left, DIRS.right, DIRS.up, DIRS.down];
	return all[Math.floor(Math.random() * all.length)];
}

function dirEquals(a, b) {
	return a.x === b.x && a.y === b.y;
}

function reverseDir(dir) {
	return { x: -dir.x, y: -dir.y };
}

function tryMove(entity, dir) {
	const nx = entity.x + dir.x;
	const ny = entity.y + dir.y;
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

	let moved = false;
	if (!dirEquals(game.player.dir, game.player.wanted)) {
		moved = tryMove(game.player, game.player.wanted);
	}

	if (!moved) {
		tryMove(game.player, game.player.dir);
	}

	// Fix: Always collect dots and power pellets reliably
	let cell = game.map[game.player.y][game.player.x];
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

	for (const ghost of game.ghosts) {
		const candidates = [DIRS.left, DIRS.right, DIRS.up, DIRS.down].filter((d) => {
			const nx = ghost.x + d.x;
			const ny = ghost.y + d.y;
			return isWalkable(nx, ny);
		});

		if (candidates.length === 0) {
			continue;
		}

		const notReverse = candidates.filter((d) => !dirEquals(d, reverseDir(ghost.dir)));
		let chosen = notReverse.length > 0 ? notReverse[Math.floor(Math.random() * notReverse.length)] : candidates[Math.floor(Math.random() * candidates.length)];

		if (game.level >= 3 && Math.random() < 0.35) {
			const towardPlayer = candidates
				.slice()
				.sort((a, b) => {
					const da = Math.abs(game.player.x - (ghost.x + a.x)) + Math.abs(game.player.y - (ghost.y + a.y));
					const db = Math.abs(game.player.x - (ghost.x + b.x)) + Math.abs(game.player.y - (ghost.y + b.y));
					return da - db;
				});
			chosen = towardPlayer[0];
		}

		ghost.x += chosen.x;
		ghost.y += chosen.y;
		ghost.dir = chosen;
	}
}

function checkCollisions() {
	for (const ghost of game.ghosts) {
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
}

function drawTile(x, y, color) {
	ctx.fillStyle = color;
	ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
}


function drawBoard() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#060b17";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	const pulse = (Math.sin(performance.now() * 0.008) + 1) / 2;

	// Only draw the board if game.map is a valid 2D array
	if (Array.isArray(game.map) && game.map.length === ROWS && Array.isArray(game.map[0]) && game.map[0].length === COLS) {
		for (let y = 0; y < ROWS; y += 1) {
			for (let x = 0; x < COLS; x += 1) {
				const cell = game.map[y][x];

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

	for (const ghost of game.ghosts) {
		const gx = ghost.x * TILE + TILE / 2;
		const gy = ghost.y * TILE + TILE / 2;

		let ghostBodyColor = ghost.color;
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

	if (game.player) {
		const px = game.player.x * TILE + TILE / 2;
		const py = game.player.y * TILE + TILE / 2;
		const mouth = 0.2 + Math.abs(Math.sin(game.player.mouth)) * 0.35;

		let angle = 0;
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
	const dt = timestamp - game.lastTime;
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

window.addEventListener("keydown", (event) => {
	const key = event.key.toLowerCase();
	if (key === "enter") {
		if (!game.running) {
			startNewGame();
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
