// This helper function creates a secure bridge for the webview to communicate
// with the main process via the host renderer. It does not use `require`.
const ipcProxy = (() => {
    const promises = new Map();
    let messageId = 0;

    // Use the API exposed by the preload script to listen for responses from the host.
    window.electronAPI.onHostResponse(({ id, result, error }) => {
        if (promises.has(id)) {
            const { resolve, reject } = promises.get(id);
            if (error) {
                reject(new Error(error));
            } else {
                resolve(result);
            }
            promises.delete(id);
        }
    });

    return {
        invoke: (channel, payload) => {
            return new Promise((resolve, reject) => {
                const id = messageId++;
                promises.set(id, { resolve, reject });
                // Use the postToHost function exposed by the preload script.
                window.electronAPI.postToHost({ id, channel, payload });
            });
        }
    };
})();


// This is the main Immediately Invoked Function Expression (IIFE)
// that contains all the logic for the cleaner plugin's UI.
(() => {
    const setupView = document.getElementById('setup-view');
    const cleanerContainer = document.getElementById('cleaner-container');
    const selectOsuFolderBtn = document.getElementById('select-osu-folder-btn');
    const confirmOsuFolderBtn = document.getElementById('confirm-osu-folder-btn');
    const changeOsuFolderBtn = document.getElementById('change-osu-folder-btn');
    const setupInfoText = document.getElementById('setup-info-text');
    
    const cleanBtn = document.getElementById('clean-btn');
    const logOutput = document.getElementById('log-output');
    const progressBar = document.getElementById('progress-bar');
    const maxThreadsInput = document.getElementById('max-threads-input');

    // The cleanerApi now correctly uses the proxy.
    const cleanerApi = {
        pluginId: 'd92d43f9-30f3-4a97-8a3a-e0a752a3665a',
        execute: (command, payload) => ipcProxy.invoke('execute-plugin-command', { pluginId: cleanerApi.pluginId, command, payload }),
        showOpenDialog: (options) => ipcProxy.invoke('show-open-dialog', options),
        getStoreValue: (key) => ipcProxy.invoke('get-store-value', key),
        setStoreValue: (key, value) => ipcProxy.invoke('set-store-value', { key, value }),
    };

    const state = {
        osuPath: null,
        isCleaning: false,
    };

    function addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const aMessage = `[${timestamp}] ${message}\n`;
        logOutput.textContent += aMessage;
        logOutput.scrollTop = logOutput.scrollHeight;
    }

    function toggleUiLock(locked) {
        state.isCleaning = locked;
        const inputs = document.querySelectorAll('#cleaner-container input, #cleaner-container button');
        inputs.forEach(input => {
            if (input.id === 'manage-exceptions-btn' || (input.parentElement && input.parentElement.classList.contains('disabled'))) {
                input.disabled = true;
                return;
            }
            input.disabled = locked;
        });
    }

    function showMainCleanerUi() {
        setupView.classList.add('hidden');
        cleanerContainer.classList.remove('hidden');
        logOutput.textContent = '';
        addLog('Welcome to the Cleaner module!');
        addLog(`Using osu! installation folder: ${state.osuPath}`);
        addLog('Select your options and press "clean!"');
    }
    
    function setupRulesetValidation() {
        const rulesetCheckboxes = document.querySelectorAll('input[data-param="deleteModes"]');
        rulesetCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const checkedCount = Array.from(rulesetCheckboxes).filter(cb => cb.checked).length;
                if (checkedCount === rulesetCheckboxes.length) {
                    addLog("Cannot select all rulesets for deletion. At least one must be kept.", 'warn');
                    checkbox.checked = false;
                }
            });
        });
    }

    async function selectAndSetOsuPath(promptTitle) {
        const result = await cleanerApi.showOpenDialog({ 
            title: promptTitle,
            properties: ['openDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        
        const selectedPath = result.filePaths[0];
        
        const isValid = await cleanerApi.execute('check-path-validity', selectedPath);
        if (!isValid) {
            alert(`"osu!.exe" not found in the selected folder. Please select the correct root osu! installation directory.`);
            return null;
        }

        await cleanerApi.setStoreValue('cleaner.osuPath', selectedPath);
        state.osuPath = selectedPath;
        addLog(`osu! installation folder set to: ${state.osuPath}`);
        return selectedPath;
    }

    async function gatherParams() {
        const params = {
            osuPath: state.osuPath,
            maxThreads: parseInt(maxThreadsInput.value, 10) || 4,
            deleteModes: [],
            deleteStoryboards: document.querySelector('input[data-param="deleteStoryboards"]').checked,
            deleteVideos: document.querySelector('input[data-param="deleteVideos"]').checked,
            deleteSkinHitsounds: document.querySelector('input[data-param="deleteSkinHitsounds"]').checked,
            deleteSkinGraphics: document.querySelector('input[data-param="deleteSkinGraphics"]').checked,
            backgroundReplacement: null,
        };

        const modeCheckboxes = document.querySelectorAll('input[data-param="deleteModes"]:checked');
        modeCheckboxes.forEach(cb => params.deleteModes.push(cb.value));

        const bgOption = document.querySelector('input[name="background"]:checked').value;
        if (bgOption !== 'keep') {
             params.backgroundReplacement = {};
             if (bgOption === 'white' || bgOption === 'black') {
                params.backgroundReplacement['.png'] = `${bgOption}.png`;
                params.backgroundReplacement['.jpg'] = `${bgOption}.jpg`;
                params.backgroundReplacement['.jpeg'] = `${bgOption}.jpg`;
            } else if (bgOption === 'custom') {
                addLog('Please select your custom background images (PNG, then JPG/JPEG).');
                const pngResult = await cleanerApi.showOpenDialog({ title: 'Select Custom PNG', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png'] }] });
                if (!pngResult.canceled) params.backgroundReplacement['.png'] = pngResult.filePaths[0];
                
                const jpgResult = await cleanerApi.showOpenDialog({ title: 'Select Custom JPG/JPEG', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg'] }] });
                if (!jpgResult.canceled) {
                    params.backgroundReplacement['.jpg'] = jpgResult.filePaths[0];
                    params.backgroundReplacement['.jpeg'] = jpgResult.filePaths[0];
                }
                
                if (Object.keys(params.backgroundReplacement).length === 0) {
                     addLog('No custom images selected. Backgrounds will be kept.', 'warn');
                     params.backgroundReplacement = null; // Revert if no selection
                }
            }
        }
        return params;
    }

    async function startCleaning() {
        if (state.isCleaning) return;
        if (!state.osuPath) {
            addLog("Error: No osu! path is set. Please restart the plugin.", 'error');
            return;
        }
        
        logOutput.textContent = '';
        addLog('Preparing to clean...');
        toggleUiLock(true);
        progressBar.style.width = '0%';
        progressBar.style.backgroundColor = ''; // Reset color on new run

        try {
            const params = await gatherParams();
            if (!params) {
                toggleUiLock(false);
                return;
            }
            
            addLog('Starting clean operation... This may take a while.');
            progressBar.style.width = '2%';

            const result = await cleanerApi.execute('start-clean', params);

            progressBar.style.width = '100%';
            addLog('--- SUMMARY ---');
            addLog(result.message);

        } catch (error) {
            progressBar.style.width = '100%';
            progressBar.style.backgroundColor = '#d32f2f'; // Error color
            addLog('--- FATAL ERROR ---');
            addLog(error.message);
            console.error(error);
        } finally {
            setTimeout(() => {
                toggleUiLock(false);
            }, 1000);
        }
    }

    async function initialize() {
        try {
            let savedPath = await cleanerApi.getStoreValue('cleaner.osuPath');

            if (!savedPath) {
                savedPath = await cleanerApi.execute('get-default-osu-root');
            }

            if (savedPath) {
                state.osuPath = savedPath;
                setupInfoText.textContent = `Is this your correct osu! folder?\n${state.osuPath}`;
                selectOsuFolderBtn.classList.add('hidden');
                confirmOsuFolderBtn.classList.remove('hidden');
                changeOsuFolderBtn.classList.remove('hidden');
            } else {
                setupInfoText.textContent = 'osu! installation folder not found.';
                selectO-su-folder-btn.classList.remove('hidden');
                confirmOsuFolderBtn.classList.add('hidden');
                changeOsuFolderBtn.classList.add('hidden');
            }
        } catch (error) {
            console.error("Initialization failed:", error);
            setupInfoText.textContent = `An error occurred: ${error.message}. Please restart the plugin.`;
        }

        selectOsuFolderBtn.addEventListener('click', async () => {
            if (await selectAndSetOsuPath('Select your osu! installation folder')) {
                showMainCleanerUi();
            }
        });

        confirmOsuFolderBtn.addEventListener('click', async () => {
            await cleanerApi.setStoreValue('cleaner.osuPath', state.osuPath);
            showMainCleanerUi();
        });

        changeOsuFolderBtn.addEventListener('click', async () => {
            if (await selectAndSetOsuPath('Select a different osu! installation folder')) {
                showMainCleanerUi();
            }
        });
        
        setupRulesetValidation();
        cleanBtn.addEventListener('click', startCleaning);
    }
    
    initialize();
})();