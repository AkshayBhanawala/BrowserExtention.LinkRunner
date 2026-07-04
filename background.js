let currentTabId = null;

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
	const data = await chrome.storage.local.get(['pendingUrls', 'isRunning', 'targetWindowId']);
	if (!data.isRunning) return;

	let urls = data.pendingUrls || [];
	if (urls.length === 0) {
		await stopSequence();
		return;
	}

	const nextUrl = urls.shift();
	await chrome.storage.local.set({ pendingUrls: urls });

	updateBadge(urls.length + 1);

	// Setup the options for the new tab
	let tabOptions = { url: nextUrl };

	// Verify the original window still exists, then assign it
	if (data.targetWindowId) {
		try {
			await chrome.windows.get(data.targetWindowId);
			tabOptions.windowId = data.targetWindowId;
		} catch (err) {
			// Window was closed by the user; fallback to Chrome's default behavior
		}
	}

	// Create the tab with the targeted window options
	chrome.tabs.create(tabOptions, (tab) => {
		currentTabId = tab.id;
	});
}

function updateBadge(count) {
	if (count > 0) {
		chrome.action.setBadgeText({ text: count.toString() });
		chrome.action.setBadgeBackgroundColor({ color: '#0fe279' });
	} else {
		chrome.action.setBadgeText({ text: '' });
	}
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
	const data = await chrome.storage.local.get(['isRunning']);
	if (data.isRunning && tabId === currentTabId) {
		stopSequence();
	}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	// We now retrieve conditionLogic from storage
	const data = await chrome.storage.local.get(['isRunning', 'destUrl', 'destSelector', 'conditionLogic']);

	if (data.isRunning && tabId === currentTabId && changeInfo.status === 'complete') {
		// Fallback to 'AND' if for some reason the setting wasn't saved yet
		const logic = data.conditionLogic || 'AND';
		injectConditionChecker(tabId, data.destUrl, data.destSelector, logic);
	}
});

function injectConditionChecker(tabId, destUrl, destSelector, conditionLogic) {
	chrome.tabs.get(tabId, (tab) => {
		if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
			chrome.scripting.executeScript({
				target: { tabId: tabId },
				func: runChecker,
				// Pass conditionLogic as the third argument to the injected function
				args: [destUrl, destSelector, conditionLogic]
			}).catch(err => console.error("Injection failed:", err));
		}
	});
}

// --- THIS FUNCTION RUNS IN THE CONTEXT OF THE WEBPAGE ---
function runChecker(destUrl, destSelector, conditionLogic) {
	if (window.extensionCheckerInterval) {
		clearInterval(window.extensionCheckerInterval);
	}

	window.extensionCheckerInterval = setInterval(() => {
		const urlProvided = !!destUrl;
		const selectorProvided = !!destSelector;

		let urlMet = false;
		let selectorMet = false;

		if (urlProvided && window.location.href.includes(destUrl)) {
			urlMet = true;
		}

		if (selectorProvided && document.querySelector(destSelector)) {
			selectorMet = true;
		}

		let isDone = false;

		// If user didn't provide either condition, proceed immediately
		if (!urlProvided && !selectorProvided) {
			isDone = true;
		} else if (conditionLogic === 'OR') {
			// OR logic: true if AT LEAST ONE provided condition evaluates to true
			if ((urlProvided && urlMet) || (selectorProvided && selectorMet)) {
				isDone = true;
			}
		} else {
			// AND logic: evaluate provided conditions. If not provided, treat as 'met'
			const finalUrlCondition = !urlProvided || urlMet;
			const finalSelectorCondition = !selectorProvided || selectorMet;

			if (finalUrlCondition && finalSelectorCondition) {
				isDone = true;
			}
		}

		if (isDone) {
			clearInterval(window.extensionCheckerInterval);
			chrome.runtime.sendMessage({ action: "CONDITION_MET" });
		}
	}, 1000);
}