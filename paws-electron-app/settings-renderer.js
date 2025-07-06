document.addEventListener('DOMContentLoaded', async () => {

    // --- Element Cache ---
    const tabs = {
        general: document.getElementById('tab-general'),
        plugins: document.getElementById('tab-plugins'),
    };

    const tabButtons = {
        general: document.querySelector('.tab-btn[data-tab="general"]'),
        plugins: document.querySelector('.tab-btn[data-tab="plugins"]'),
    };

    const installedList = document.getElementById('installed-plugins-list');
    const storeList = document.getElementById('store-plugins-list');
    const restartBtn = document.getElementById('restart-btn');
    
    // --- State ---
    let needsRestart = false;
    let currentlyApprovedGuids = [];

    // --- Tab Switching Logic ---
    Object.values(tabButtons).forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            if (!tabs[tabName]) return;

            Object.values(tabs).forEach(tab => tab.classList.remove('active'));
            Object.values(tabButtons).forEach(btn => btn.classList.remove('active'));
            
            tabs[tabName].classList.add('active');
            button.classList.add('active');
        });
    });

    // --- General Settings: Path Controls ---
    const stablePathInput = document.getElementById('stable-path-input');
    const lazerPathInput = document.getElementById('lazer-path-input');

    document.getElementById('stable-browse-btn').addEventListener('click', async () => {
        const result = await window.paws.showOpenDialog({ properties: ['openDirectory'], title: 'Select osu!(stable) installation folder' });
        if (!result.canceled && result.filePaths.length > 0) {
            const newPath = result.filePaths[0];
            stablePathInput.value = newPath;
            await window.paws.setStoreValue('osuStablePath', newPath);
            await window.paws.post('/api/paths/stable', { path: newPath });
        }
    });

    document.getElementById('lazer-browse-btn').addEventListener('click', async () => {
        const result = await window.paws.showOpenDialog({ properties: ['openDirectory'], title: 'Select osu!(lazer) installation folder' });
        if (!result.canceled && result.filePaths.length > 0) {
            const newPath = result.filePaths[0];
            lazerPathInput.value = newPath;
            await window.paws.setStoreValue('osuLazerPath', newPath);
            await window.paws.post('/api/paths/lazer', { path: newPath });
        }
    });

    // --- General Settings: Appearance and Interface Controls ---
    const resizeLocationSwitch = document.getElementById('resize-location-switch');
    const resizeSizeSwitch = document.getElementById('resize-size-switch');
    const settingsResizeControls = document.getElementById('settings-resize-controls');
    
    const modeLocationSwitch = document.getElementById('mode-location-switch');
    const modeSelectSwitch = document.getElementById('mode-select-switch');
    const settingsModeControls = document.getElementById('settings-mode-controls');

    // Helper to update the visual state of a toggle switch
    function updateSwitch(switchEl, value) {
        if (!switchEl) return;
        switchEl.querySelectorAll('.switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === value || btn.dataset.mode === value);
        });
    }

    // Event listener for the resize control location switch
    resizeLocationSwitch.addEventListener('click', async (e) => {
        if (!e.target.matches('.switch-btn')) return;
        const inSettings = e.target.dataset.value === 'settings';
        updateSwitch(resizeLocationSwitch, e.target.dataset.value);
        settingsResizeControls.style.display = inSettings ? 'flex' : 'none';
        
        await window.paws.setStoreValue('resizeModeInSettings', inSettings);
        window.paws.notifyParent('resize-control-location-changed', { inSettings });
    });

    // Event listener for the window size switch (inside settings)
    resizeSizeSwitch.addEventListener('click', async (e) => {
        if (!e.target.matches('.switch-btn')) return;
        const isCompact = e.target.dataset.value === 'compact';
        updateSwitch(resizeSizeSwitch, e.target.dataset.value);

        await window.paws.setStoreValue('isCompact', isCompact);
        await window.paws.resizeWindow(isCompact);
    });

    // Event listener for the client mode switch location
    modeLocationSwitch.addEventListener('click', async (e) => {
        if (!e.target.matches('.switch-btn')) return;
        const inSettings = e.target.dataset.value === 'settings';
        updateSwitch(modeLocationSwitch, e.target.dataset.value);
        settingsModeControls.style.display = inSettings ? 'flex' : 'none';
        
        await window.paws.setStoreValue('modeSwitchInSettings', inSettings);
        window.paws.notifyParent('mode-control-location-changed', { inSettings });
    });

    // Event listener for the client mode selector (inside settings)
    modeSelectSwitch.addEventListener('click', async (e) => {
        if (!e.target.matches('.switch-btn')) return;
        const newMode = e.target.dataset.mode;
        updateSwitch(modeSelectSwitch, newMode);

        await window.paws.setStoreValue('clientMode', newMode);
        window.paws.notifyParent('client-mode-changed', { mode: newMode });
    });

    // --- Plugins Tab Logic ---
    function renderInstalledPlugin(plugin) {
        const isApproved = currentlyApprovedGuids.includes(plugin.id.toLowerCase());
        const div = document.createElement('div');
        div.className = 'plugin-item';
        div.innerHTML = `
            <div class="plugin-info">
                <strong>${plugin.name} v${plugin.version}</strong>
                <span>by ${plugin.author || 'Unknown'}</span>
                <p>${plugin.description || 'No description provided.'}</p>
            </div>
            <div class="plugin-actions">
                <label class="paws-checkbox">
                    <input type="checkbox" data-guid="${plugin.id.toLowerCase()}" ${isApproved ? 'checked' : ''}>
                    <span>Approved</span>
                </label>
            </div>
        `;
        div.querySelector('input[type="checkbox"]').addEventListener('change', () => {
            needsRestart = true;
            restartBtn.style.display = 'block';
        });
        return div;
    }
    
    function renderStorePlugin(plugin) {
        const div = document.createElement('div');
        div.className = 'plugin-item';
        div.innerHTML = `
             <div class="plugin-info">
                <strong>${plugin.name} v${plugin.version}</strong>
                <span>by ${plugin.author || 'Unknown'}</span>
                <p>${plugin.description || 'No description provided.'}</p>
            </div>
            <div class="plugin-actions">
                <button class="paws-button secondary" data-id="${plugin.id}">Install</button>
            </div>
        `;
        // TODO: Add install logic to button
        return div;
    }

    restartBtn.addEventListener('click', async () => {
        const newGuids = [];
        installedList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            newGuids.push(cb.dataset.guid);
        });
        await window.paws.setStoreValue('approvedPlugins', newGuids);
        await window.paws.restartApp();
    });

    async function populatePluginLists() {
        try {
            const discovered = await window.paws.get('/api/plugins/discovered');
            currentlyApprovedGuids = (await window.paws.getStoreValue('approvedPlugins')) || [];
            
            if (discovered.length > 0) {
                installedList.innerHTML = '';
                discovered.forEach(p => installedList.appendChild(renderInstalledPlugin(p)));
            } else {
                 installedList.innerHTML = '<div class="list-placeholder">No plugins installed.</div>';
            }
        } catch (error) {
            installedList.innerHTML = `<div class="list-placeholder error">Failed to load plugins: ${error.message}</div>`;
        }

        try {
            const storePlugins = await window.paws.get('/api/plugins/store');
            const discovered = await window.paws.get('/api/plugins/discovered');
            const installedIds = new Set(discovered.map(p => p.id));
            const availablePlugins = storePlugins.filter(p => !installedIds.has(p.id));

            if (availablePlugins.length > 0) {
               storeList.innerHTML = '';
               availablePlugins.forEach(p => storeList.appendChild(renderStorePlugin(p)));
           } else if (storePlugins.length > 0) {
               storeList.innerHTML = `<div class="list-placeholder">All available plugins are installed.</div>`;
           } else {
                storeList.innerHTML = `<div class="list-placeholder">Could not fetch plugins from store.</div>`;
           }
        } catch (error) {
            storeList.innerHTML = `<div class="list-placeholder error">Failed to load store: ${error.message}</div>`;
        }
    }

    // --- Initialization ---
    async function initialize() {
        // Load stored values for paths
        stablePathInput.value = await window.paws.getStoreValue('osuStablePath') || '';
        lazerPathInput.value = await window.paws.getStoreValue('osuLazerPath') || '';

        // Load stored values for UI controls and set initial state
        const initialResizeInSettings = await window.paws.getStoreValue('resizeModeInSettings') ?? false;
        const initialIsCompact = await window.paws.getStoreValue('isCompact') ?? false;
        const initialModeInSettings = await window.paws.getStoreValue('modeSwitchInSettings') ?? false;
        const initialMode = await window.paws.getStoreValue('clientMode') ?? 'stable';

        updateSwitch(resizeLocationSwitch, initialResizeInSettings ? 'settings' : 'edge');
        settingsResizeControls.style.display = initialResizeInSettings ? 'flex' : 'none';
        updateSwitch(resizeSizeSwitch, initialIsCompact ? 'compact' : 'wide');
        
        updateSwitch(modeLocationSwitch, initialModeInSettings ? 'settings' : 'titlebar');
        settingsModeControls.style.display = initialModeInSettings ? 'flex' : 'none';
        updateSwitch(modeSelectSwitch, initialMode);

        await populatePluginLists();
    }
    
    // Listen for notices from the parent renderer (e.g., to show pending plugins alert)
    window.paws.onNotice((notice) => {
        if (notice && notice.type === 'show-pending-plugins') {
            tabButtons.plugins.click();
            document.getElementById('pending-notice').style.display = 'block';
        }
    });

    initialize();
});