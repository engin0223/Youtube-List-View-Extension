const SHIFT_DELAY = 600;

// Default config matches styles.css fallback
// [UPDATED] Replaced single 'viewMode' with separate keys
const defaultSettings = {
    listContainerWidth: 90,
    thumbnailWidth: 260,
    titleFontSize: 13, // pt
    metaFontSize: 10,  // pt
    notifyWidth: 150,   // px
    cache_max_size: 200, // Max number of descriptions to cache
    cache_ttl_ms: 60 * 60 * 1000, // 1 hour TTL for cache entries
    highlightLinks: true,
    viewModeHome: 'grid', // Default for Home
    viewModeSubs: 'list',  // Default for Subscriptions
    changeShortsScroll: false, // Default to changing Shorts scroll behavior
    hideMostRelevant: false, // Default to showing "Most Relevant" section
    hideDividers: false, // Default to showing dividers in list view
    hideShorts: false, // New Setting to hide Shorts section on the homepage
    lazyFetchDescriptions: true // Default to lazy fetching descriptions
};

// Global cache to handle navigation changes instantly
let cachedSettings = { ...defaultSettings };

// State to track view mode status
let isListViewEnabled = true;

// Cache for video descriptions
let descriptionCache = {};


// Load cache from local storage on startup
chrome.storage.local.get(['ytDescCache'], (result) => {
    if (result.ytDescCache) {
        descriptionCache = result.ytDescCache;
    }
});

// Helper to save cache and prioritize the top 50 items currently on the screen
function saveDescriptionCache() {
    const keys = Object.keys(descriptionCache);
    
    if (keys.length > cachedSettings.cache_max_size) {
        // 1. Get the URLs of all videos currently in the DOM, in order from top to bottom
        const items = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
        const domUrls = [];
        
        items.forEach(item => {
            const linkEl = item.querySelector('a#video-title-link') || item.querySelector('a.yt-lockup-metadata-view-model__title');
            if (linkEl) {
                const urlObj = new URL(linkEl.href);
                urlObj.searchParams.delete('t'); // Keep matching consistent
                domUrls.push(urlObj.href);
            }
        });

        // 2. Sort the cached keys based on their position in the feed
        keys.sort((a, b) => {
            let indexA = domUrls.indexOf(a);
            let indexB = domUrls.indexOf(b);
            
            if (indexA === -1) indexA = Number.MAX_SAFE_INTEGER;
            if (indexB === -1) indexB = Number.MAX_SAFE_INTEGER;
            
            if (indexA === indexB) {
                return descriptionCache[b].timestamp - descriptionCache[a].timestamp;
            }
            return indexA - indexB;
        });
        
        // 3. Delete anything beyond the top CACHE_MAX_SIZE
        const keysToRemove = keys.slice(cache_max_size);
        for (const key of keysToRemove) {
            delete descriptionCache[key];
        }
    }
    chrome.storage.local.set({ ytDescCache: descriptionCache });
}



// ==========================================================================
// LOGIC: APPLY USER SETTINGS (CSS VARIABLES)
// ==========================================================================
function applySettings(settings) {
    // Update Cache
    cachedSettings = { ...defaultSettings, ...settings };

    const root = document.documentElement;
    root.style.setProperty('--list-container-width', settings.listContainerWidth + '%');
    root.style.setProperty('--thumbnail-width', settings.thumbnailWidth + 'px');
    root.style.setProperty('--title-font-size', settings.titleFontSize + 'pt');
    root.style.setProperty('--meta-font-size', settings.metaFontSize + 'pt');
    root.style.setProperty('--notify-width', settings.notifyWidth + 'px');

    const linkColor = settings.highlightLinks ? '#3ea6ff' : 'inherit';
    root.style.setProperty('--desc-link-color', linkColor);

    // [UPDATED] Determine which mode to use based on current page
    const currentModeKey = getViewModeKey();
    const currentViewMode = settings[currentModeKey]; // 'grid' or 'list'

    if (currentViewMode === 'grid') {
        disableListView();
    } else {
        enableListView();
    }

    if (settings.hideDividers) {
        document.documentElement.classList.add('hide-dividers');
    } else {
        document.documentElement.classList.remove('hide-dividers');
    }

    if (settings.hideShorts) {
        document.documentElement.classList.add('hide-shorts');
    } else {
        document.documentElement.classList.remove('hide-shorts');
    }

    // Handle Shorts scroll behavior
    updateShortsScrollSetting(settings);

    // Apply "Most Relevant" setting
    processMostRelevantSection();
}

