document.addEventListener('DOMContentLoaded', () => {
    const pluginsBtn = document.getElementById('go-to-plugins-btn');
    
    pluginsBtn.addEventListener('click', () => {
        // Use the API to send a custom notice to the parent renderer process.
        window.paws.notifyParent('open-settings-to-plugins');
    });
});