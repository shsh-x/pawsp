document.addEventListener('DOMContentLoaded', () => {
    // --- Phase 1: Synchronous Setup ---
    // This code runs immediately and without interruption.
    // We get all the elements we need and attach all critical listeners.

    const navBar = document.getElementById('nav-bar');
    const settingsBtn = document.getElementById('settings-btn');
    const resizeBtn = document.getElementById('resize-btn');
    const contentFrame = document.getElementById('content-iframe');
    const clientSwitch = document.getElementById('client-switch');
    const minimizeBtn = document.getElementById('minimize-btn');
    const closeBtn = document.getElementById('close-btn');

    if (!minimizeBtn || !closeBtn || !settingsBtn) {
        // If these critical elements don't exist, we can't continue.
        console.error("Critical UI elements are missing from index.html! Cannot initialize renderer.");
        return;
    }

    minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());
    settingsBtn.addEventListener('click', () => loadFrame('paws-app://settings.html'));
    resizeBtn.addEventListener('click', () => setCompactMode(!isCompact));
    
    // --- Global State Variables (defined synchronously) ---
    let currentMode = 'stable';
    let isCompact = false;
    let resizeInSettings = false;
    let modeSwitchInSettings = false;

    // --- Core App Logic Functions (defined synchronously) ---
    // (Functions are just definitions, they don't run yet)
    function setCompactMode(compact) {
        isCompact = compact;
        window.electronAPI.resizeWindow(isCompact);
        window.electronAPI.setStoreValue('isCompact', isCompact);
        resizeBtn.innerHTML = isCompact ? '>' : '<';
        resizeBtn.setAttribute('title', isCompact ? 'Toggle Wide View' : 'Toggle Compact View');
    }

    function applyResizePreference(inSettings) {
        resizeInSettings = inSettings;
        resizeBtn.style.display = inSettings ? 'none' : 'flex';
    }

    function applyModeSwitchPreference(inSettings) {
        modeSwitchInSettings = inSettings;
        clientSwitch.style.display = inSettings ? 'none' : 'flex';
    }

    function updateMode(newMode, force = false) {
        if (currentMode === newMode && !force) return;
        currentMode = newMode;
        
        clientSwitch.querySelectorAll('.switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === newMode);
        });

        window.electronAPI.setStoreValue('clientMode', newMode);
        
        if (contentFrame.contentWindow) {
            contentFrame.contentWindow.postMessage({ channel: 'notice', payload: { type: 'mode-changed', mode: newMode } }, '*');
        }
    }
    
    clientSwitch.addEventListener('click', (e) => {
        if (e.target.matches('.switch-btn')) {
            updateMode(e.target.dataset.mode);
        }
    });

    function loadFrame(src, isPlugin = false, pluginId = null) {
        document.querySelectorAll('.nav-item.active').forEach(b => b.classList.remove('active'));
        contentFrame.style.display = 'block';
        const finalSrc = isPlugin && pluginId ? `${src}?pluginId=${pluginId}` : src;
        
        contentFrame.onload = () => {
            if (contentFrame.contentWindow) {
                contentFrame.contentWindow.postMessage({ channel: 'notice', payload: { type: 'mode-changed', mode: currentMode } }, '*');
            }
        };
        contentFrame.src = finalSrc;

        const targetBtn = isPlugin 
            ? Array.from(navBar.querySelectorAll('.nav-item')).find(btn => btn.dataset.pluginId === pluginId)
            : settingsBtn;
        
        if (targetBtn) targetBtn.classList.add('active');
    }

    // --- Phase 2: Asynchronous Initialization ---
    // This function will fetch data and perform the rest of the setup.
    // An error here will not crash the main UI listeners.
    async function initializeAsync() {
        try {
            // Load initial state from store
            currentMode = await window.electronAPI.getStoreValue('clientMode') || 'stable';
            isCompact = await window.electronAPI.getStoreValue('isCompact') || false;
            resizeInSettings = await window.electronAPI.getStoreValue('resizeModeInSettings') || false;
            modeSwitchInSettings = await window.electronAPI.getStoreValue('modeSwitchInSettings') || false;

            // Apply initial UI settings
            setCompactMode(isCompact);
            applyResizePreference(resizeInSettings);
            applyModeSwitchPreference(modeSwitchInSettings);
            updateMode(currentMode, true);

            // Sync paths to backend
            const stablePath = await window.electronAPI.getStoreValue('osuStablePath');
            if (stablePath) await window.electronAPI.post('/api/paths/stable', { path: stablePath });
            const lazerPath = await window.electronAPI.getStoreValue('osuLazerPath');
            if (lazerPath) await window.electronAPI.post('/api/paths/lazer', { path: lazerPath });

            // Load plugins and decide initial frame
            await loadPluginsIntoNavbar();
            const loadedPlugins = await window.electronAPI.get('/api/plugins/loaded');
            if (loadedPlugins && loadedPlugins.length > 0) {
                navBar.querySelector('.nav-item:not(#settings-btn)').click();
            } else {
                loadFrame('paws-app://home.html');
            }

            // Check for pending plugins
            const pendingPlugins = await window.electronAPI.get('/api/plugins/pending');
            if (pendingPlugins && pendingPlugins.length > 0) {
                settingsBtn.click();
                setTimeout(() => {
                    contentFrame.contentWindow.postMessage({ channel: 'notice', payload: { type: 'show-pending-plugins' } }, '*');
                }, 500);
            }
        } catch (error) {
            console.error("Error during async initialization:", error);
            // Optionally, show an error message to the user in the UI
        } finally {
            // This is the most important call. It must happen even if init fails.
            window.electronAPI.signalRendererReady();
        }
    }
    
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
    
    // --- Inter-Frame Communication ---
    // (This listener is safe to attach now)
    window.addEventListener('message', async (event) => {
        if (event.source !== contentFrame.contentWindow) return;
        const { channel, payload, id, noticeType } = event.data;

        // Handle one-way notices from frames
        if (channel === 'notice-from-frame') {
            switch (noticeType) {
                case 'open-settings-to-plugins':
                    settingsBtn.click();
                    setTimeout(() => {
                        contentFrame.contentWindow.postMessage({ channel: 'notice', payload: { type: 'show-pending-plugins' } }, '*');
                    }, 100);
                    break;
                case 'mode-control-location-changed': applyModeSwitchPreference(payload.inSettings); break;
                case 'resize-control-location-changed': applyResizePreference(payload.inSettings); break;
                case 'client-mode-changed': updateMode(payload.mode, true); break;
            }
            return;
        }
        
        // Handle request/response calls
        if (typeof id === 'undefined' || !channel) return;
        const reply = (data) => contentFrame.contentWindow.postMessage(data, '*');
        try {
            let result;
            switch (channel) {
                case 'get': result = await window.electronAPI.get(payload); break;
                case 'post': result = await window.electronAPI.post(payload.endpoint, payload.body); break;
                case 'get-store-value': result = await window.electronAPI.getStoreValue(payload); break;
                case 'set-store-value': result = await window.electronAPI.setStoreValue(payload.key, payload.value); break;
                case 'show-open-dialog': result = await window.electronAPI.showOpenDialog(payload); break;
                case 'restart-app': result = await window.electronAPI.restartApp(); break;
                case 'resize-window': setCompactMode(payload.isCompact); break;
                default: throw new Error(`Unknown IPC channel from frame: ${channel}`);
            }
            reply({ id, result });
        } catch (error) {
            reply({ id, error: error.message });
        }
    });

    // --- Kick off the async part of initialization ---
    initializeAsync();
});