function enableListView() {
    isListViewEnabled = true;
    document.documentElement.classList.add('list-view-active');
    updateToggleButtonsUI();
    // Trigger a reflow fix immediately when switching
    if (isTargetPage()) injectTemporaryPanel();
}

function disableListView() {
    isListViewEnabled = false;
    document.documentElement.classList.remove('list-view-active');
    updateToggleButtonsUI();
}

// [NEW] Helper to get the correct storage key based on URL
function getViewModeKey() {
    if (window.location.href.includes('/feed/subscriptions')) {
        return 'viewModeSubs';
    }
    // Default to Home logic for / and /featured
    return 'viewModeHome'; 
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
// LOGIC: INJECT TOGGLE BUTTONS (GRID / LIST) - DYNAMIC PLACEMENT
// ==========================================================================
function injectViewToggle() {
    // 1. Create the container if it doesn't exist (in memory)
    let container = document.getElementById('view-toggle-container');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'view-toggle-container';

        // Grid Icon SVG
        const gridIcon = `
            <svg viewBox="0 0 24 24" height="24" width="24">
                <rect x="2" y="4" width="5" height="7" rx="1"></rect>
                <rect x="2" y="13" width="5" height="7" rx="1"></rect>
                <rect x="9.5" y="4" width="5" height="7" rx="1"></rect>
                <rect x="9.5" y="13" width="5" height="7" rx="1"></rect>
                <rect x="17" y="4" width="5" height="7" rx="1"></rect>
                <rect x="17" y="13" width="5" height="7" rx="1"></rect>
            </svg>
        `;

        // List Icon SVG
        const listIcon = `
            <svg viewBox="0 0 24 24" height="24" width="24">
                <rect x="2" y="4" width="5" height="4" rx="1"></rect>
                <rect x="9" y="4" width="13" height="4" rx="1"></rect>
                
                <rect x="2" y="10" width="5" height="4" rx="1"></rect>
                <rect x="9" y="10" width="13" height="4" rx="1"></rect>
                
                <rect x="2" y="16" width="5" height="4" rx="1"></rect>
                <rect x="9" y="16" width="13" height="4" rx="1"></rect>
            </svg>
        `;

        // Grid Button
        const gridBtn = document.createElement('button');
        gridBtn.className = 'view-toggle-btn';
        gridBtn.id = 'toggle-grid-btn';
        gridBtn.innerHTML = gridIcon;
        gridBtn.title = 'Grid View';
        gridBtn.onclick = (e) => {
            e.stopPropagation(); 
            disableListView();
            
            // [UPDATED] Save to the specific key (Home or Subs)
            const key = getViewModeKey();
            cachedSettings[key] = 'grid'; // Update local cache
            chrome.storage.sync.set({ [key]: 'grid' });
        };

        // List Button
        const listBtn = document.createElement('button');
        listBtn.className = 'view-toggle-btn';
        listBtn.id = 'toggle-list-btn';
        listBtn.innerHTML = listIcon;
        listBtn.title = 'List View';
        listBtn.onclick = (e) => {
            e.stopPropagation();
            enableListView();

            // [UPDATED] Save to the specific key (Home or Subs)
            const key = getViewModeKey();
            cachedSettings[key] = 'list'; // Update local cache
            chrome.storage.sync.set({ [key]: 'list' });
        };

        container.appendChild(gridBtn);
        container.appendChild(listBtn);
    }

    // 2. Determine where to place the container based on the current page
    let targetParent = null;

    if (window.location.href.includes('/feed/subscriptions')) {
        // --- SUBSCRIPTIONS PAGE ---
        const subBtn = document.querySelector('ytd-shelf-renderer #subscribe-button');
        if (subBtn) {
            targetParent = subBtn.parentElement; 
        }
        container.classList.remove('home-header-mode');

    } else if (window.location.pathname === '/' || window.location.href.includes('/featured')) {
        // --- HOME PAGE ---
        const chipBar = document.querySelector('ytd-feed-filter-chip-bar-renderer');
        
        if (chipBar) {
            targetParent = chipBar;
            container.classList.add('home-header-mode');
            
            if (getComputedStyle(chipBar).position === 'static') {
                chipBar.style.position = 'relative';
            }
        }
    }

    // 3. Insert or Move the container
    if (targetParent && container.parentElement !== targetParent) {
        targetParent.appendChild(container);
        updateToggleButtonsUI(); 
    }
}

