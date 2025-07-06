document.addEventListener('DOMContentLoaded', async () => {
    // --- Element Cache ---
    const navBar = document.getElementById('nav-bar');
    const settingsBtn = document.getElementById('settings-btn');
    const resizeBtn = document.getElementById('resize-btn');
    const contentFrame = document.getElementById('content-iframe');
    const switchStable = document.getElementById('switch-stable');
    const switchLazer = document.getElementById('switch-lazer');

    // --- Global State ---
    let isCompact = await window.electronAPI.getStoreValue('isCompact') || false;
    let resizeInSettings = await window.electronAPI.getStoreValue('resizeModeInSettings') || false;

    // --- Core App Logic ---

    /**
     * Toggles the window between wide and compact modes.
     * @param {boolean} compact - True for compact mode, false for wide.
     */
    function setCompactMode(compact) {
        isCompact = compact;
        window.electronAPI.resizeWindow(isCompact);
        window.electronAPI.setStoreValue('isCompact', isCompact);
        resizeBtn.innerHTML = isCompact ? '>' : '<';
        resizeBtn.setAttribute('title', isCompact ? 'Toggle Wide View' : 'Toggle Compact View');
    }

    /**
     * Shows or hides the resize button on the right edge of the window.
     * @param {boolean} inSettings - True to hide the edge button, false to show it.
     */
    function applyResizePreference(inSettings) {
        resizeInSettings = inSettings;
        resizeBtn.style.display = inSettings ? 'none' : 'flex';
    }

    /**
     * Loads a given source URL into the main content iframe.
     * @param {string} src - The source URL for the iframe (e.g., 'paws-app://home.html').
     * @param {boolean} isPlugin - Flag to indicate if the source is a plugin.
     * @param {string|null} pluginId - The unique ID of the plugin being loaded.
     */
    function loadFrame(src, isPlugin = false, pluginId = null) {
        document.querySelectorAll('.nav-item.active').forEach(b => b.classList.remove('active'));
        
        contentFrame.style.display = 'block';
        const finalSrc = isPlugin && pluginId ? `${src}?pluginId=${pluginId}` : src;
        contentFrame.src = finalSrc;

        let buttonToActivate;
        if (isPlugin) {
            buttonToActivate = Array.from(navBar.querySelectorAll('.nav-item'))
               .find(btn => btn.dataset.pluginId === pluginId);
        } else {
            buttonToActivate = settingsBtn;
        }
        if (buttonToActivate) buttonToActivate.classList.add('active');
    }

    // --- Window & Core Control Listeners ---
    document.getElementById('minimize-btn').addEventListener('click', () => window.electronAPI.minimizeWindow());
    document.getElementById('close-btn').addEventListener('click', () => window.electronAPI.closeWindow());
    
    settingsBtn.addEventListener('click', () => {
        loadFrame('paws-app://settings.html');
    });

    resizeBtn.addEventListener('click', () => setCompactMode(!isCompact));

    // --- Client Switch Logic ---
    switchLazer.disabled = true;
    switchStable.addEventListener('click', () => {
        if (!switchStable.classList.contains('active')) {
            switchStable.classList.add('active');
            switchLazer.classList.remove('active');
            // TODO: Notify current plugin of the switch
        }
    });

    // --- Iframe Communication Bridge ---
    window.addEventListener('message', async (event) => {
        if (event.source !== contentFrame.contentWindow) return;

        const { channel, payload, id, noticeType } = event.data;

        // Handle one-way notices sent from frames (e.g., home.html)
        if (channel === 'notice-from-frame') {
            switch (noticeType) {
                case 'open-settings-to-plugins':
                    settingsBtn.click(); // Open settings
                    // Tell the settings frame to switch to the plugins tab
                    setTimeout(() => {
                        contentFrame.contentWindow.postMessage({ channel: 'notice', payload: { type: 'show-pending-plugins' } }, '*');
                    }, 150); // Delay to ensure frame is loaded
                    break;
                case 'resize-control-location-changed':
                    applyResizePreference(payload.inSettings);
                    break;
            }
            return; // This is a one-way notice, no reply needed.
        }

        if (typeof id === 'undefined' || !channel) return;

        // Handle two-way, promise-based requests from frames
        const reply = (data) => contentFrame.contentWindow.postMessage(data, '*');
        try {
            let result;
            switch (channel) {
                case 'get':
                    result = await window.electronAPI.get(payload);
                    break;
                case 'post':
                    result = await window.electronAPI.post(payload.endpoint, payload.body);
                    break;
                case 'get-store-value':
                    result = await window.electronAPI.getStoreValue(payload);
                    break;
                case 'set-store-value':
                    result = await window.electronAPI.setStoreValue(payload.key, payload.value);
                    break;
                case 'show-open-dialog':
                    result = await window.electronAPI.showOpenDialog(payload);
                    break;
                case 'restart-app':
                    result = await window.electronAPI.restartApp();
                    break;
                case 'resize-window':
                    setCompactMode(payload.isCompact);
                    break;
                default:
                    throw new Error(`Unknown IPC channel from frame: ${channel}`);
            }
            reply({ id, result });
        } catch (error) {
            reply({ id, error: error.message });
        }
    });

    // --- App Initialization ---
    async function loadPluginsIntoNavbar() {
        try {
            const plugins = await window.electronAPI.get('/api/plugins/loaded');
            navBar.querySelectorAll('.nav-item:not(#settings-btn)').forEach(item => item.remove());

            plugins.forEach(plugin => {
                const pluginBtn = document.createElement('button');
                pluginBtn.classList.add('nav-item');
                pluginBtn.textContent = plugin.name.substring(0, 8);
                pluginBtn.title = `${plugin.name} v${plugin.version}\n${plugin.description || 'No description'}`;
                
                const pluginId = plugin.id.toLowerCase();
                pluginBtn.dataset.pluginId = pluginId;
                
                if (plugin.ui && plugin.ui.entry) {
                    pluginBtn.addEventListener('click', () => {
                        loadFrame(`paws-plugin://${pluginId}/${plugin.ui.entry}`, true, pluginId);
                    });
                } else {
                    pluginBtn.disabled = true;
                    pluginBtn.title += '\n(This plugin has no UI)';
                }
                navBar.insertBefore(pluginBtn, settingsBtn);
            });
        } catch (error) {
            console.error(`Error loading plugins into navbar: ${error.message}`);
        }
    }

    async function initializeApp() {
        setCompactMode(isCompact);
        applyResizePreference(resizeInSettings);
        
        const stablePath = await window.electronAPI.getStoreValue('osuStablePath');
        if (stablePath) await window.electronAPI.post('/api/paths/stable', { path: stablePath });
        
        const lazerPath = await window.electronAPI.getStoreValue('osuLazerPath');
        if (lazerPath) await window.electronAPI.post('/api/paths/lazer', { path: lazerPath });

        await loadPluginsIntoNavbar();

        const loadedPlugins = await window.electronAPI.get('/api/plugins/loaded');
        if (loadedPlugins && loadedPlugins.length > 0) {
            navBar.querySelector('.nav-item:not(#settings-btn)').click();
        } else {
            loadFrame('paws-app://home.html');
        }

        const pendingPlugins = await window.electronAPI.get('/api/plugins/pending');
        if (pendingPlugins && pendingPlugins.length > 0) {
            setTimeout(() => {
                if (contentFrame.src.includes('settings.html')) {
                     contentFrame.contentWindow.postMessage({ channel: 'notice', payload: { type: 'show-pending-plugins' } }, '*');
                }
            }, 500);
        }

        window.electronAPI.signalRendererReady();
    }

    initializeApp();
});