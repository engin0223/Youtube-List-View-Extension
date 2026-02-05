const SHIFT_DELAY = 600;

// Default config matches styles.css fallback
const defaultSettings = {
    listContainerWidth: 90,
    thumbnailWidth: 260,
    titleFontSize: 13, // pt
    metaFontSize: 10   // pt
};

// ==========================================================================
// LOGIC: APPLY USER SETTINGS (CSS VARIABLES)
// ==========================================================================
function applySettings(settings) {
    const root = document.documentElement;
    root.style.setProperty('--list-container-width', settings.listContainerWidth + '%');
    root.style.setProperty('--thumbnail-width', settings.thumbnailWidth + 'px');
    root.style.setProperty('--title-font-size', settings.titleFontSize + 'pt');
    root.style.setProperty('--meta-font-size', settings.metaFontSize + 'pt');
}

// Load settings on startup
chrome.storage.sync.get(defaultSettings, (items) => {
    applySettings(items);
});

// Listen for updates from Popup (Live Preview)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateSettings") {
        applySettings(request.settings);
    }
});

// Helper to identify if we are on a page we want to modify
function isTargetPage() {
    const url = window.location.href;
    // Check for Subscriptions OR Home (Root / or /featured)
    return url.includes('/feed/subscriptions') || 
           (window.location.pathname === '/' || url.includes('/featured')); 
}

// ==========================================================================
// LOGIC: HEADER MODIFICATIONS
// ==========================================================================
function processSubscriptionsHeader() {
    if (!isTargetPage()) return;

    const items = document.querySelectorAll('ytd-rich-item-renderer');

    items.forEach(item => {
        // 1. CLONE CHANNEL NAME (If not already cloned)
        if (!item.querySelector('.cloned-channel-name')) {
            const lockup = item.querySelector('.yt-lockup-view-model');
            const metadataModel = item.querySelector('yt-content-metadata-view-model');

            if (lockup && metadataModel) {
                const originalChannelRow = metadataModel.querySelector('.yt-content-metadata-view-model__metadata-row');
                if (originalChannelRow) {
                    const clone = originalChannelRow.cloneNode(true);
                    clone.classList.add('cloned-channel-name');
                    lockup.appendChild(clone);
                }
            }
        }

        // 2. LINK THE AVATAR
        const avatarContainer = item.querySelector('.yt-lockup-metadata-view-model__avatar');
        const channelLinkEl = item.querySelector('.cloned-channel-name a') || item.querySelector('yt-content-metadata-view-model a');

        if (avatarContainer && channelLinkEl && !avatarContainer.querySelector('.custom-avatar-link')) {
            const channelUrl = channelLinkEl.href;
            const anchor = document.createElement('a');
            anchor.href = channelUrl;
            anchor.classList.add('custom-avatar-link');
            
            // Move the avatar image inside the new anchor
            while (avatarContainer.firstChild) {
                anchor.appendChild(avatarContainer.firstChild);
            }
            avatarContainer.appendChild(anchor);
        }
    });
}

// ==========================================================================
// LOGIC: FETCH DESCRIPTIONS (TrustedHTML Safe)
// ==========================================================================
function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function processVideoDescriptions() {
    if (!isTargetPage()) return;

    const items = document.querySelectorAll('ytd-rich-item-renderer');

    items.forEach(item => {
        // Skip if already processed or currently fetching
        if (item.dataset.descAdded === 'true' || item.dataset.descFetching === 'true') return;

        const linkEl = item.querySelector('a#video-title-link') || item.querySelector('a.yt-lockup-metadata-view-model__title');
        if (!linkEl) return;

        const metadataContainer = item.querySelector('yt-content-metadata-view-model');
        if (!metadataContainer) return;

        item.dataset.descFetching = 'true';
        const url = linkEl.href;

        fetch(url)
            .then(response => response.text())
            .then(html => {
                const match = html.match(/<meta name="description" content="([^"]*)"/);

                if (match && match[1]) {
                    const rawDesc = match[1];
                    if (rawDesc && rawDesc !== 'null') {
                        const descDiv = document.createElement('div');
                        descDiv.className = 'custom-description';
                        descDiv.textContent = decodeHtmlEntities(rawDesc);
                        metadataContainer.appendChild(descDiv);
                    }
                }
                item.dataset.descAdded = 'true';
            })
            .catch(err => {
                // Prevent infinite retries on failure
                item.dataset.descAdded = 'true';
            });
    });
}

