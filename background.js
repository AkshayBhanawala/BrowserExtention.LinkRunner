let currentTabId = null;

// Listen for commands from the Popup UI and the injected Content Scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'START') {
		startSequence();
	} else if (request.action === 'STOP') {
		stopSequence();
	} else if (request.action === 'CONDITION_MET') {
		executeNext();
	}
});

async function startSequence() {
	const data = await chrome.storage.local.get(['urlList']);
	let urls = data.urlList ? data.urlList.split('\n').map(u => u.trim()).filter(u => u.length > 0) : [];

	if (urls.length === 0) return;

	await chrome.storage.local.set({ pendingUrls: urls, isRunning: true });
	updateBadge(urls.length);
	executeNext();
}

async function stopSequence() {
	await chrome.storage.local.set({ isRunning: false, pendingUrls: [] });
	chrome.action.setBadgeText({ text: '' });
	currentTabId = null;
}

async function executeNext() {
	const data = await chrome.storage.local.get(['pendingUrls', 'isRunning']);
	if (!data.isRunning) return;

	let urls = data.pendingUrls || [];
	if (urls.length === 0) {
		await stopSequence();
		return;
	}

	const nextUrl = urls.shift();
	await chrome.storage.local.set({ pendingUrls: urls });

	// Total pending includes the one about to run
	updateBadge(urls.length + 1);

	chrome.tabs.create({ url: nextUrl }, (tab) => {
		currentTabId = tab.id;
	});
}

function updateBadge(count) {
	if (count > 0) {
		chrome.action.setBadgeText({ text: count.toString() });
		chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
	} else {
		chrome.action.setBadgeText({ text: '' });
	}
}

// Ensure the sequence stops if the active tab is closed by the user manually
chrome.tabs.onRemoved.addListener(async (tabId) => {
	const data = await chrome.storage.local.get(['isRunning']);
	if (data.isRunning && tabId === currentTabId) {
		stopSequence();
	}
});

// Detect when the spawned tab finishes loading a page (handles redirects and SPAs)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	const data = await chrome.storage.local.get(['isRunning', 'destUrl', 'destSelector']);

	if (data.isRunning && tabId === currentTabId && changeInfo.status === 'complete') {
		injectConditionChecker(tabId, data.destUrl, data.destSelector);
	}
});

function injectConditionChecker(tabId, destUrl, destSelector) {
	// Only attempt injection if the URL is valid (avoids chrome:// URLs which throw errors)
	chrome.tabs.get(tabId, (tab) => {
		if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
			chrome.scripting.executeScript({
				target: { tabId: tabId },
				func: runChecker,
				args: [destUrl, destSelector]
			}).catch(err => console.error("Injection failed:", err));
		}
	});
}

// --- THIS FUNCTION RUNS IN THE CONTEXT OF THE WEBPAGE ---
function runChecker(destUrl, destSelector) {
	// Clear any previously injected interval on this tab to avoid overlaps
	if (window.extensionCheckerInterval) {
		clearInterval(window.extensionCheckerInterval);
	}

	window.extensionCheckerInterval = setInterval(() => {
		// If an input wasn't provided, it automatically counts as "met"
		let urlMet = !destUrl;
		let selectorMet = !destSelector;

		if (destUrl && window.location.href.includes(destUrl)) {
			urlMet = true;
		}

		if (destSelector && document.querySelector(destSelector)) {
			selectorMet = true;
		}

		// If both explicit and implicit conditions are met
		if (urlMet && selectorMet) {
			clearInterval(window.extensionCheckerInterval);
			chrome.runtime.sendMessage({ action: "CONDITION_MET" });
		}
	}, 1000); // Polls every 1 second
}