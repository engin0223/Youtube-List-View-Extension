// Default configuration
const defaults = {
    listContainerWidth: 90,
    thumbnailWidth: 260,
    titleFontSize: 13, // pt
    metaFontSize: 10,  // pt
    notifyWidth: 150,   // px
    cache_max_size: 200, // Max number of descriptions to cache
    cache_ttl_ms: 60 * 60 * 1000, // 1 hour TTL for cache entries
    highlightLinks: true,
    viewModeHome: 'grid', // New Default
    viewModeSubs: 'list',  // New Default
    changeShortsScroll: false, // New Setting to control Shorts scroll behavior
    hideMostRelevant: false, // New Setting to hide "Most Relevant" section in search results
    hideDividers: false, // New Setting to hide dividers in list view
    hideShorts: false, // New Setting to hide Shorts section on the homepage
    lazyFetchDescriptions: true // New Setting to control lazy fetching of video descriptions
};

// Elements
const inputs = {
    listContainerWidth: document.getElementById('listContainerWidth'),
    listContainerWidthSlider: document.getElementById('listContainerWidthSlider'),
    thumbnailWidth: document.getElementById('thumbnailWidth'),
    thumbnailWidthSlider: document.getElementById('thumbnailWidthSlider'),
    titleFontSize: document.getElementById('titleFontSize'),
    titleFontSizeSlider: document.getElementById('titleFontSizeSlider'),
    metaFontSize: document.getElementById('metaFontSize'),
    metaFontSizeSlider: document.getElementById('metaFontSizeSlider'),
    notifyWidth: document.getElementById('notifyWidth'),
    notifyWidthSlider: document.getElementById('notifyWidthSlider'),
    highlightLinks: document.getElementById('highlightLinks'),
    changeShortsScroll: document.getElementById('changeShortsScroll'),
    hideMostRelevant: document.getElementById('hideMostRelevant'),
    hideDividers: document.getElementById('hideDividers'),
    hideShorts: document.getElementById('hideShorts'),
    lazyFetchDescriptions: document.getElementById('lazyFetchDescriptions'),
    cacheMaxSize: document.getElementById('cacheMaxSize'),
    cacheTTL: document.getElementById('cacheTTL'),
    // New Icons
    iconList: document.getElementById('icon-list'),
    iconGrid: document.getElementById('icon-grid')
};

// Variables to store current view modes
let storedSettings = { ...defaults };
let activePageContext = 'home'; // 'home' or 'subs'

// Helper: Get current values from DOM (and merge with stored view modes)
function getCurrentSettings() {
    return {
        listContainerWidth: inputs.listContainerWidth.value,
        thumbnailWidth: inputs.thumbnailWidth.value,
        titleFontSize: inputs.titleFontSize.value,
        metaFontSize: inputs.metaFontSize.value,
        notifyWidth: inputs.notifyWidth.value,
        highlightLinks: inputs.highlightLinks.checked,
        changeShortsScroll: inputs.changeShortsScroll.checked,
        hideMostRelevant: inputs.hideMostRelevant.checked,
        hideDividers: inputs.hideDividers.checked,
        hideShorts: inputs.hideShorts.checked,
        lazyFetchDescriptions: inputs.lazyFetchDescriptions.checked,
        cache_max_size: inputs.cacheMaxSize.value,
        cache_ttl_ms: inputs.cacheTTL.value,
        
        // Pass back the stored modes (Popup doesn't change these, only displays them)
        viewModeHome: storedSettings.viewModeHome,
        viewModeSubs: storedSettings.viewModeSubs,
    };
}

// Helper: Update UI Icons based on current context
function updateIconState() {
    let mode = 'list';
    
    if (activePageContext === 'subs') {
        mode = storedSettings.viewModeSubs;
    } else {
        mode = storedSettings.viewModeHome;
    }

    if (mode === 'grid') {
        inputs.iconGrid.classList.add('active');
        inputs.iconList.classList.remove('active');
    } else {
        inputs.iconList.classList.add('active');
        inputs.iconGrid.classList.remove('active');
    }
}

// Create a set of toggle inputs for easier management
const toggleInputs = [inputs.highlightLinks, inputs.changeShortsScroll, inputs.hideMostRelevant, inputs.hideDividers, inputs.hideShorts, inputs.lazyFetchDescriptions];  
toggleInputs.forEach((toggle) => {
    if (toggle) {
        toggle.addEventListener('change', () => {
            saveToStorage();
            sendToTab();
        });
    }
});

// Helper: Send settings to ALL YouTube tabs
function sendToTab() {
    const settings = getCurrentSettings();
    
    // CHANGED: We now strictly ask Chrome for tabs matching the YouTube URL pattern.
    // This respects the 'host_permissions' in manifest.json and avoids permission errors.
    chrome.tabs.query({url: "https://www.youtube.com/*"}, (tabs) => {
        if (!tabs || tabs.length === 0) return;

        tabs.forEach((tab) => {
            // Send the message to every YouTube tab found (active or background)
            chrome.tabs.sendMessage(tab.id, {action: "updateSettings", settings: settings}, () => {
                // Suppress errors (e.g., if a tab is loading or the content script isn't ready)
                if (chrome.runtime.lastError) {
                    // console.log("Tab not ready:", tab.id); // Optional debug
                }
            });
        });
    });
}