// ==========================================================================
// LOGIC: INJECT WATCH LATER BUTTON (If Missing)
// ==========================================================================
function processWatchLater() {
    // 1. Check if Watch Later link already exists
    const existingBtn = document.querySelector('a[href="/playlist?list=WL"]');
    if (existingBtn) return;

    // 2. Find a sibling to insert after (Playlists or History) to ensure correct position
    const playlistsLink = document.querySelector('a[href="/feed/playlists"]');
    const historyLink = document.querySelector('a[href="/feed/history"]');
    
    // Determine the reference node (we want to insert AFTER this node)
    let referenceNode = null;
    if (playlistsLink) {
        referenceNode = playlistsLink.closest('ytd-guide-entry-renderer');
    } else if (historyLink) {
        referenceNode = historyLink.closest('ytd-guide-entry-renderer');
    }

    // 3. Insert the button if we found a place for it
    if (referenceNode && referenceNode.parentElement) {
        const container = referenceNode.parentElement;
        
        // HTML string provided by user (cleaned up slightly)
        const watchLaterHTML = `
        <ytd-guide-entry-renderer class="style-scope ytd-guide-collapsible-section-entry-renderer" line-end-style="none">
            <a id="endpoint" class="yt-simple-endpoint style-scope ytd-guide-entry-renderer" tabindex="-1" role="link" href="/playlist?list=WL" title="Watch later">
                <tp-yt-paper-item role="link" class="style-scope ytd-guide-entry-renderer" style-target="host" tabindex="0" aria-disabled="false">
                    <yt-icon class="guide-icon style-scope ytd-guide-entry-renderer">
                        <span class="yt-icon-shape style-scope yt-icon ytSpecIconShapeHost">
                            <div style="width: 100%; height: 100%; display: block; fill: currentcolor;">
                                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
                                    <path d="M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1Zm0 2a9 9 0 110 18.001A9 9 0 0112 3Zm0 3a1 1 0 00-1 1v5.565l.485.292 3.33 2a1 1 0 001.03-1.714L13 11.435V7a1 1 0 00-1-1Z"></path>
                                </svg>
                            </div>
                        </span>
                    </yt-icon>
                    <yt-formatted-string class="title style-scope ytd-guide-entry-renderer">Watch later</yt-formatted-string>
                </tp-yt-paper-item>
            </a>
            <yt-interaction class="style-scope ytd-guide-entry-renderer">
                <div class="stroke style-scope yt-interaction"></div>
                <div class="fill style-scope yt-interaction"></div>
            </yt-interaction>
        </ytd-guide-entry-renderer>
        `;

        // Create a document fragment from the HTML string
        const range = document.createRange();
        range.selectNode(document.body);
        const fragment = range.createContextualFragment(watchLaterHTML);

        // Insert after the reference node
        if (referenceNode.nextSibling) {
            container.insertBefore(fragment, referenceNode.nextSibling);
        } else {
            container.appendChild(fragment);
        }
    }
}

// ==========================================================================
// LOGIC: REMOVE ADS
// ==========================================================================
function removeAds() {
    // Finds the specific ad tag and removes its parent container (the grid item)
    const adSlots = document.querySelectorAll('ytd-ad-slot-renderer');
    adSlots.forEach(slot => {
        const container = slot.closest('ytd-rich-item-renderer');
        if (container) {
            container.remove();
        }
    });
}

// ==========================================================================
// LOGIC: TEMPORARY SIDEBAR INJECTION (Forces Grid to List Reflow)
// ==========================================================================
let hasTriggeredLayoutFix = false;
let lastUrl = window.location.href;

function injectTemporaryPanel() {
    if (hasTriggeredLayoutFix) return;

    const primaryContainer = document.querySelector('ytd-two-column-browse-results-renderer #primary');
    if (!primaryContainer) return;

    hasTriggeredLayoutFix = true;

    const dummyPanel = document.createElement('div');
    dummyPanel.id = 'tm-layout-fix-panel';
    dummyPanel.style.width = '300px';
    dummyPanel.style.height = '100vh';
    dummyPanel.style.flexShrink = '0';
    dummyPanel.style.backgroundColor = 'transparent';
    dummyPanel.style.transition = 'width 0.2s ease-out';

    const originalDisplay = primaryContainer.style.display;
    primaryContainer.style.display = 'flex';
    primaryContainer.style.flexDirection = 'row';

    primaryContainer.prepend(dummyPanel);

    setTimeout(() => {
        dummyPanel.style.width = '0px';
        setTimeout(() => {
            dummyPanel.remove();
            primaryContainer.style.display = originalDisplay;
            window.dispatchEvent(new Event('resize'));
        }, 200);
    }, SHIFT_DELAY);
}

// ==========================================================================
// MAIN OBSERVER
// ==========================================================================
const observer = new MutationObserver((mutations) => {
    // Reset layout fix trigger on URL change
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        hasTriggeredLayoutFix = false;
    }

    if (isTargetPage()) {
        const browse = document.querySelector('ytd-browse');
        if (browse) {
            // FIX: Aggressively enforce page-subtype to ensure CSS Selectors match.
            // If we are on Subscriptions, force 'subscriptions'
            if (window.location.href.includes('/feed/subscriptions')) {
                if (browse.getAttribute('page-subtype') !== 'subscriptions') {
                    browse.setAttribute('page-subtype', 'subscriptions');
                }
            } 
            // If we are on Home, force 'home' (This was missing/weak before)
            else if (window.location.pathname === '/' || window.location.href.includes('/featured')) {
                if (browse.getAttribute('page-subtype') !== 'home') {
                    browse.setAttribute('page-subtype', 'home');
                }
            }
        }

        removeAds(); // <-- Added call to remove ads
        processSubscriptionsHeader();
        processVideoDescriptions();
        processWatchLater();

        const items = document.querySelectorAll('ytd-rich-item-renderer');
        if (items.length > 0) {
            injectTemporaryPanel();
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });