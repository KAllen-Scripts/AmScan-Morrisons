let currentTimer = null;

// Start timer with given minutes
function startTimer(minutes) {
    // Stop existing timer
    if (currentTimer) {
        clearInterval(currentTimer);
    }
    
    // Convert to milliseconds
    const ms = minutes * 60 * 1000;
    
    // Call immediately first
    handleData();
    
    // Start new timer
    currentTimer = setInterval(handleData, ms);
}

// Stop timer
function stopTimer() {
    if (currentTimer) {
        clearInterval(currentTimer);
        currentTimer = null;
    }
}

// Listen for timer changes
document.addEventListener('DOMContentLoaded', () => {
    const timerSelect = document.getElementById('timerCycle');
    if (timerSelect) {
        timerSelect.addEventListener('change', (e) => {
            const minutes = parseFloat(e.target.value);
            if (minutes) {
                startTimer(minutes);
            } else {
                stopTimer();
            }
        });
    }
    
    // Load saved timer on startup
    loadSavedTimer();
});

async function loadSavedTimer() {
    try {
        let config = {};
        if (window.electronAPI) {
            config = await window.electronAPI.loadConfig();
        } else {
            const stored = localStorage.getItem('syncToolConfig');
            if (stored) config = JSON.parse(stored);
        }
        
        if (config.timerCycle) {
            startTimer(parseFloat(config.timerCycle));
        }
    } catch (error) {
        console.error('Error loading timer:', error);
    }
}