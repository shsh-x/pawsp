document.addEventListener('DOMContentLoaded', async () => {
    const minimizeBtn = document.getElementById('minimize-btn');
    const closeBtn = document.getElementById('close-btn');
    const navBar = document.getElementById('nav-bar');
    const settingsBtn = document.getElementById('settings-btn');
    const pluginWebview = document.getElementById('plugin-webview');
    const welcomeMessage = document.getElementById('welcome-message');

    pluginWebview.style.display = 'none';
    let apiBaseUrl = '';

    minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

    // This is correct: get the absolute path for the webview's preload script
    const preloadPath = await window.electronAPI.resolvePath('preload.js');
    pluginWebview.setAttribute('preload', `file://${preloadPath}`);

    // --- THE MAIN FIX: IPC PROXY FOR WEBVIEW ---
    // Listen for messages coming FROM the webview guest page TO this host page.
    pluginWebview.addEventListener('ipc-message', async (event) => {
        const { channel, payload, id } = event.args[0];

        if (!id || !channel) return;

        try {
            let result;
            // Based on the channel, call the REAL electronAPI function from the host page.
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

            // Send the successful result BACK to the webview, using the same message id.
            if (!pluginWebview.isDestroyed()) {
                pluginWebview.send('host-response', { id, result });
            }
        } catch (error) {
            // If an error occurred, send the error back to the webview.
            if (!pluginWebview.isDestroyed()) {
                pluginWebview.send('host-response', { id, error: error.message });
            }
        }
    });
    // --- END OF FIX ---

    pluginWebview.addEventListener('dom-ready', () => {
        // Uncomment to debug the plugin's UI specifically
        // pluginWebview.openDevTools();
    });
    pluginWebview.addEventListener('console-message', (e) => {
        console.log(`[Plugin Webview] ${e.message}`);
    });

    function showPluginApprovalModal(pendingPlugins, currentlyApproved) {
        // This function from the previous steps is correct.
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

    async function loadPluginsIntoNavbar() {
        // This function from the previous steps is correct.
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
                        pluginWebview.style.display = 'block';
                        pluginWebview.src = `paws-plugin://${plugin.id.toLowerCase()}/${plugin.ui.entry}`;
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
        // This function from the previous steps is correct.
        apiBaseUrl = await window.electronAPI.getApiBaseUrl();
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
        console.log("Renderer has signaled readiness.");
    }

    initializeApp();
});