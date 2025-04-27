// Define constants for DNR
const DNR_RULE_ID_PREFIX = 'header_modifier_rule_';
// Define which resource types the rules will apply to by default
const TARGET_RESOURCE_TYPES = [
    "main_frame",
    "sub_frame",
    "stylesheet",
    "script",
    "image",
    "font",
    "object",
    "xmlhttprequest", // For fetch/XHR requests
    "websocket",
    "other"
];

// --- Removed normalizeDomainPattern function ---

/**
 * Takes the rules stored by the user and converts them into
 * declarativeNetRequest rule format using urlFilter.
 * @param {Array} storedRules - Rules from chrome.storage.sync
 * @returns {Array} - Rules formatted for declarativeNetRequest
 */
function mapStoredRulesToDNR(storedRules) {
    const dnrRules = [];
    let priorityCounter = 1; // Assign increasing priorities

    for (const rule of storedRules) {
        if (!rule.enabled) continue; // Skip disabled rules

        // --- Use urlFilter ---
        let ruleCondition;
        if (rule.domainPattern && rule.domainPattern.trim() !== '') {
            // Use the user-provided pattern if it exists
            ruleCondition = {
                urlFilter: rule.domainPattern.trim(), // Use the pattern directly
                resourceTypes: TARGET_RESOURCE_TYPES
            };
        } else {
            // If the pattern is empty, match all URLs for the specified resource types.
            // A condition is required, so we use a wildcard filter.
            ruleCondition = {
                urlFilter: '*://*/*', // Match all URLs explicitly
                resourceTypes: TARGET_RESOURCE_TYPES
            };
            // Note: Alternatively, omitting urlFilter might seem intuitive,
            // but DNR rules generally require a condition like urlFilter or requestDomains.
            // '*://*/*' is the standard way to match all URLs.
        }
         // --- End urlFilter usage ---


        const dnrRule = {
            id: convertStoredRuleIdToDNRId(rule.id),
            priority: priorityCounter++,
            action: {
                type: "modifyHeaders",
                requestHeaders: [{
                    header: rule.headerName,
                    operation: rule.operation,
                    // Only include 'value' if operation is not 'remove'
                    ...(rule.operation !== 'remove' && { value: rule.headerValue })
                }]
            },
            condition: ruleCondition // Assign the constructed condition
        };

        // Basic validation for the urlFilter pattern before adding
        // Chrome will also validate, but this can catch errors earlier.
        if (ruleCondition.urlFilter && !isValidUrlFilter(ruleCondition.urlFilter)) {
             console.warn(`Rule ID ${rule.id} has an potentially invalid urlFilter: "${ruleCondition.urlFilter}". Skipping rule.`);
             // Optionally decrement priorityCounter if skipping? Depends on desired behavior.
             continue; // Skip adding this rule
        }


        dnrRules.push(dnrRule);
    }
    return dnrRules;
}

/** Rudimentary check for urlFilter patterns */
function isValidUrlFilter(filter) {
    // Very basic checks. Chrome's own validation is more thorough.
    // Allows wildcards, requires scheme separator generally.
    // Avoids overly complex regex here. Assume '*' or patterns containing '://' or just paths might be intended.
     if (filter === '*://*/*') return true; // Common valid pattern
     if (filter.includes('://') || filter.startsWith('/') || filter.startsWith('*')) {
         // Allows patterns like '*://*.example.com/*', '/path/*', '*. TLDs might fail Chrome validation if not specific.
         return true;
     }
     // Allow simple hostnames too, Chrome might interpret them as '*://hostname/*'
     if (!filter.includes('/') && filter.includes('.')) {
         return true;
     }
     // Add more checks if needed, but rely on Chrome's validation mostly.
     // console.warn(`Filter "${filter}" might be invalid.`); // Optional warning for patterns not caught above
    return true; // Pass through questionable patterns for Chrome to validate
}


