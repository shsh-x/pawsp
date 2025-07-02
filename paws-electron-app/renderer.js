document.addEventListener('DOMContentLoaded', async () => {
    // --- Element Cache ---
    const minimizeBtn = document.getElementById('minimize-btn');
    const closeBtn = document.getElementById('close-btn');
    const navBar = document.getElementById('nav-bar');
    const settingsBtn = document.getElementById('settings-btn');
    const resizeBtn = document.getElementById('resize-btn');
    const pluginIframe = document.getElementById('plugin-iframe');
    const welcomeMessage = document.getElementById('welcome-message');
    const switchStable = document.getElementById('switch-stable');
    const switchLazer = document.getElementById('switch-lazer');

    // --- Global State ---
    let apiBaseUrl = '';
    let isCompact = false;
    let resizeInSettings = false;

    // --- Core App Logic ---
    function setCompactMode(compact) {
        isCompact = compact;
        window.electronAPI.resizeWindow(isCompact);
        // Always keep the edge button's text in sync, even if hidden
        resizeBtn.innerHTML = isCompact ? '>' : '<';
        resizeBtn.setAttribute('title', isCompact ? 'Toggle Wide View' : 'Toggle Compact View');
    }

    function applyResizePreference(inSettings) {
        resizeInSettings = inSettings;
        resizeBtn.style.display = resizeInSettings ? 'none' : 'flex';
    }

    // --- Window & Core Control Listeners ---
    minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());
    settingsBtn.addEventListener('click', showSettingsModal);
    resizeBtn.addEventListener('click', () => setCompactMode(!isCompact));

    // --- Client Switch Logic ---
    switchLazer.disabled = true;
    switchStable.addEventListener('click', () => {
        if (!switchStable.classList.contains('active')) {
            switchStable.classList.add('active');
            switchLazer.classList.remove('active');
            console.log('Switched to Stable client mode.');
        }
    });

    // --- Plugin Iframe Communication ---
    window.addEventListener('message', async (event) => {
        if (event.source !== pluginIframe.contentWindow) return;
        const { channel, payload, id } = event.data;
        if (!id || !channel) return;

        try {
            let result;
            switch (channel) {
                case 'get-store-value':
                    result = await window.electronAPI.getStoreValue(payload);
                    break;
                case 'set-store-value':
                    result = await window.electronAPI.setStoreValue(payload.key, payload.value);
                    break;
                case 'execute-plugin-command':
                    result = await window.electronAPI.executePluginCommand(payload.pluginId, payload.command, payload.payload);
                    break;
                case 'show-open-dialog':
                    result = await window.electronAPI.showOpenDialog(payload);
                    break;
                default:
                    throw new Error(`Unknown IPC channel from plugin: ${channel}`);
            }
            pluginIframe.contentWindow.postMessage({ id, result }, '*');
        } catch (error) {
            pluginIframe.contentWindow.postMessage({ id, error: error.message }, '*');
        }
    });

    // --- Settings Modal ---
    async function showSettingsModal() {
        if (document.getElementById('settings-modal-backdrop')) return;

        const stablePath = await window.electronAPI.getStoreValue('osuStablePath') || '';
        const lazerPath = await window.electronAPI.getStoreValue('osuLazerPath') || '';

        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'settings-modal-backdrop';

        modalBackdrop.innerHTML = `
            <div id="settings-modal-content">
                <h2>settings</h2>
                <div class="settings-group">
                    <label for="stable-path-input">osu!(stable) Path</label>
                    <div class="settings-input-container">
                        <input type="text" id="stable-path-input" class="settings-input" value="${stablePath}" placeholder="Path to osu!(stable) installation" readonly>
                        <button id="stable-browse-btn" class="settings-browse-btn">Browse...</button>
                    </div>
                </div>
                <div class="settings-group">
                    <label for="lazer-path-input">osu!(lazer) Path</label>
                    <div class="settings-input-container">
                        <input type="text" id="lazer-path-input" class="settings-input" value="${lazerPath}" placeholder="Path to osu!(lazer) installation" readonly>
                        <button id="lazer-browse-btn" class="settings-browse-btn">Browse...</button>
                    </div>
                </div>
                <div class="settings-divider"></div>
                <div class="settings-group">
                    <label class="settings-toggle-label">
                        <span>Resize in settings</span>
                        <input type="checkbox" id="resize-in-settings-toggle">
                    </label>
                    <div id="settings-resize-toggle-container" style="display: none;">
                         <div class="client-switch">
                            <button id="settings-resize-wide" class="switch-btn">wide</button>
                            <button id="settings-resize-compact" class="switch-btn">compact</button>
                        </div>
                    </div>
                </div>
                <div id="settings-modal-actions">
                    <button id="settings-close-btn">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalBackdrop);

        // --- Event Listeners for Modal Elements ---
        const stableInput = document.getElementById('stable-path-input');
        const lazerInput = document.getElementById('lazer-path-input');
        const resizeInSettingsToggle = document.getElementById('resize-in-settings-toggle');
        const resizeToggleContainer = document.getElementById('settings-resize-toggle-container');
        const resizeWideBtn = document.getElementById('settings-resize-wide');
        const resizeCompactBtn = document.getElementById('settings-resize-compact');

        // Initial state setup
        resizeInSettingsToggle.checked = resizeInSettings;
        resizeToggleContainer.style.display = resizeInSettings ? 'block' : 'none';
        if (isCompact) {
            resizeCompactBtn.classList.add('active');
        } else {
            resizeWideBtn.classList.add('active');
        }

        // Path selection logic
        document.getElementById('stable-browse-btn').addEventListener('click', async () => {
            const result = await window.electronAPI.showOpenDialog({ properties: ['openDirectory'], title: 'Select osu!(stable) installation folder' });
            if (!result.canceled && result.filePaths.length > 0) {
                stableInput.value = result.filePaths[0];
                window.electronAPI.setStoreValue('osuStablePath', stableInput.value);
            }
        });

        document.getElementById('lazer-browse-btn').addEventListener('click', async () => {
            const result = await window.electronAPI.showOpenDialog({ properties: ['openDirectory'], title: 'Select osu!(lazer) installation folder' });
            if (!result.canceled && result.filePaths.length > 0) {
                lazerInput.value = result.filePaths[0];
                window.electronAPI.setStoreValue('osuLazerPath', lazerInput.value);
            }
        });
        
        // Resize preference logic
        resizeInSettingsToggle.addEventListener('change', (e) => {
            const newPreference = e.target.checked;
            applyResizePreference(newPreference);
            resizeToggleContainer.style.display = newPreference ? 'block' : 'none';
            window.electronAPI.setStoreValue('resizeModeInSettings', newPreference);
        });

        // In-settings resize logic
        resizeWideBtn.addEventListener('click', () => {
            if (isCompact) {
                setCompactMode(false);
                resizeWideBtn.classList.add('active');
                resizeCompactBtn.classList.remove('active');
            }
        });
        resizeCompactBtn.addEventListener('click', () => {
            if (!isCompact) {
                setCompactMode(true);
                resizeCompactBtn.classList.add('active');
                resizeWideBtn.classList.remove('active');
            }
        });

        const closeModal = () => document.body.removeChild(modalBackdrop);
        document.getElementById('settings-close-btn').addEventListener('click', closeModal);
        modalBackdrop.addEventListener('click', (e) => {
            if (e.target.id === 'settings-modal-backdrop') closeModal();
        });
    }

    // --- Plugin Approval Modal --- (Unchanged from previous version)
    function showPluginApprovalModal(pendingPlugins, currentlyApproved) {
        // ... (code is identical to before)
    }

    // --- App Initialization ---
    async function loadPluginsIntoNavbar() {
        // ... (code is identical to before)
    }

    async function initializeApp() {
        apiBaseUrl = await window.electronAPI.getApiBaseUrl();
        
        const shouldResizeInSettings = await window.electronAPI.getStoreValue('resizeModeInSettings') || false;
        applyResizePreference(shouldResizeInSettings);

        await loadPluginsIntoNavbar();

        try {
            const pendingResponse = await fetch(`${apiBaseUrl}/api/plugins/pending`);
            if (!pendingResponse.ok) throw new Error('Could not fetch pending plugins.');
            const pendingPlugins = await pendingResponse.json();
            if (pendingPlugins && pendingPlugins.length > 0) {
                const currentlyApproved = await window.electronAPI.getApprovedPlugins();
                showPluginApprovalModal(pendingPlugins, currentlyApproved);
            }
        } catch (error) {
            console.error("Error checking for pending plugins:", error);
        }
        window.electronAPI.signalRendererReady();
    }

    initializeApp();
});