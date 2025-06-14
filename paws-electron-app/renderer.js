document.addEventListener('DOMContentLoaded', async () => { // Make async for initial load
    const minimizeBtn = document.getElementById('minimize-btn');
    const closeBtn = document.getElementById('close-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const mainContent = document.getElementById('main-content');
    const csharpLogOutput = document.getElementById('csharp-log-output');
    const navBar = document.getElementById('nav-bar');

    let apiBaseUrl = ''; // Store API base URL

    minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });

    closeBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });

    function displayContent(htmlContent) {
        mainContent.innerHTML = htmlContent;
    }

    function appendLog(message, type = 'log') {
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        if (type === 'error') {
            entry.style.color = '#ff8080';
        }
        csharpLogOutput.appendChild(entry);
        csharpLogOutput.scrollTop = csharpLogOutput.scrollHeight;
    }

    window.electronAPI.onCSharpLog((logMessage) => {
        appendLog(`LOG: ${logMessage}`);
    });
    window.electronAPI.onCSharpError((errorMessage) => {
        appendLog(`ERR: ${errorMessage}`, 'error');
    });
    
    // --- THIS IS THE MODIFIED FUNCTION ---
    async function loadPluginsIntoNavbar() {
        try {
            const response = await fetch(`${apiBaseUrl}/api/plugins`);
            if (!response.ok) {
                appendLog(`Failed to fetch plugins: ${response.status}`, 'error');
                return;
            }
            const plugins = await response.json();
            appendLog(`Fetched ${plugins.length} plugins.`, 'info');

            const existingNavItems = navBar.querySelectorAll('.nav-item:not(#settings-btn)');
            existingNavItems.forEach(item => item.remove());

            plugins.forEach(plugin => {
                const pluginBtn = document.createElement('button');
                pluginBtn.classList.add('nav-item');
                pluginBtn.textContent = plugin.name.substring(0, 8);
                pluginBtn.title = `${plugin.name} v${plugin.version}\n${plugin.description}`;
                pluginBtn.setAttribute('data-plugin-id', plugin.id);
                pluginBtn.setAttribute('data-plugin-name', plugin.name);

                pluginBtn.addEventListener('click', async () => {
                    // --- START OF THE FIX ---
                    
                    // 1. Remove any previously loaded plugin script to prevent conflicts
                    const oldScript = document.getElementById('plugin-script');
                    if (oldScript) {
                        oldScript.remove();
                    }
                    
                    // 2. Check which plugin is being loaded
                    if (plugin.id.toLowerCase() === 'd92d43f9-30f3-4a97-8a3a-e0a752a3665a') { // Cleaner Plugin
                        try {
                            const htmlContent = await window.electronAPI.loadHtml('cleaner.html');
                            if (htmlContent) {
                                displayContent(htmlContent);
                                
                                // 3. Manually create and attach the script tag
                                const script = document.createElement('script');
                                script.id = 'plugin-script';
                                script.src = 'cleaner.js';
                                document.body.appendChild(script);

                            } else {
                                 displayContent(`<h1>Error</h1><p>Could not load UI for ${plugin.name}.</p>`);
                            }
                        } catch(error) {
                             displayContent(`<h1>Error</h1><p>Failed to load UI for ${plugin.name}: ${error.message}</p>`);
                        }
                    } else {
                        // Fallback for other plugins
                        displayContent(`
                            <h1>${plugin.name}</h1>
                            <p>${plugin.description}</p>
                            <p>Version: ${plugin.version}</p>
                            <p>ID: ${plugin.id}</p>
                        `);
                    }
                    // --- END OF THE FIX ---
                });
                navBar.insertBefore(pluginBtn, settingsBtn);
            });

        } catch (error) {
            appendLog(`Error loading plugins into navbar: ${error.message}`, 'error');
        }
    }

    async function initializeApp() {
        try {
            apiBaseUrl = await window.electronAPI.getApiBaseUrl();
            appendLog(`API Base URL: ${apiBaseUrl}`);
            const healthResponse = await fetch(`${apiBaseUrl}/api/health`);
            if (healthResponse.ok) {
                const healthData = await healthResponse.json();
                appendLog(`Backend health: ${healthData.status}`);
                displayContent(`<h1>Paws Connected</h1> <p>Backend is running at ${apiBaseUrl}. Status: ${healthData.status}</p>`);
                await loadPluginsIntoNavbar();
            } else {
                appendLog(`Backend health check failed: ${healthResponse.status}`, 'error');
                displayContent(`<h1>Paws Backend Error</h1> <p>Could not connect to backend at ${apiBaseUrl}. Status: ${healthResponse.status}</p>`);
            }
        } catch (error) {
            appendLog(`Error connecting to backend: ${error.message}`, 'error');
            displayContent(`<h1>Paws Backend Error</h1> <p>Could not connect to backend. Error: ${error.message}</p>`);
        }
        
        // Signal that the renderer is fully initialized
        if (window.electronAPI && typeof window.electronAPI.signalRendererReady === 'function') {
            window.electronAPI.signalRendererReady();
            console.log("Renderer has signaled readiness to main process.");
        } else {
            console.error("Could not signal renderer readiness: electronAPI.signalRendererReady is not defined.");
        }
    }

    initializeApp(); // Initialize the app
});