/** Converts the user-defined rule ID (string) to a safe integer for DNR */
function convertStoredRuleIdToDNRId(storedRuleId) {
    // Simple hash function to get a somewhat stable integer ID.
    // DNR IDs must be >= 1. Ensure positive.
    let hash = 0;
    for (let i = 0; i < storedRuleId.length; i++) {
        const char = storedRuleId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    // Ensure positive and >= 1
    return Math.abs(hash) % 2000000 + 1; // Slightly larger range just in case of collisions + ensure >= 1
}


/**
 * Updates the dynamic rules in declarativeNetRequest based on stored rules.
 */
async function updateDNLRules() {
    console.log("Updating DNR rules using urlFilter...");
    try {
        // 1. Get rules from storage
        const result = await chrome.storage.sync.get(['rules']);
        const storedRules = result.rules || [];
        console.log("Stored rules fetched:", storedRules);

        // 2. Map stored rules to DNR format (using urlFilter)
        const newDnrRules = mapStoredRulesToDNR(storedRules.filter(r => r.enabled)); // Only map enabled rules
        console.log("Mapped DNR rules:", newDnrRules);


        // 3. Get current DNR rules to calculate differences
        const existingDnrRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingDnrRuleIds = existingDnrRules.map(rule => rule.id);
        const newDnrRuleIds = newDnrRules.map(rule => rule.id);

        // 4. Calculate differences
        const ruleIdsToRemove = existingDnrRuleIds.filter(id => !newDnrRuleIds.includes(id));

        // 5. Update DNR
        if (ruleIdsToRemove.length > 0 || newDnrRules.length > 0) {
             console.log(`Attempting DNR update: remove ${ruleIdsToRemove.length} rules, add/update ${newDnrRules.length} rules.`);
             await chrome.declarativeNetRequest.updateDynamicRules({
                 removeRuleIds: ruleIdsToRemove,
                 addRules: newDnrRules // Add/update rules. Rules with existing IDs are updated.
             });
            console.log(`DNR rules updated successfully.`);
        } else if (existingDnrRuleIds.length > 0) {
             // If there are no new rules and no rules to remove, but rules exist,
             // ensure they are cleared if the stored rules are empty.
             const storedEnabledRulesCount = storedRules.filter(r => r.enabled).length;
             if (storedEnabledRulesCount === 0 && existingDnrRuleIds.length > 0) {
                 console.log("No enabled rules in storage, removing all existing DNR rules.");
                 await chrome.declarativeNetRequest.updateDynamicRules({
                     removeRuleIds: existingDnrRuleIds,
                     addRules: []
                 });
                 console.log(`All DNR rules removed successfully.`);
             } else {
                 console.log("No changes needed for DNR rules.");
             }

        } else {
            console.log("No changes needed for DNR rules (no existing rules, no new rules).");
        }


    } catch (error) {
        // Log specific DNR validation errors if possible
        if (error.message.includes('Invalid rule condition')) {
             console.error("Error updating DNR rules: Invalid urlFilter pattern likely. Please check your rule patterns.", error);
        } else {
             console.error("Error updating DNR rules:", error);
        }
         // Consider notifying the user via badge text or other means if rules fail to apply.
         chrome.action.setBadgeText({ text: 'ERR' });
         chrome.action.setBadgeBackgroundColor({ color: '#DC143C' }); // Crimson
    }
}

// --- Event Listeners (remain the same) ---

chrome.runtime.onInstalled.addListener((details) => {
    console.log(`Extension ${details.reason}. Initializing rules.`);
    updateDNLRules().then(() => { // Clear badge on successful init
        chrome.action.setBadgeText({ text: '' });
    });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.rules) {
        console.log("Detected change in stored rules. Reloading DNR rules.");
        updateDNLRules().then(() => { // Clear badge on successful update
             chrome.action.setBadgeText({ text: '' });
         });
    }
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Browser startup. Ensuring DNR rules are up-to-date.");
     updateDNLRules().then(() => { // Clear badge on successful startup check
         chrome.action.setBadgeText({ text: '' });
     });
});

// Initial setup
console.log("Background service worker started. Ensuring rules are up-to-date.");
updateDNLRules().then(() => { // Clear badge on successful initial run
     chrome.action.setBadgeText({ text: '' });
 });