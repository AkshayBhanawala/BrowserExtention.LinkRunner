document.addEventListener('DOMContentLoaded', async () => {
	// Reload Button
	const reloadBtn = document.getElementById('reload');

	// Theme Elements
	const themeToggleBtn = document.getElementById('themeToggle');
	const THEME_ICONS = { 'system': '🌓', 'dark': '🌙', 'light': '☀️' };
	let currentTheme = 'system';

	// Basic Settings Elements
	const urlListEl = document.getElementById('urlList');
	const destUrlEl = document.getElementById('destUrl');
	const destSelectorEl = document.getElementById('destSelector');
	const conditionLogicEl = document.getElementById('conditionLogic');

	// Link Collector Elements
	const tabMatchEl = document.getElementById('tabMatch');
	const anchorSelectorEl = document.getElementById('anchorSelector');
	const fallbackToTabUrlEl = document.getElementById('fallbackToTabUrl'); // <-- ADD THIS
	const copyToClipboardEl = document.getElementById('copyToClipboard');
	const appendToRunnerEl = document.getElementById('appendToRunner');
	const collectStatus = document.getElementById('collectStatus');
	const urlCountEl = document.getElementById('urlCount');
	const startBtn = document.getElementById('startBtn');
	const stopBtn = document.getElementById('stopBtn');
	const collectBtn = document.getElementById('collectBtn');

	// Profile & Export Elements
	const profileNameEl = document.getElementById('profileName');
	const saveProfileBtn = document.getElementById('saveProfileBtn');
	const profileSelectEl = document.getElementById('profileSelect');
	const loadProfileBtn = document.getElementById('loadProfileBtn');
	const deleteProfileBtn = document.getElementById('deleteProfileBtn');
	const exportBtn = document.getElementById('exportBtn');
	const importBtn = document.getElementById('importBtn');
	const importFileEl = document.getElementById('importFile');

	// 1. Initialize & Restore state
	const data = await chrome.storage.local.get([
		'urlList', 'destUrl', 'destSelector', 'conditionLogic', 'tabMatch',
		'anchorSelector', 'fallbackToTabUrl', 'copyToClipboard', 'appendToRunner', 'isRunning', 'savedProfiles', 'uiTheme'
	]);

	// Setup Theme
	applyTheme(data.uiTheme || 'system');

	// Setup Values
	if (data.urlList) urlListEl.value = data.urlList;
	if (data.destUrl) destUrlEl.value = data.destUrl;
	if (data.destSelector) destSelectorEl.value = data.destSelector;
	if (data.conditionLogic) conditionLogicEl.value = data.conditionLogic;
	if (data.tabMatch) tabMatchEl.value = data.tabMatch;
	if (data.anchorSelector) anchorSelectorEl.value = data.anchorSelector;

	// Checkboxes
	fallbackToTabUrlEl.checked = data.fallbackToTabUrl !== undefined ? data.fallbackToTabUrl : false;
	copyToClipboardEl.checked = data.copyToClipboard !== undefined ? data.copyToClipboard : false;
	appendToRunnerEl.checked = data.appendToRunner !== undefined ? data.appendToRunner : true;

	let savedProfiles = data.savedProfiles || {};
	refreshProfileDropdown(savedProfiles);
	updateButtons(data.isRunning);
	updateUrlCount();

	// Check if the restored settings match an existing profile
	checkActiveProfileMatch();

	// --- RELOAD LOGIC ---

	reloadBtn.addEventListener('click', () => {
		location.reload();
	});

	// --- THEME LOGIC ---

	function applyTheme(theme) {
		currentTheme = theme;
		if (theme === 'system') {
			document.documentElement.removeAttribute('data-theme');
		} else {
			document.documentElement.setAttribute('data-theme', theme);
		}
		themeToggleBtn.textContent = THEME_ICONS[theme];
		themeToggleBtn.title = `Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`;
	}

	themeToggleBtn.addEventListener('click', () => {
		const nextTheme = currentTheme === 'system' ? 'dark' : (currentTheme === 'dark' ? 'light' : 'system');
		applyTheme(nextTheme);
		chrome.storage.local.set({ uiTheme: nextTheme });
	});

	// --- HELPER FUNCTIONS ---

	function getSettingsObject() {
		return {
			destUrl: destUrlEl.value.trim(),
			destSelector: destSelectorEl.value.trim(),
			conditionLogic: conditionLogicEl.value,
			tabMatch: tabMatchEl.value.trim(),
			anchorSelector: anchorSelectorEl.value.trim(),
			fallbackToTabUrl: fallbackToTabUrlEl.checked,
			copyToClipboard: copyToClipboardEl.checked,
			appendToRunner: appendToRunnerEl.checked
		};
	}

	function applySettingsObject(config) {
		if (config.destUrl !== undefined) destUrlEl.value = config.destUrl;
		if (config.destSelector !== undefined) destSelectorEl.value = config.destSelector;
		if (config.conditionLogic !== undefined) conditionLogicEl.value = config.conditionLogic;
		if (config.tabMatch !== undefined) tabMatchEl.value = config.tabMatch;
		if (config.anchorSelector !== undefined) anchorSelectorEl.value = config.anchorSelector;
		if (config.fallbackToTabUrl !== undefined) fallbackToTabUrlEl.checked = config.copyToClipboard;
		else fallbackToTabUrlEl.checked = false;
		if (config.copyToClipboard !== undefined) copyToClipboardEl.checked = config.copyToClipboard;
		else copyToClipboardEl.checked = false;
		if (config.appendToRunner !== undefined) appendToRunnerEl.checked = config.appendToRunner;
		else appendToRunnerEl.checked = false;

		saveActiveState();
		checkActiveProfileMatch();
	}

	function updateUrlCount() {
		const urls = urlListEl.value.split('\n').map(u => u.trim()).filter(u => u.length > 0);
		urlCountEl.textContent = urls.length;
	}

	async function saveActiveState() {
		await chrome.storage.local.set({
			urlList: urlListEl.value,
			...getSettingsObject()
		});
	}

	function checkActiveProfileMatch() {
		const current = getSettingsObject();
		let matchedName = "";

		for (const [name, profile] of Object.entries(savedProfiles)) {
			if (
				(profile.destUrl || "") === current.destUrl &&
				(profile.destSelector || "") === current.destSelector &&
				(profile.conditionLogic || "AND") === current.conditionLogic &&
				(profile.tabMatch || "") === current.tabMatch &&
				(profile.anchorSelector || "") === current.anchorSelector &&
				(!!profile.fallbackToTabUrl) === current.fallbackToTabUrl &&
				(!!profile.copyToClipboard) === current.copyToClipboard &&
				(!!profile.appendToRunner) === current.appendToRunner
			) {
				matchedName = name;
				break;
			}
		}
		profileSelectEl.value = matchedName;
		profileNameEl.value = matchedName;
	}

	// --- PROFILES LOGIC ---

	function refreshProfileDropdown(profiles) {
		profileSelectEl.innerHTML = '<option value="">-- Saved Profiles --</option>';
		for (const name of Object.keys(profiles)) {
			const opt = document.createElement('option');
			opt.value = name;
			opt.textContent = name;
			profileSelectEl.appendChild(opt);
		}
	}

	saveProfileBtn.addEventListener('click', async () => {
		const name = profileNameEl.value.trim();
		if (!name) return alert("Please enter a profile name.");

		savedProfiles[name] = getSettingsObject();
		await chrome.storage.local.set({ savedProfiles });

		refreshProfileDropdown(savedProfiles);
		checkActiveProfileMatch();

		profileNameEl.value = '';
		saveProfileBtn.textContent = "Saved!";
		setTimeout(() => saveProfileBtn.textContent = "Save", 1500);
	});

	loadProfileBtn.addEventListener('click', () => {
		const name = profileSelectEl.value;
		if (!name || !savedProfiles[name]) return;
		applySettingsObject(savedProfiles[name]);
		loadProfileBtn.textContent = "Loaded!";
		setTimeout(() => loadProfileBtn.textContent = "Load", 1500);
	});

	deleteProfileBtn.addEventListener('click', async () => {
		const name = profileSelectEl.value;
		if (!name || !savedProfiles[name]) return;

		if (confirm(`Delete profile "${name}"?`)) {
			delete savedProfiles[name];
			await chrome.storage.local.set({ savedProfiles });
			refreshProfileDropdown(savedProfiles);
			checkActiveProfileMatch();
		}
	});

	// --- EXPORT & IMPORT LOGIC ---

	exportBtn.addEventListener('click', () => {
		const exportData = { activeSettings: getSettingsObject(), savedProfiles: savedProfiles };
		const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = "LinkRunner.settings.json";
		a.click();
		URL.revokeObjectURL(url);
	});

	importBtn.addEventListener('click', () => {
		const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

		if (isFirefox) {
			chrome.tabs.getCurrent((tab) => {
				if (tab) {
					importFileEl.click();
				} else {
					chrome.runtime.openOptionsPage();
					window.close();
				}
			});
		} else {
			importFileEl.click();
		}
	});

	importFileEl.addEventListener('change', (e) => {
		const file = e.target.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (event) => {
			try {
				const parsedData = JSON.parse(event.target.result);
				if (parsedData.activeSettings !== undefined) {
					applySettingsObject(parsedData.activeSettings);
					if (parsedData.savedProfiles) {
						savedProfiles = { ...savedProfiles, ...parsedData.savedProfiles };
						await chrome.storage.local.set({ savedProfiles });
						refreshProfileDropdown(savedProfiles);
						checkActiveProfileMatch();
					}
				} else {
					applySettingsObject(parsedData);
				}
				importBtn.textContent = "Imported!";
				setTimeout(() => importBtn.textContent = "Import JSON", 2000);
			} catch (err) {
				alert("Invalid JSON file. Cannot import.");
			}
			importFileEl.value = '';
		};
		reader.readAsText(file);
	});

	// --- LINK COLLECTOR LOGIC ---

	collectBtn.addEventListener('click', async () => {
		const matchStr = tabMatchEl.value.trim();
		const selectorStr = anchorSelectorEl.value.trim();
		const shouldFallback = fallbackToTabUrlEl.checked;
		const shouldCopy = copyToClipboardEl.checked;
		const shouldAppend = appendToRunnerEl.checked;

		if (!matchStr || !selectorStr) {
			return showCollectStatus("Inputs required!", "#f44336");
		}
		if (!shouldCopy && !shouldAppend) {
			return showCollectStatus("Select at least one action (Copy or Append)", "#f44336");
		}

		collectBtn.disabled = true;
		collectBtn.textContent = "Searching...";

		const tabs = await chrome.tabs.query({});
		const matchedTabs = tabs.filter(tab => tab.url && tab.url.includes(matchStr));
		let foundLinks = [];

		for (let tab of matchedTabs) {
			if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) continue;
			try {
				const results = await chrome.scripting.executeScript({
					target: { tabId: tab.id },
					func: (sel) => {
						const el = document.querySelector(sel);
						return el ? el.href : null;
					},
					args: [selectorStr]
				});
				if (results && results[0] && results[0].result) {
					foundLinks.push(results[0].result);
				} else if (shouldFallback) {
					foundLinks.push(tab.url);
				}
			} catch (err) { /* ignore */ }
		}

		if (foundLinks.length > 0) {
			const uniqueFoundLinks = Array.from(new Set(foundLinks));
			let statusText = `Found ${uniqueFoundLinks.length} link(s)!`;

			if (shouldCopy) {
				try {
					await navigator.clipboard.writeText(uniqueFoundLinks.join('\n'));
					statusText += " Copied.";
				} catch (err) {
					console.error("Failed to copy to clipboard", err);
					statusText += " (Copy Failed)";
				}
			}

			if (shouldAppend) {
				const existingUrls = urlListEl.value.split('\n').map(u => u.trim()).filter(u => u.length > 0);
				urlListEl.value = Array.from(new Set([...existingUrls, ...uniqueFoundLinks])).join('\n');
				updateUrlCount();
				statusText += " Appended.";
			}

			saveActiveState();
			showCollectStatus(statusText, "#1a73e8");
		} else {
			showCollectStatus("No links found.", "#f44336");
		}

		collectBtn.disabled = false;
		collectBtn.textContent = "Collect Links from Tabs";
	});

	function showCollectStatus(text, color) {
		collectStatus.textContent = text;
		collectStatus.style.color = color;
		collectStatus.style.opacity = '1';
		setTimeout(() => { collectStatus.style.opacity = '0'; }, 3000);
	}

	// --- CORE RUNNER & EVENT LISTENERS ---

	urlListEl.addEventListener('input', () => {
		updateUrlCount();
		saveActiveState();
	});

	[destUrlEl, destSelectorEl, tabMatchEl, anchorSelectorEl].forEach(el => {
		el.addEventListener('input', () => {
			saveActiveState();
			checkActiveProfileMatch();
		});
	});

	[conditionLogicEl, fallbackToTabUrlEl, copyToClipboardEl, appendToRunnerEl].forEach(el => {
		el.addEventListener('change', () => {
			saveActiveState();
			checkActiveProfileMatch();
		});
	});

	startBtn.addEventListener('click', async () => {
		await saveActiveState();
		updateButtons(true);

		const currentWindow = await chrome.windows.getCurrent();
		await chrome.storage.local.set({ targetWindowId: currentWindow.id });

		chrome.runtime.sendMessage({ action: 'START' });
	});

	stopBtn.addEventListener('click', () => {
		updateButtons(false);
		chrome.runtime.sendMessage({ action: 'STOP' });
	});

	chrome.storage.onChanged.addListener((changes) => {
		if (changes.isRunning) updateButtons(changes.isRunning.newValue);
	});

	function updateButtons(isRunning) {
		startBtn.disabled = isRunning;
		stopBtn.disabled = !isRunning;
		urlListEl.disabled = isRunning;
		destUrlEl.disabled = isRunning;
		destSelectorEl.disabled = isRunning;
		conditionLogicEl.disabled = isRunning;
		tabMatchEl.disabled = isRunning;
		anchorSelectorEl.disabled = isRunning;
		fallbackToTabUrlEl.disabled = isRunning;
		copyToClipboardEl.disabled = isRunning;
		appendToRunnerEl.disabled = isRunning;
		collectBtn.disabled = isRunning;

		saveProfileBtn.disabled = isRunning;
		loadProfileBtn.disabled = isRunning;
		deleteProfileBtn.disabled = isRunning;
		exportBtn.disabled = isRunning;
		importBtn.disabled = isRunning;
	}
});