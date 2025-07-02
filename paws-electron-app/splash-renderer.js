document.addEventListener('DOMContentLoaded', () => {
    const statusMessageEl = document.getElementById('status-message');
    const tipTextEl = document.getElementById('tip-text');
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBarEl = document.getElementById('progress-bar');

    const tips = [      // Need to move that later to external file with 
        "Paws: Your osu! companion for a cleaner experience.",
        "Modules can be added to Paws to extend its functionality.",
        "The Cleaner module helps manage beatmap backgrounds and extra files.",
        "Found a bug? Report it on the Paws GitHub repository!",
        "Paws is open source - contribute and make it better!",
        "Regularly cleaning your osu! songs folder can save gigabytes of space."
    ];
    let currentTipIndex = Math.floor(Math.random() * tips.length);

    function displayNextTip() {
        tipTextEl.textContent = tips[currentTipIndex];
        currentTipIndex = (currentTipIndex + 1) % tips.length;
    }

    displayNextTip(); // Show initial tip
    setInterval(displayNextTip, 6000); // Change tip every 6 seconds

    if (window.splashAPI) {
        window.splashAPI.onStatusUpdate((message) => {
            statusMessageEl.textContent = message;
        });

        window.splashAPI.onProgressUpdate((progress) => {
            if (progress && typeof progress.percent === 'number') {
                progressBarContainer.style.display = 'block';
                progressBarEl.style.width = `${progress.percent}%`;
                if (progress.message) { // Optionally update status message from progress too
                    statusMessageEl.textContent = progress.message;
                }
            } else {
                progressBarContainer.style.display = 'none'; // Hide if progress is null/invalid
            }
        });
    } else {
        console.error('Splash API (splashAPI) not exposed. Check preload-splash.js and contextIsolation.');
        statusMessageEl.textContent = 'Error: UI cannot receive updates.';
    }
});