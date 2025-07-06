// Paws Frontend API Bridge v2.0
// Simplifies communication between a plugin/settings frame and the main process via the renderer.

(function() {
    let messageId = 0;
    const pendingPromises = new Map();
    const noticeHandlers = new Set();

    // Listen for responses from the main renderer process
    window.addEventListener('message', (event) => {
        // Basic security: In a real sandboxed environment, we'd check the origin.
        // For file:// and custom protocols, this is tricky, so we trust the parent.
        if (event.source !== window.parent) return;

        const { id, result, error, channel } = event.data;

        // Handle one-way notices from the main renderer
        if (channel && channel === 'notice') {
            noticeHandlers.forEach(handler => handler(event.data.payload));
            return;
        }
        
        // Handle promise-based request/response
        if (pendingPromises.has(id)) {
            const { resolve, reject } = pendingPromises.get(id);
            if (error) {
                reject(new Error(error));
            } else {
                resolve(result);
            }
            pendingPromises.delete(id);
        }
    });

    /**
     * Sends a request to the main process and returns a promise that resolves with the result.
     * @param {string} channel - The IPC channel to call.
     * @param {*} [payload] - The data to send with the request.
     * @returns {Promise<any>} A promise that resolves with the result from the main process.
     */
    function request(channel, payload) {
        return new Promise((resolve, reject) => {
            const currentId = messageId++;
            pendingPromises.set(currentId, { resolve, reject });

            window.parent.postMessage({ channel, id: currentId, payload }, '*');
        });
    }

    // Expose the simplified API on the window object
    window.paws = {
        get: (endpoint) => request('get', endpoint),
        post: (endpoint, body) => request('post', { endpoint, body }),
        getStoreValue: (key) => request('get-store-value', key),
        setStoreValue: (key, value) => request('set-store-value', { key, value }),
        showOpenDialog: (options) => request('show-open-dialog', options),
        restartApp: () => request('restart-app'),
        resizeWindow: (isCompact) => request('resize-window', { isCompact }),

        // Method for the plugin UI to listen for notices from the main app
        onNotice: (callback) => {
            noticeHandlers.add(callback);
            // Return a function to unsubscribe
            return () => noticeHandlers.delete(callback);
        },

        // For sending a one-way notification to the parent renderer
        notifyParent: (noticeType, payload) => {
            window.parent.postMessage({ channel: 'notice-from-frame', noticeType, payload }, '*');
        }
    };
})();