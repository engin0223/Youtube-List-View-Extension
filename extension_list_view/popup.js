// Default configuration
const defaults = {
    listContainerWidth: 90,
    thumbnailWidth: 260,
    titleFontSize: 13, // pt
    metaFontSize: 10,  // pt
    notifyWidth: 150   // px
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
    notifyWidthSlider: document.getElementById('notifyWidthSlider')
};

// Helper: Get current values from DOM
function getCurrentSettings() {
    return {
        listContainerWidth: inputs.listContainerWidth.value,
        thumbnailWidth: inputs.thumbnailWidth.value,
        titleFontSize: inputs.titleFontSize.value,
        metaFontSize: inputs.metaFontSize.value,
        notifyWidth: inputs.notifyWidth.value
    };
}

// Helper: Send settings to active tab (Live Preview)
function sendToTab() {
    const settings = getCurrentSettings();
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {action: "updateSettings", settings: settings});
        }
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

// Initialize
setupControl(inputs.listContainerWidth, inputs.listContainerWidthSlider);
setupControl(inputs.thumbnailWidth, inputs.thumbnailWidthSlider);
setupControl(inputs.titleFontSize, inputs.titleFontSizeSlider);
setupControl(inputs.metaFontSize, inputs.metaFontSizeSlider);
setupControl(inputs.notifyWidth, inputs.notifyWidthSlider);

// Load saved settings
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(defaults, (items) => {
        for (const key in items) {
            if (inputs[key]) inputs[key].value = items[key];
            if (inputs[key + 'Slider']) inputs[key + 'Slider'].value = items[key];
        }
    });
});

// Reset
document.getElementById('resetBtn').addEventListener('click', () => {
    chrome.storage.sync.set(defaults, () => {
        for (const key in defaults) {
            if (inputs[key]) inputs[key].value = defaults[key];
            if (inputs[key + 'Slider']) inputs[key + 'Slider'].value = defaults[key];
        }
        sendToTab();
    });
});