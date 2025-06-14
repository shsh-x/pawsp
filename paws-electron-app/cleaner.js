(() => {
    const setupView = document.getElementById('setup-view');
    const cleanerContainer = document.getElementById('cleaner-container');
    const selectOsuFolderBtn = document.getElementById('select-osu-folder-btn');
    const confirmOsuFolderBtn = document.getElementById('confirm-osu-folder-btn');
    const changeOsuFolderBtn = document.getElementById('change-osu-folder-btn');
    const setupInfoText = document.getElementById('setup-info-text');
    
    const changeFolderBtn = document.getElementById('change-folder-btn');
    const cleanBtn = document.getElementById('clean-btn');
    const logOutput = document.getElementById('log-output');
    const progressBar = document.getElementById('progress-bar');
    const logTitle = document.getElementById('log-title');
    const maxThreadsInput = document.getElementById('max-threads-input');

    const cleanerApi = {
        pluginId: 'D92D43F9-30F3-4A97-8A3A-E0A752A3665A',
        execute: (command, payload) => window.electronAPI.executePluginCommand(cleanerApi.pluginId, command, payload),
        showOpenDialog: (options) => window.electronAPI.showOpenDialog(options),
        getStoreValue: (key) => window.electronAPI.getStoreValue(key),
        setStoreValue: (key, value) => window.electronAPI.setStoreValue(key, value),
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
        
        if (type === 'title') {
            logTitle.textContent = message;
        }
    }

    function toggleUiLock(locked) {
        state.isCleaning = locked;
        const inputs = document.querySelectorAll('#cleaner-container input, #cleaner-container button');
        inputs.forEach(input => {
            const permanentlyDisabled = ['toggle-lazer', 'manage-exceptions-btn'];
            if (permanentlyDisabled.includes(input.id) || (input.parentElement && input.parentElement.classList.contains('disabled'))) {
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
            deleteStoryboards: false,
            deleteVideos: false,
            deleteSkinHitsounds: false,
            deleteSkinGraphics: false,
            backgroundReplacement: null,
        };

        const checkboxes = document.querySelectorAll('input[type="checkbox"][data-param]');
        checkboxes.forEach(cb => {
            if (cb.checked) {
                if(cb.dataset.param === "deleteModes") {
                    params.deleteModes.push(cb.value);
                } else {
                    params[cb.dataset.param] = true;
                }
            }
        });

        const bgOption = document.querySelector('input[name="background"]:checked').value;
        if (bgOption === 'white' || bgOption === 'black') {
            params.backgroundReplacement = {
                '.png': `${bgOption}.png`,
                '.jpg': `${bgOption}.jpg`,
                '.jpeg': `${bgOption}.jpg`,
            };
        } else if (bgOption === 'custom') {
            addLog('Please select your custom background images (PNG, then JPG/JPEG).');
            const customImages = {};
            const pngResult = await cleanerApi.showOpenDialog({ title: 'Select Custom PNG', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png'] }] });
            if (!pngResult.canceled) customImages['.png'] = pngResult.filePaths[0];
            
            const jpgResult = await cleanerApi.showOpenDialog({ title: 'Select Custom JPG/JPEG', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg'] }] });
            if (!jpgResult.canceled) {
                customImages['.jpg'] = jpgResult.filePaths[0];
                customImages['.jpeg'] = jpgResult.filePaths[0];
            }
            
            if (Object.keys(customImages).length > 0) {
                params.backgroundReplacement = customImages;
            } else {
                 addLog('No custom images selected. Backgrounds will be kept.', 'warn');
            }
        }
        
        if(params.deleteSkinGraphics) {
            params.backgroundReplacement = null;
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
        addLog('Preparing to clean...', 'title');
        toggleUiLock(true);
        progressBar.style.width = '0%';

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
            addLog('Done!', 'title');
            addLog('--- SUMMARY ---');
            addLog(result.message);

        } catch (error) {
            progressBar.style.width = '100%';
            progressBar.style.backgroundColor = '#d32f2f';
            addLog('--- FATAL ERROR ---', 'title');
            addLog(error.message);
            console.error(error);
        } finally {
            setTimeout(() => {
                toggleUiLock(false);
                progressBar.style.backgroundColor = '';
            }, 1000);
        }
    }

    async function initialize() {
        let savedPath = await cleanerApi.getStoreValue('cleaner.osuPath');

        if (!savedPath) {
            savedPath = await cleanerApi.execute('get-default-osu-root');
        }

        if (savedPath) {
            state.osuPath = savedPath;
            cleanerContainer.classList.add('hidden');
            setupView.classList.remove('hidden');
            
            setupInfoText.textContent = `Is this your correct osu! folder?\n${state.osuPath}`;
            selectOsuFolderBtn.classList.add('hidden');
            confirmOsuFolderBtn.classList.remove('hidden');
            changeOsuFolderBtn.classList.remove('hidden');
        } else {
            cleanerContainer.classList.add('hidden');
            setupView.classList.remove('hidden');
            
            setupInfoText.textContent = 'osu! installation folder not found.';
            selectOsuFolderBtn.classList.remove('hidden');
            confirmOsuFolderBtn.classList.add('hidden');
            changeOsuFolderBtn.classList.add('hidden');
        }

        selectOsuFolderBtn.addEventListener('click', async () => {
            const path = await selectAndSetOsuPath('Select your osu! installation folder');
            if (path) {
                showMainCleanerUi();
            }
        });

        confirmOsuFolderBtn.addEventListener('click', async () => {
            await cleanerApi.setStoreValue('cleaner.osuPath', state.osuPath);
            showMainCleanerUi();
        });

        changeOsuFolderBtn.addEventListener('click', async () => {
            const path = await selectAndSetOsuPath('Select a different osu! installation folder');
            if (path) {
                showMainCleanerUi();
            }
        });
        
        changeFolderBtn.addEventListener('click', async () => {
            if (state.isCleaning) return;
            const path = await selectAndSetOsuPath('Change your osu! installation folder');
            if(path) {
                addLog(`osu! folder changed to: ${path}`);
            }
        });
        
        setupRulesetValidation();
        cleanBtn.addEventListener('click', startCleaning);
        
        window.electronAPI.onCleanerProgressUpdate((progress) => {
            if (state.isCleaning) {
                progressBar.style.width = `${progress}%`;
            }
        });
    }
    
    initialize();
})();