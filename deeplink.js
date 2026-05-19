(function () {
	"use strict";

	const LEVEL_METADATA = Object.freeze({
		1: { title: "Level 1" },
		2: { title: "Level 2" },
		3: { title: "Level 3" },
		4: { title: "Level 4" },
		5: { title: "Level 5" }
	});

	const CONTENT_ID_LOOKUP = Object.freeze({
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

	const levels = require("./levels.json");

	// Declare loadLevel function at the top to ensure it is accessible
	function loadLevel(contentId) {
		if (levels[contentId]) {
			const level = levels[contentId];
			console.log(`Loading ${level.name} (Difficulty: ${level.difficulty})`);
			// Add logic to load the level
		} else if (contentId.startsWith("level")) {
			const levelNumber = contentId.replace("level", "");
			console.log(`Loading Level ${levelNumber}`);
			// Add logic to load the level dynamically
		} else if (contentId.startsWith("boss")) {
			console.log(`Loading Boss Fight: ${contentId}`);
			// Add logic for boss fights
		} else {
			console.error("Invalid contentId:", contentId);
			// Handle invalid contentId
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
			return { contentId: `level${rawValue}` };
		}

		if (typeof rawValue === "object") {
			return rawValue;
		}
		if (typeof rawValue === "string") {
			const text = rawValue.trim();
			if (!text) {
				return {};
			}
			try {
				const parsed = JSON.parse(text);
				if (typeof parsed === "string") {
					return { contentId: parsed.trim() };
				}
				if (typeof parsed === "number") {
					return { contentId: `level${parsed}` };
				}
				if (parsed && typeof parsed === "object") {
					return parsed;
				}
				return { contentId: text };
			} catch (error) {
				const querySource = text.includes("?") ? text.slice(text.indexOf("?") + 1) : text;
				const queryOnly = querySource.includes("#") ? querySource.slice(0, querySource.indexOf("#")) : querySource;
				const params = new URLSearchParams(queryOnly.startsWith("?") ? queryOnly.slice(1) : queryOnly);
				const contentId = params.get("contentId");
				if (contentId) {
					return { contentId };
				}
				const contentIdLower = params.get("contentid");
				if (contentIdLower) {
					return { contentId: contentIdLower };
				}
				const content = params.get("content");
				if (content) {
					return { contentId: content };
				}
				const level = params.get("level");
				if (level) {
					return { contentId: level };
				}
				const levels = params.get("levels");
				if (levels) {
					return { contentId: levels };
				}

				return { contentId: text };
			}
		}
		return {};
	}

	function sanitizeContentToken(value) {
		const text = String(value || "").trim();
		if (!text) {
			return "";
		}
		const singleQuoted = text.startsWith("'") && text.endsWith("'") && text.length >= 2;
		const doubleQuoted = text.startsWith('"') && text.endsWith('"') && text.length >= 2;
		return (singleQuoted || doubleQuoted ? text.slice(1, -1) : text).trim();
	}

	function extractContentIdFromRawText(rawPayload) {
		const preview = safePreview(rawPayload);
		if (!preview || preview === "undefined" || preview === "null") {
			return "";
		}

		const lower = preview.toLowerCase();
		const keyValue = lower.match(/(?:contentid|content_id|level|levels|lvl|stage)\s*["':=_-]+\s*(?:level|levels|lvl|stage)?_?(\d+)/);
		if (keyValue) {
			return `level${keyValue[1]}`;
		}

		const compactLevel = lower.match(/\b(?:level|levels|lvl|stage)[_\-\s:]?(\d+)\b/);
		if (compactLevel) {
			return `level${compactLevel[1]}`;
		}

		const urlLike = lower.match(/[?&](?:contentid|content_id|level|levels|lvl|stage)=([^&#\s"]+)/);
		if (urlLike && urlLike[1]) {
			return urlLike[1].trim();
		}

		return "";
	}

	function extractContentId(payload) {
		if (!payload || typeof payload !== "object") {
			return "";
		}

		const deeplinkParams = payload.deeplinkingParams ||
			(payload.params && payload.params.deeplinkingParams) ||
			(payload.replaceParams && payload.replaceParams.deeplinkingParams) ||
			(payload.params && payload.params.replaceParams && payload.params.replaceParams.deeplinkingParams);

		if (deeplinkParams && typeof deeplinkParams === "object") {
			if (typeof deeplinkParams.contentId === "string" && deeplinkParams.contentId.trim()) {
				return deeplinkParams.contentId.trim();
			}

			if (typeof deeplinkParams.levels === "string" && deeplinkParams.levels.trim()) {
				return deeplinkParams.levels.trim();
			}

			if (typeof deeplinkParams.levels === "number") {
				return `level${deeplinkParams.levels}`;
			}

			if (typeof deeplinkParams.value === "string" && deeplinkParams.value.trim()) {
				const target = typeof deeplinkParams.target === "string" ? deeplinkParams.target.trim().toLowerCase() : "";
				if (!target || target === "contentid" || target === "$contentid" || target === "level" || target === "$level" || target === "levels" || target === "$levels") {
					return deeplinkParams.value.trim();
				}
			}
		}

		const candidates = [
			payload.contentId,
			payload.contentID,
			payload.contentid,
			payload.content,
			payload.query,
			payload.uri,
			payload.url,
			payload.levels,
			payload.levelsId,
			payload.levelsID,
			payload.replaceParams && payload.replaceParams.contentId,
			payload.replaceParams && payload.replaceParams.contentid,
			payload.replaceParams && payload.replaceParams.content,
			payload.replaceParams && payload.replaceParams.levels,
			payload.replaceParams && payload.replaceParams.levelsId,
			payload.replaceParams && payload.replaceParams.levelId,
			payload.replaceParams && payload.replaceParams.level,
			payload.levelId,
			payload.levelID,
			payload.level,
			payload.params && payload.params.level,
			payload.params && payload.params.levels,
			payload.params && payload.params.levelsId,
			payload.id,
			payload.target,
			payload.content && payload.content.id,
			payload.params && payload.params.content,
			payload.params && payload.params.contentId,
			payload.params && payload.params.contentid,
			payload.params && payload.params.levelId,
			payload.params && payload.params.query,
			payload.params && payload.params.url,
			payload.params && payload.params.uri
		];

		for (const value of candidates) {
			if (typeof value === "number" && Number.isFinite(value)) {
				return `level${value}`;
			}
			if (typeof value === "string" && value.trim()) {
				const text = value.trim();
				if (text.toLowerCase() === "level" || text.toLowerCase() === "levels") {
					continue;
				}
				return text;
			}
		}

		if (typeof payload.level === "number") {
			return `level${payload.level}`;
		}

		if (typeof payload.levels === "number") {
			return `level${payload.levels}`;
		}

		if (typeof payload.level === "string" && payload.level.trim()) {
			const levelText = payload.level.trim();
			if (/^\d+$/.test(levelText)) {
				return `level${levelText}`;
			}
			return levelText;
		}

		if (typeof payload.levels === "string" && payload.levels.trim()) {
			const levelsText = payload.levels.trim();
			if (/^\d+$/.test(levelsText)) {
				return `level${levelsText}`;
			}
			if (/^levels?(\d+)$/.test(levelsText.toLowerCase())) {
				const match = levelsText.toLowerCase().match(/^levels?(\d+)$/);
				return `level${match[1]}`;
			}
			return levelsText;
		}

		return "";
	}

	function resolveContentIdToLevel(contentId, maxLevel, levelLookup) {
		const normalized = sanitizeContentToken(contentId).toLowerCase().replace(/[\s-]+/g, "_");
		if (!normalized) {
			return {
				ok: false,
				errorText: "contentId is missing"
			};
		}

		if (/^\d+$/.test(normalized)) {
			const requestedLevel = Number(normalized);
			if (requestedLevel >= 1 && requestedLevel <= maxLevel) {
				return {
					ok: true,
					level: requestedLevel,
					title: `Level ${requestedLevel}`,
					contentId: `level${requestedLevel}`
				};
			}
			return {
				ok: false,
				errorText: `Requested level${requestedLevel}, but only level1 to level${maxLevel} exist`
			};
		}

		if (levelLookup[normalized]) {
			const mappedLevel = levelLookup[normalized];
			const metadata = LEVEL_METADATA[mappedLevel] || { title: `Level ${mappedLevel}` };
			return {
				ok: true,
				level: mappedLevel,
				title: metadata.title,
				contentId: normalized
			};
		}

		const levelMatch = normalized.match(/^level_?(\d+)$/);
		if (levelMatch) {
			const requestedLevel = Number(levelMatch[1]);
			if (requestedLevel >= 1 && requestedLevel <= maxLevel) {
				return {
					ok: true,
					level: requestedLevel,
					title: `Level ${requestedLevel}`,
					contentId: normalized
				};
			}
			return {
				ok: false,
				errorText: `Requested ${normalized}, but only level1 to level${maxLevel} exist`
			};
		}

		const levelsMatch = normalized.match(/^levels?_?(\d+)$/);
		if (levelsMatch) {
			const requestedLevel = Number(levelsMatch[1]);
			if (requestedLevel >= 1 && requestedLevel <= maxLevel) {
				return {
					ok: true,
					level: requestedLevel,
					title: `Level ${requestedLevel}`,
					contentId: `level${requestedLevel}`
				};
			}
			return {
				ok: false,
				errorText: `Requested ${normalized}, but only level1 to level${maxLevel} exist`
			};
		}

		const keyValueLevelMatch = normalized.match(/^(contentid|level|levels|lvl|stage)\s*[:=_]\s*(\d+)$/);
		if (keyValueLevelMatch) {
			const requestedLevel = Number(keyValueLevelMatch[2]);
			if (requestedLevel >= 1 && requestedLevel <= maxLevel) {
				return {
					ok: true,
					level: requestedLevel,
					title: `Level ${requestedLevel}`,
					contentId: `level${requestedLevel}`
				};
			}
			return {
				ok: false,
				errorText: `Requested level${requestedLevel}, but only level1 to level${maxLevel} exist`
			};
		}

		return {
			ok: false,
			errorText: `Unknown contentId: ${contentId}`
		};
	}

	function create(options) {
		const config = options || {};
		const maxLevel = Number(config.maxLevel) || 5;
		const levelLookup = config.levelLookup && typeof config.levelLookup === "object" ? config.levelLookup : CONTENT_ID_LOOKUP;
		const startNewGame = typeof config.startNewGame === "function" ? config.startNewGame : function () {};
		const onInvalid = typeof config.onInvalid === "function" ? config.onInvalid : function () {};
		const onObserved = typeof config.onObserved === "function" ? config.onObserved : function () {};
		const onSuccess = typeof config.onSuccess === "function" ? config.onSuccess : function () {};
		let lastAppliedSignature = "";

		function makeSignature(contentId, source) {
			return `${source}::${String(contentId || "").trim().toLowerCase()}`;
		}

		function applyDeeplinkPayload(rawPayload, source) {
			console.log(`[DeepLink] START: Applying payload from ${source}`);
			console.log(`[DeepLink] Raw payload:`, rawPayload);

			onObserved({
				source,
				summary: safePreview(rawPayload)
			});

			const payload = parseLaunchPayload(rawPayload);
			console.log(`[DeepLink] Parsed payload:`, payload);

			const contentId = extractContentId(payload);
			console.log(`[DeepLink] Extracted contentId:`, contentId);

			const fallbackContentId = !contentId ? extractContentIdFromRawText(rawPayload) : "";
			console.log(`[DeepLink] Fallback contentId:`, fallbackContentId);

			const resolvedContentId = contentId || fallbackContentId;
			console.log(`[DeepLink] Resolved contentId:`, resolvedContentId);

			if (!resolvedContentId) {
				console.warn(`[DeepLink] No valid contentId resolved from payload.`);
				return {
					handled: false,
					source,
					summary: safePreview(payload)
				};
			}

			loadLevel(resolvedContentId);

			const signature = makeSignature(resolvedContentId, source);
			console.log(`[DeepLink] Generated signature:`, signature);

			if (signature === lastAppliedSignature) {
				console.log(`[DeepLink] Duplicate payload detected, skipping.`);
				return {
					handled: true,
					success: true,
					source,
					contentId: resolvedContentId,
					skipped: true,
					reason: "duplicate payload"
				};
			}

			const resolved = resolveContentIdToLevel(resolvedContentId, maxLevel, levelLookup);
			console.log(`[DeepLink] Resolved level details:`, resolved);

			if (!resolved.ok) {
				console.warn(`[DeepLink] Invalid contentId from ${source}:`, resolvedContentId, resolved.errorText);
				const result = {
					handled: true,
					success: false,
					source,
					contentId: resolvedContentId,
					errorText: resolved.errorText
				};
				onInvalid(result);
				return result;
			}

			console.log(`[DeepLink] SUCCESS: ${source} -> ${resolvedContentId} resolved to level ${resolved.level}`);
			debugger; // Pause execution for debugging

			lastAppliedSignature = signature;
			startNewGame(resolved.level);

			const result = {
				handled: true,
				success: true,
				source,
				contentId: resolvedContentId,
				level: resolved.level,
				title: resolved.title
			};

			onSuccess(result);
			return result;
		}

		function collectLaunchParamCandidates() {
			const candidates = [];
			if (typeof window !== "undefined") {
				if (window.PalmSystem && typeof window.PalmSystem.launchParams !== "undefined") {
					candidates.push({ source: "PalmSystem.launchParams", value: window.PalmSystem.launchParams });
				}
				if (window.webOS && typeof window.webOS.launchParams !== "undefined") {
					candidates.push({ source: "webOS.launchParams", value: window.webOS.launchParams });
				}
				if (window.webOSDev && typeof window.webOSDev.launchParams !== "undefined") {
					candidates.push({ source: "webOSDev.launchParams", value: window.webOSDev.launchParams });
				}
				if (typeof window.launchParams !== "undefined") {
					candidates.push({ source: "window.launchParams", value: window.launchParams });
				}
			}
			return candidates;
		}

		function tryApplyInitialLaunchParams() {
			const candidates = collectLaunchParamCandidates();

			if (candidates.length === 0) {
				onObserved({
					source: "initial-launch",
					summary: "no launchParams source found"
				});
				return { handled: false, source: "initial-launch" };
			}

			let lastResult = { handled: false, source: "initial-launch" };
			for (const candidate of candidates) {
				lastResult = applyDeeplinkPayload(candidate.value, candidate.source);
				if (lastResult && lastResult.handled) {
					return lastResult;
				}
			}

			return lastResult;
		}

		function startLaunchParamPolling() {
			if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
				return;
			}

			let attempt = 0;
			const maxAttempts = 12;

			function poll() {
				attempt += 1;
				const result = tryApplyInitialLaunchParams();
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

			["webOSRelaunch", "webOSLaunch"].forEach((eventName) => {
				document.addEventListener(eventName, (event) => {
					if (typeof window !== "undefined" && window.PalmSystem && typeof window.PalmSystem.activate === "function") {
						try {
							window.PalmSystem.activate();
						} catch (error) {
							onObserved({
								source: `${eventName}.activate`,
								summary: safePreview(error && error.message ? error.message : error)
							});
						}
					}

					const detail = event && event.detail ? event.detail : {};
					const rawPayload = detail.launchParams || detail.params || detail;
					applyDeeplinkPayload(rawPayload, eventName);
				});
			});
		}

		return {
			applyDeeplinkPayload,
			tryApplyInitialLaunchParams,
			registerRelaunchLaunchParamHandler,
			startLaunchParamPolling
		};
	}

	// Allow manual deeplink testing from the browser console.
	function simulateDeeplink(contentId) {
		const deeplinkPayload = String(contentId || "").trim();
		const activeApi =
			typeof window !== "undefined" &&
			window.packmanDeeplinkApi &&
			typeof window.packmanDeeplinkApi.applyDeeplinkPayload === "function"
				? window.packmanDeeplinkApi
				: null;

		if (!activeApi) {
			const result = {
				handled: false,
				success: false,
				errorText: "Active deeplink API not initialized yet"
			};
			console.error("Failed to trigger deeplink:", result.errorText);
			return result;
		}

		const result = activeApi.applyDeeplinkPayload(deeplinkPayload, "simulateDeeplink");
		if (result.success) {
			console.log("Deeplink successfully triggered:", result);
		} else {
			console.error("Failed to trigger deeplink:", result.errorText);
		}
		return result;
	}

	// Expose the simulateDeeplink function globally for console usage
	window.simulateDeeplink = simulateDeeplink;

	window.PackManDeeplink = {
		create
	};
})();