// Helper: Save settings to Chrome Storage
function saveToStorage() {
    const settings = getCurrentSettings();
    chrome.storage.sync.set(settings);
}

// Setup Event Listeners with Validation (Clipping)
function setupControl(textInput, sliderInput) {
    if (!textInput || !sliderInput) return;

    // 1. Slider Move -> Update Text & Live Preview
    sliderInput.addEventListener('input', () => {
        textInput.value = sliderInput.value;
        sendToTab();
    });

    // 2. Slider Release -> Save
    sliderInput.addEventListener('change', () => {
        saveToStorage();
    });

    // 3. Text Input Typing -> Live Preview (if valid)
    textInput.addEventListener('input', () => {
        // We don't clip while typing (it ruins UX), just update slider if within range
        const val = Number(textInput.value);
        const min = Number(sliderInput.min);
        const max = Number(sliderInput.max);
        
        if (val >= min && val <= max) {
            sliderInput.value = val;
            sendToTab();
        }
    });

    // 4. Text Input Commit (Enter/Blur) -> CLIP & Save
    textInput.addEventListener('change', () => {
        let val = Number(textInput.value);
        const min = Number(sliderInput.min);
        const max = Number(sliderInput.max);

        // Validation Logic (Clipping)
        if (val < min) val = min;
        if (val > max) val = max;

        // Apply clipped value back to UI
        textInput.value = val;
        sliderInput.value = val;

        sendToTab();
        saveToStorage();
    });
}

// ==========================================================================
// CLEAR DESCRIPTION CACHE
// ==========================================================================
document.getElementById('clearCacheBtn').addEventListener('click', (e) => {
    // Remove the ytDescCache key from Chrome's local storage
    chrome.storage.local.remove('ytDescCache', () => {
        // Provide visual feedback
        const btn = e.target;
        const originalText = btn.textContent;
        btn.textContent = 'Cache Cleared!';
        btn.style.color = '#3ea6ff';
        btn.style.borderColor = '#3ea6ff';
        
        // Revert button text after 1.5 seconds
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 1500);
    });
});

// Initialize Controls
setupControl(inputs.listContainerWidth, inputs.listContainerWidthSlider);
setupControl(inputs.thumbnailWidth, inputs.thumbnailWidthSlider);
setupControl(inputs.titleFontSize, inputs.titleFontSizeSlider);
setupControl(inputs.metaFontSize, inputs.metaFontSizeSlider);
setupControl(inputs.notifyWidth, inputs.notifyWidthSlider);

// Create a set of toggle inputs's names for easier if check in listener
const toggleInputNames = ['highlightLinks', 'changeShortsScroll', 'hideMostRelevant', 'hideDividers', 'hideShorts', 'lazyFetchDescriptions'];



// Load saved settings
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;

    themeToggle.addEventListener('click', () => {
        // Toggle the light-theme class on the body
        body.classList.toggle('light-theme');
    });

    // 1. Determine Context (Are we looking at Subs or Home?)
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs.length > 0) {
            const url = tabs[0].url || '';
            if (url.includes('/feed/subscriptions')) {
                activePageContext = 'subs';
            } else {
                activePageContext = 'home';
            }
        }

        // 2. Load Settings
        chrome.storage.sync.get(defaults, (items) => {
            storedSettings = items; // Cache for logic
            
            // Update Icons based on context
            updateIconState();

            // Update Inputs
            for (const key in items) {
                if (toggleInputNames.includes(key) && inputs[key]) {
                    inputs[key].checked = items[key];
                }
                else {
                    if (inputs[key]) inputs[key].value = items[key];
                    if (inputs[key + 'Slider']) inputs[key + 'Slider'].value = items[key];
                }
            }
        });
    });
});

// Reset
document.getElementById('resetBtn').addEventListener('click', () => {
    // Keep current modes intact or reset them? Usually reset implies FULL reset.
    // Resetting to 'list' for both as per defaults.
    const resetSettings = { ...defaults };
    storedSettings = resetSettings; // Update local cache
    
    chrome.storage.sync.set(resetSettings, () => {
        for (const key in resetSettings) {
            if (toggleInputNames.includes(key) && inputs[key]) {
                inputs[key].checked = resetSettings[key];
            }
            // Handle Checkboxes and Sliders
            else {
                if (inputs[key]) inputs[key].value = resetSettings[key];
                if (inputs[key + 'Slider']) inputs[key + 'Slider'].value = resetSettings[key];
            }
        }
        updateIconState();
        sendToTab();
    });
});