function updateToggleButtonsUI() {
    const gridBtn = document.getElementById('toggle-grid-btn');
    const listBtn = document.getElementById('toggle-list-btn');
    
    if (gridBtn && listBtn) {
        if (isListViewEnabled) {
            listBtn.classList.add('active');
            gridBtn.classList.remove('active');
        } else {
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
        }
    }
}

// ==========================================================================
// LOGIC: HEADER MODIFICATIONS
// ==========================================================================
function processSubscriptionsHeader() {
    if (!isTargetPage() || !isListViewEnabled) return; 

    const items = document.querySelectorAll('ytd-rich-item-renderer');

    items.forEach(item => {
        // 1. CLONE CHANNEL NAME 
        if (!item.querySelector('.cloned-channel-name')) {
            const lockup = item.querySelector('.yt-lockup-view-model, .ytLockupViewModelWrapper, .ytLockupViewModelHost');
            const metadataModel = item.querySelector('yt-content-metadata-view-model, .ytContentMetadataViewModelHost');

            if (lockup && metadataModel) {
                // Try finding by the known class first
                let originalChannelRow = metadataModel.querySelector('.ytContentMetadataViewModelMetadataRow');

                // Fallback: If YouTube changed the class name, find the channel link and grab its wrapper
                if (!originalChannelRow) {
                    const channelLink = metadataModel.querySelector('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"]');
                    if (channelLink) {
                        let curr = channelLink;
                        // Climb up the DOM until we get the top-level row inside the metadata block
                        while (curr && curr.parentElement !== metadataModel) {
                            curr = curr.parentElement;
                        }
                        originalChannelRow = curr;
                    } else if (metadataModel.firstElementChild) {
                        originalChannelRow = metadataModel.firstElementChild;
                    }
                }

                if (originalChannelRow) {
                    const clone = originalChannelRow.cloneNode(true);
                    clone.classList.add('cloned-channel-name');
                    lockup.appendChild(clone);
                }
            }
        }

        // 2. LINK THE AVATAR
        const avatarContainer = item.querySelector('.yt-lockup-metadata-view-model__avatar, .ytLockupMetadataViewModelAvatar');
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

// ==========================================================================
// LOGIC: LINKIFY DESCRIPTIONS
// ==========================================================================
function linkify(text) {
    if (!text) return '';
    
    let safeText = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return safeText.replace(urlRegex, function(url) {
        // [CHANGED] color is now var(--desc-link-color)
        return `<a href="${url}" target="_blank" style="color: var(--desc-link-color); text-decoration: none; z-index: 200; position: relative;">${url}</a>`;
    });
}

function injectDescriptionUI(metadataContainer, fullDescText) {
    if (!fullDescText || fullDescText === 'null') return;

    const existingWrapper = metadataContainer.querySelector('.custom-description-container');
    if (existingWrapper) existingWrapper.remove();
    metadataContainer.querySelectorAll('.custom-description').forEach(el => el.remove());

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-description-container';

    const descDiv = document.createElement('div');
    descDiv.className = 'custom-description';
    descDiv.innerHTML = linkify(fullDescText);

    descDiv.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            e.stopPropagation();
        }
    });

    wrapper.appendChild(descDiv);

    if (fullDescText.length > 150 || fullDescText.includes('\n')) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'desc-toggle-btn';
        toggleBtn.textContent = 'Show More';
        
        toggleBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isExpanded = descDiv.classList.toggle('expanded');
            toggleBtn.textContent = isExpanded ? 'Show Less' : 'Show More';
        };
        wrapper.appendChild(toggleBtn);
    }
    metadataContainer.appendChild(wrapper);
}


