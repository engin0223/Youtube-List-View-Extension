// Default configuration
const defaults = {
    listContainerWidth: 90,
    thumbnailWidth: 260,
    titleFontSize: 13, // pt
    metaFontSize: 10,  // pt
    notifyWidth: 150,   // px
    highlightLinks: true,
    viewModeHome: 'grid', // New Default
    viewModeSubs: 'list',  // New Default
    changeShortsScroll: false, // New Setting to control Shorts scroll behavior
    hideMostRelevant: false // New Setting to hide "Most Relevant" section in search results
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

// Highlight Links Toggle
if (inputs.highlightLinks) {
    inputs.highlightLinks.addEventListener('change', () => {
        saveToStorage();
        sendToTab();
    });
}

// Change Shorts Scroll Behavior Toggle
if (inputs.changeShortsScroll) {
    inputs.changeShortsScroll.addEventListener('change', () => {
        saveToStorage();
        sendToTab();
    });
}

// Hide Most Relevant Section Toggle
if (inputs.hideMostRelevant) {
    inputs.hideMostRelevant.addEventListener('change', () => {
        saveToStorage();
        sendToTab();
    });
}

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

// Initialize Controls
setupControl(inputs.listContainerWidth, inputs.listContainerWidthSlider);
setupControl(inputs.thumbnailWidth, inputs.thumbnailWidthSlider);
setupControl(inputs.titleFontSize, inputs.titleFontSizeSlider);
setupControl(inputs.metaFontSize, inputs.metaFontSizeSlider);
setupControl(inputs.notifyWidth, inputs.notifyWidthSlider);

// Load saved settings
document.addEventListener('DOMContentLoaded', () => {
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
                if ((key === 'highlightLinks' || key === 'changeShortsScroll' || key === 'hideMostRelevant') && inputs[key]) {
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
            if ((key === 'highlightLinks' || key === 'changeShortsScroll' || key === 'hideMostRelevant') && inputs[key]) {
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