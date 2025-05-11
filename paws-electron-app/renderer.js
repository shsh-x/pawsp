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

    settingsBtn.addEventListener('click', () => {
        displayContent('<h1>Settings</h1><p>Application settings will go here.</p>');
    });

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

    async function loadPluginsIntoNavbar() {
        try {
            const response = await fetch(`${apiBaseUrl}/api/plugins`);
            if (!response.ok) {
                appendLog(`Failed to fetch plugins: ${response.status}`, 'error');
                return;
            }
            const plugins = await response.json();
            appendLog(`Fetched ${plugins.length} plugins.`, 'info');

            // Clear existing plugin placeholders (except settings)
            const existingNavItems = navBar.querySelectorAll('.nav-item:not(#settings-btn)');
            existingNavItems.forEach(item => item.remove());

            plugins.forEach(plugin => {
                const pluginBtn = document.createElement('button');
                pluginBtn.classList.add('nav-item');
                pluginBtn.textContent = plugin.name.substring(0, 8); // Short name or icon
                pluginBtn.title = `${plugin.name} v${plugin.version}\n${plugin.description}`; // Tooltip
                // You could use plugin.iconName with an icon library here
                // e.g., pluginBtn.innerHTML = `<i class="material-icons">${plugin.iconName}</i>`;

                pluginBtn.setAttribute('data-plugin-id', plugin.id);
                pluginBtn.setAttribute('data-plugin-name', plugin.name);

                pluginBtn.addEventListener('click', () => {
                    displayContent(`
                        <h1>${plugin.name}</h1>
                        <p>${plugin.description}</p>
                        <p>Version: ${plugin.version}</p>
                        <p>ID: ${plugin.id}</p>
                        <div id="plugin-output"></div>
                        <button id="test-greet-btn">Test Greet</button>
                    `);
                    // Example: test command execution
                    const testGreetBtn = document.getElementById('test-greet-btn');
                    if (testGreetBtn) {
                        testGreetBtn.onclick = async () => {
                            const pluginOutputDiv = document.getElementById('plugin-output');
                            pluginOutputDiv.textContent = 'Executing command...';
                            try {
                                const cmdResponse = await fetch(`${apiBaseUrl}/api/plugins/${plugin.id}/execute`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ commandName: 'greet', payload: 'Electron User' })
                                });
                                if(cmdResponse.ok) {
                                    const result = await cmdResponse.json();
                                    pluginOutputDiv.textContent = `Command Result: ${JSON.stringify(result)}`;
                                } else {
                                    const errorResult = await cmdResponse.text();
                                    pluginOutputDiv.textContent = `Command Error: ${cmdResponse.status} - ${errorResult}`;
                                }
                            } catch (err) {
                                pluginOutputDiv.textContent = `Command Exception: ${err.message}`;
                            }
                        };
                    }
                });
                // Insert before settings button
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
                await loadPluginsIntoNavbar(); // Load plugins after health check is successful
            } else {
                appendLog(`Backend health check failed: ${healthResponse.status}`, 'error');
                displayContent(`<h1>Paws Backend Error</h1> <p>Could not connect to backend at ${apiBaseUrl}. Status: ${healthResponse.status}</p>`);
            }
        } catch (error) {
            appendLog(`Error connecting to backend: ${error.message}`, 'error');
            displayContent(`<h1>Paws Backend Error</h1> <p>Could not connect to backend. Error: ${error.message}</p>`);
        }
    }

    await initializeApp(); // Ensure initialization is complete

    // --- Signal readiness AFTER initialization is done ---
    if (window.electronAPI && typeof window.electronAPI.signalRendererReady === 'function') {
        window.electronAPI.signalRendererReady();
        console.log("Renderer has signaled readiness to main process.");
    } else {
        console.error("Could not signal renderer readiness: electronAPI.signalRendererReady is not defined.");
    }
});