// ==========================================================================
// LOGIC: FETCH DESCRIPTIONS (Local Cache Integrated, Throttling Removed)
// ==========================================================================

// Global Observer for Lazy Fetching
const descriptionObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const item = entry.target;
            fetchDescriptionForItem(item);
            // Stop observing once we've triggered the fetch
            observer.unobserve(item);
            item.dataset.isObserved = 'false'; 
        }
    });
}, { 
    root: null, 
    rootMargin: '800px 0px', // Start fetching 800px before it enters the screen
    threshold: 0.01 
});

function processVideoDescriptions() {
    if (!isTargetPage()) return;

    const items = document.querySelectorAll('ytd-rich-item-renderer');
    const now = Date.now();

    items.forEach(item => {
        const linkEl = item.querySelector('a#video-title-link, a.yt-lockup-metadata-view-model__title, a.ytLockupMetadataViewModelTitle');
        if (!linkEl) return;

        const currentUrlObj = new URL(linkEl.href);
        currentUrlObj.searchParams.delete('t'); 
        const currentUrl = currentUrlObj.href;

        const metadataContainer = item.querySelector('yt-content-metadata-view-model');
        if (!metadataContainer) return;

        // CHECK: Ensure the URL matches AND the description container wasn't destroyed
        const hasDescription = metadataContainer.querySelector('.custom-description-container');
        if (item.dataset.processedUrl === currentUrl && hasDescription) return;

        // CLEANUP: If reusing an item that has an old description
        if (item.dataset.processedUrl && item.dataset.processedUrl !== currentUrl) {
            const oldContainer = item.querySelector('.custom-description-container');
            if (oldContainer) oldContainer.remove();
            item.querySelectorAll('.custom-description').forEach(el => el.remove());
            item.dataset.descFetching = 'false'; 
            item.dataset.observedUrl = ''; // Reset observer tracking
        }

        // Prevent double-fetching
        if (item.dataset.descFetching === 'true') return;

        // 1. FAST LOCAL CACHE INJECTION (Always Synchronous)
        const cachedData = descriptionCache[currentUrl];
        if (cachedData && (now - cachedData.timestamp < cachedSettings.cache_ttl_ms)) {
            injectDescriptionUI(metadataContainer, cachedData.text);
            item.dataset.processedUrl = currentUrl;
            return; // Exit early, no network request needed
        }

        // 2. DECIDE NETWORK FETCH BEHAVIOR (Lazy vs Immediate)
        if (cachedSettings.lazyFetchDescriptions) {
            // Only observe if we aren't already observing this exact URL
            if (item.dataset.observedUrl !== currentUrl) {
                item.dataset.observedUrl = currentUrl;
                descriptionObserver.observe(item);
            }
        } else {
            // Fetch immediately
            fetchDescriptionForItem(item, currentUrl, currentUrlObj, metadataContainer);
        }
    });
}

