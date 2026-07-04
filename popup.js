document.addEventListener('DOMContentLoaded', async () => {
	const urlListEl = document.getElementById('urlList');
	const destUrlEl = document.getElementById('destUrl');
	const destSelectorEl = document.getElementById('destSelector');

	const saveBtn = document.getElementById('saveBtn');
	const saveStatus = document.getElementById('saveStatus');
	const startBtn = document.getElementById('startBtn');
	const stopBtn = document.getElementById('stopBtn');

	// 1. Restore previous state and inputs when popup opens
	const data = await chrome.storage.local.get(['urlList', 'destUrl', 'destSelector', 'isRunning']);
	if (data.urlList) urlListEl.value = data.urlList;
	if (data.destUrl) destUrlEl.value = data.destUrl;
	if (data.destSelector) destSelectorEl.value = data.destSelector;

	updateButtons(data.isRunning);

	// 2. Core save function
	async function saveSettings(showVisualFeedback = false) {
		await chrome.storage.local.set({
			urlList: urlListEl.value,
			destUrl: destUrlEl.value.trim(),
			destSelector: destSelectorEl.value.trim()
		});

		// Flash "Saved!" message if manually clicked
		if (showVisualFeedback) {
			saveStatus.style.opacity = '1';
			setTimeout(() => {
				saveStatus.style.opacity = '0';
			}, 1500);
		}
	}

	// 3. Auto-save triggers: Fires every time the user types or pastes
	urlListEl.addEventListener('input', () => saveSettings(false));
	destUrlEl.addEventListener('input', () => saveSettings(false));
	destSelectorEl.addEventListener('input', () => saveSettings(false));

	// 4. Manual save trigger
	saveBtn.addEventListener('click', () => saveSettings(true));

	// 5. Start / Stop Logic
	startBtn.addEventListener('click', async () => {
		await saveSettings(false); // Guarantee final state is saved before starting
		updateButtons(true);
		chrome.runtime.sendMessage({ action: 'START' });
	});

	stopBtn.addEventListener('click', () => {
		updateButtons(false);
		chrome.runtime.sendMessage({ action: 'STOP' });
	});

	// 6. Listen for state changes (e.g., when the background script finishes all URLs)
	chrome.storage.onChanged.addListener((changes) => {
		if (changes.isRunning) {
			updateButtons(changes.isRunning.newValue);
		}
	});

	// 7. UI state manager
	function updateButtons(isRunning) {
		startBtn.disabled = isRunning;
		stopBtn.disabled = !isRunning;
		urlListEl.disabled = isRunning;
		destUrlEl.disabled = isRunning;
		destSelectorEl.disabled = isRunning;
		saveBtn.disabled = isRunning; // Prevent manual saving while the sequence is active
	}
});