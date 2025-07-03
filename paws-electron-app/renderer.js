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

    // --- Test Control Listeners (Declared early to be accessible) ---
    const testReadBtn = document.getElementById('test-read-btn');
    const testWriteBtn = document.getElementById('test-write-btn');
    const testResultsDiv = document.getElementById('test-results');

    if (testReadBtn) {
        testReadBtn.addEventListener('click', async () => {
            testResultsDiv.style.color = '#c0c0c0';
            testResultsDiv.textContent = 'Testing read access...';
            try {
                const result = await window.electronAPI.testLazerConnection();
                testResultsDiv.style.color = '#77dd77';
                testResultsDiv.textContent = `Success! Found ${result.beatmapSetCount} beatmap sets.`;
            } catch (error) {
                testResultsDiv.style.color = '#ff6961';
                // Extract the 'detail' from the ProblemDetails response if it exists
                const errorMessage = error.message.includes('{') ? JSON.parse(error.message).detail : error.message;
                testResultsDiv.textContent = `Error: ${errorMessage || 'Could not connect. Is the backend running?'}`;
            }
        });
    }
    
    if (testWriteBtn) {
        testWriteBtn.addEventListener('click', async () => {
            testResultsDiv.style.color = '#c0c0c0';
            testResultsDiv.textContent = 'Testing write access... (requires lazer to be closed)';
            try {
                const result = await window.electronAPI.testLazerWrite();
                testResultsDiv.style.color = '#77dd77';
                testResultsDiv.textContent = `Success! ${result.message}`;
            } catch (error) {
                testResultsDiv.style.color = '#ff6961';
                
                // THE FIX: Robustly find and parse the JSON within the error message.
                let detailMessage = error.message;
                const jsonStartIndex = error.message.indexOf('{');
                if (jsonStartIndex !== -1) {
                    try {
                        const jsonString = error.message.substring(jsonStartIndex);
                        const parsedError = JSON.parse(jsonString);
                        detailMessage = parsedError.detail || jsonString;
                    } catch {
                        // Ignore parsing errors, just show the original message
                    }
                }
                
                testResultsDiv.textContent = `Error: ${detailMessage}`;
            }
        });
    }

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
        // We only process messages that look like they come from our API bridge
        const { channel, payload, id } = event.data;
        if (typeof id === 'undefined' || !channel) {
            return;
        }

        // THE FIX: Use '*' as the targetOrigin to ensure the message is always delivered
        // back to our sandboxed iframe, bypassing the browser's tricky origin checks
        // for custom protocols.
        const reply = (data) => event.source.postMessage(data, '*');

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
                    if (!payload.pluginId) {
                        throw new Error('Plugin command is missing the required pluginId.');
                    }
                    result = await window.electronAPI.executePluginCommand(payload.pluginId, payload.command, payload.payload);
                    break;
                case 'show-open-dialog':
                    result = await window.electronAPI.showOpenDialog(payload);
                    break;
                default:
                    throw new Error(`Unknown IPC channel from plugin: ${channel}`);
            }
            reply({ id, result });
        } catch (error) {
            reply({ id, error: error.message });
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
                await window.electronAPI.setStoreValue('osuLazerPath', lazerInput.value);
                // After setting the path, immediately inform the backend
                await window.electronAPI.setLazerPath(lazerInput.value);
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

    // --- Plugin Approval Modal ---
    function showPluginApprovalModal(pendingPlugins, currentlyApproved) {
        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'modal-backdrop';
        modalBackdrop.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000;';
        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background-color: #2a2a2e; color: #e0e0e0; padding: 25px; border-radius: 8px; width: 500px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);';
        let innerHTML = '<h2>New Plugins Discovered</h2><p>Please review and approve the plugins you want to enable.</p><div style="max-height: 200px; overflow-y: auto; border: 1px solid #444; padding: 10px; margin-bottom: 15px;">';
        pendingPlugins.forEach(plugin => {
            innerHTML += `<div style="margin-bottom: 10px;"><label style="display: flex; align-items: center; cursor: pointer;"><input type="checkbox" class="approve-checkbox" data-guid="${plugin.id}" checked style="margin-right: 10px; width: 18px; height: 18px;"><div><strong>${plugin.name} v${plugin.version}</strong> by ${plugin.author || 'Unknown'}<p style="font-size: 0.9em; margin: 2px 0 0 0; color: #b0b0b0;">${plugin.description || 'No description.'}</p></div></label></div>`;
        });
        innerHTML += '</div>';
        modalContent.innerHTML = innerHTML;
        const buttonContainer = document.createElement('div');
        buttonContainer.style.textAlign = 'right';
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save & Restart Later';
        saveButton.style.cssText = 'background-color: #9f3a55; border: none; color: white; padding: 10px 15px; border-radius: 5px; cursor: pointer;';
        saveButton.onclick = async () => {
            const approvedGuids = [...currentlyApproved];
            document.querySelectorAll('.approve-checkbox:checked').forEach(cb => { approvedGuids.push(cb.dataset.guid); });
            await window.electronAPI.setApprovedPlugins([...new Set(approvedGuids)]);
            document.body.removeChild(modalBackdrop);
        };
        buttonContainer.appendChild(saveButton);
        modalContent.appendChild(buttonContainer);
        modalBackdrop.appendChild(modalContent);
        document.body.appendChild(modalBackdrop);
    }

    // --- App Initialization ---
    async function loadPluginsIntoNavbar() {
        try {
            const response = await fetch(`${apiBaseUrl}/api/plugins`);
            if (!response.ok) throw new Error(`Failed to fetch plugins: ${response.status}`);
            const plugins = await response.json();
            const existingNavItems = navBar.querySelectorAll('.nav-item:not(#settings-btn)');
            existingNavItems.forEach(item => item.remove());
            plugins.forEach(plugin => {
                const pluginBtn = document.createElement('button');
                pluginBtn.classList.add('nav-item');
                pluginBtn.textContent = plugin.name.substring(0, 8);
                pluginBtn.title = `${plugin.name} v${plugin.version}\n${plugin.description}`;
                if (plugin.ui && plugin.ui.entry) {
                    pluginBtn.addEventListener('click', () => {
                        welcomeMessage.style.display = 'none';
                        pluginIframe.style.display = 'block';
                        
                        // THE FIX: Pass the plugin ID as a URL parameter
                        const pluginId = plugin.id.toLowerCase();
                        pluginIframe.src = `paws-plugin://${pluginId}/${plugin.ui.entry}?pluginId=${pluginId}`;
                    });
                } else {
                    pluginBtn.disabled = true;
                    pluginBtn.title += '\n(This plugin has no UI)';
                    pluginBtn.style.cursor = 'not-allowed';
                    pluginBtn.style.filter = 'grayscale(80%)';
                }
                navBar.insertBefore(pluginBtn, settingsBtn);
            });
        } catch (error) {
            console.error(`Error loading plugins into navbar: ${error.message}`);
        }
    }

    async function initializeApp() {
        apiBaseUrl = await window.electronAPI.getApiBaseUrl();
        
        // --- Set Lazer Path on startup ---
        const lazerPath = await window.electronAPI.getStoreValue('osuLazerPath');
        if (lazerPath) {
            await window.electronAPI.setLazerPath(lazerPath);
        }

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