function fetchDescriptionForItem(item, currentUrl, currentUrlObj, metadataContainer) {
    // If triggered by observer, parameters might be missing, so we re-extract them safely
    if (!currentUrl) {
        const linkEl = item.querySelector('a#video-title-link, a.yt-lockup-metadata-view-model__title, a.ytLockupMetadataViewModelTitle');
        if (!linkEl) return;
        currentUrlObj = new URL(linkEl.href);
        currentUrlObj.searchParams.delete('t');
        currentUrl = currentUrlObj.href;
        
        metadataContainer = item.querySelector('yt-content-metadata-view-model');
        if (!metadataContainer) return;

        // Double check cache in case it was cached while scrolling
        const cachedData = descriptionCache[currentUrl];
        if (cachedData && (Date.now() - cachedData.timestamp < cachedSettings.cache_ttl_ms)) {
            injectDescriptionUI(metadataContainer, cachedData.text);
            item.dataset.processedUrl = currentUrl;
            return;
        }
    }

    if (item.dataset.descFetching === 'true') return;
    item.dataset.descFetching = 'true';
    
    fetch(currentUrl)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.text();
        })
        .then(html => {
            // Double check DOM before injecting in case user navigated away quickly
            const finalLink = item.querySelector('a#video-title-link, a.yt-lockup-metadata-view-model__title, a.ytLockupMetadataViewModelTitle');
            if (finalLink && !finalLink.href.includes(currentUrlObj.pathname)) {
                 item.dataset.descFetching = 'false';
                 return;
            }

            // EXTRACT DESCRIPTION
            const jsonMatch = html.match(/"description":\{"simpleText":"((?:[^"\\]|\\.)*?)"\}/);
            const metaMatch = html.match(/<meta name="description" content="([^"]*)"/);

            let fullDescText = '';

            if (jsonMatch && jsonMatch[1]) {
                try { fullDescText = JSON.parse('"' + jsonMatch[1] + '"'); } catch (e) {}
            }
            
            if (!fullDescText && metaMatch && metaMatch[1]) {
                 fullDescText = decodeHtmlEntities(metaMatch[1]);
            }

            if (fullDescText && fullDescText !== 'null') {
                injectDescriptionUI(metadataContainer, fullDescText);

                // Save to cache
                descriptionCache[currentUrl] = {
                    text: fullDescText,
                    timestamp: Date.now()
                };
                saveDescriptionCache();
            }
            item.dataset.processedUrl = currentUrl;
            item.dataset.descFetching = 'false';
        })
        .catch(err => {
            item.dataset.descFetching = 'false';
        });
}

// ==========================================================================
// LOGIC: INJECT WATCH LATER BUTTON
// ==========================================================================
function processWatchLater() {
    // 1. Check if Watch Later link already exists
    if (!isListViewEnabled) return; 

    const existingBtn = document.querySelector('a[href="/playlist?list=WL"]');
    if (existingBtn) return;

    // 2. Find a sibling to insert after (Playlists or History)
    const playlistsLink = document.querySelector('a[href="/feed/playlists"]');
    const historyLink = document.querySelector('a[href="/feed/history"]');

    // Determine the reference node (we want to insert AFTER this node)
    let referenceNode = null;
    if (playlistsLink) {
        referenceNode = playlistsLink.closest('ytd-guide-entry-renderer');
    } else if (historyLink) {
        referenceNode = historyLink.closest('ytd-guide-entry-renderer');
    }

    // 3. Insert the button
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
    if (!isListViewEnabled) return; 
    
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
// LOGIC: TEMPORARY SIDEBAR INJECTION
// ==========================================================================
let hasTriggeredLayoutFix = false;
let lastUrl = window.location.href;

function injectTemporaryPanel() {
    if (hasTriggeredLayoutFix || !isListViewEnabled) return; 

    const primaryContainer = document.querySelector('ytd-two-column-browse-results-renderer #primary');
    if (!primaryContainer) return;

    hasTriggeredLayoutFix = true;

    const dummyPanel = document.createElement('div');
    dummyPanel.id = 'tm-layout-fix-panel';
    dummyPanel.style.width = '1px';
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
// LOGIC: HIDE "MOST RELEVANT" SECTION
// ==========================================================================
function processMostRelevantSection() {
    // If the setting is disabled, un-hide any previously hidden sections
    if (!cachedSettings.hideMostRelevant) {
        const hiddenSections = document.querySelectorAll('ytd-rich-section-renderer[data-hidden-by-ext="true"]');
        hiddenSections.forEach(section => {
            section.style.display = '';
            section.removeAttribute('data-hidden-by-ext');
        });
        return;
    }

    // Find all section titles
    const titles = document.querySelectorAll('ytd-rich-section-renderer span#title');
    
    titles.forEach(title => {
        // Use case-insensitive matching in case YouTube changes capitalization
        if (title.textContent && title.textContent.trim().toLowerCase() === 'most relevant') {
            const section = title.closest('ytd-rich-section-renderer');
            // Hide the entire section if it isn't hidden already
            if (section && section.style.display !== 'none') {
                section.style.display = 'none';
                section.setAttribute('data-hidden-by-ext', 'true');
            }
        }
    });
}


// ==========================================================================
// MAIN OBSERVER & NAVIGATION LISTENERS
// ==========================================================================

// 1. WATCH FOR DOM CHANGES (Infinite Scroll / Initial Load)
const observer = new MutationObserver((mutations) => {
    
    injectViewToggle();

    // Reset layout fix trigger on URL change (Fallback)
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

        if (isListViewEnabled) {
            removeAds();
            processSubscriptionsHeader();
            processVideoDescriptions();
            processWatchLater();

            const items = document.querySelectorAll('ytd-rich-item-renderer');
            if (items.length > 0) {
                injectTemporaryPanel();
            }
        }
        processMostRelevantSection();
        injectViewToggle();
    }
});

observer.observe(document.body, { childList: true, subtree: true });




// ==========================================================================
// LOGIC: CHANGE SHORTS SCROLL BEHAVIOR
// ==========================================================================
function handleShortsScrollBehavior(e) {
    const buttonRenderer = e.target.closest('.expand-collapse-button');
    if (!buttonRenderer) return;

    const button = buttonRenderer.querySelector('button');
    const textElement = buttonRenderer.querySelector('.yt-core-attributed-string');
    
    const ariaLabel = button ? button.getAttribute('aria-label') : '';
    const textContent = textElement ? textElement.textContent.trim() : '';
    
    const isShowLess = 
        (ariaLabel && ariaLabel.toLowerCase() === 'show less') ||
        (textContent && textContent.toLowerCase() === 'show less');

    if (!isShowLess) return;

    const shelf = buttonRenderer.closest('ytd-rich-shelf-renderer');
    if (!shelf) return;

    const headerHeight = 56;
    const rect = shelf.getBoundingClientRect();

    if (rect.top < headerHeight) {
        setTimeout(() => {
            const newRect = shelf.getBoundingClientRect();
            const absoluteTop = newRect.top + window.scrollY;

            window.scrollTo({
                top: absoluteTop - headerHeight - 16,
                behavior: 'smooth'
            });
        }, 500);
    }
}

// ==========================================================================
// TOGGLE THE FEATURE BASED ON SETTINGS
// ==========================================================================
function updateShortsScrollSetting(settings) {
    if (settings.changeShortsScroll) {
        // Add the listener. If it's already added, JS is smart enough not to add a duplicate.
        document.addEventListener('click', handleShortsScrollBehavior);
    } else {
        // Remove the listener. This now works because we pass the EXACT same function reference.
        document.removeEventListener('click', handleShortsScrollBehavior);
    }
}

// 2. WATCH FOR PAGE NAVIGATION (Home <-> Subscriptions transition)
document.addEventListener('yt-navigate-finish', () => {
    // Force update internal state
    lastUrl = window.location.href;
    hasTriggeredLayoutFix = false;
    injectViewToggle();
    
    // [UPDATED] Re-run applySettings to ensure we switch mode if URL changed (Home <-> Subs)
    applySettings(cachedSettings);

    if (isTargetPage() && isListViewEnabled) {
        removeAds();
        processSubscriptionsHeader();
        processVideoDescriptions();
        processWatchLater();
        // The observer will likely catch the rest, but this ensures we don't miss the event
    }
});