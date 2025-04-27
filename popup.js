document.addEventListener('DOMContentLoaded', () => {
    const domainPatternInput = document.getElementById('domain-pattern');
    const operationSelect = document.getElementById('operation');
    const headerNameInput = document.getElementById('header-name');
    const headerValueInput = document.getElementById('header-value');
    const addRuleButton = document.getElementById('add-rule-button');
    const rulesList = document.getElementById('rules-list');
    const errorMessage = document.getElementById('error-message');

    // --- Load and Display Rules ---
    function displayRule(rule) {
        const listItem = document.createElement('li');

        let valueText = rule.operation !== 'remove' ? ` -> "${rule.headerValue}"` : '';
        let opText = rule.operation.charAt(0).toUpperCase() + rule.operation.slice(1); // Capitalize

        // --- Updated display for site pattern ---
        const siteDisplay = rule.domainPattern && rule.domainPattern.trim() !== ''
            ? `<code>${rule.domainPattern}</code>`
            : '<em>All Sites</em>';

        listItem.innerHTML = `
            <span>
                <strong>Site:</strong> ${siteDisplay}<br>
                <strong>Action:</strong> ${opText} <code>${rule.headerName}</code>${valueText}
            </span>
        `;
        // --- End site pattern display update ---


        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.dataset.ruleId = rule.id; // Store ID for deletion
        deleteButton.addEventListener('click', handleDeleteRule);

        listItem.appendChild(deleteButton);
        rulesList.appendChild(listItem);
    }

    async function loadRulesFromStorage() {
        rulesList.innerHTML = '';
        errorMessage.textContent = '';

        try {
            const result = await chrome.storage.sync.get(['rules']);
            const rules = result.rules || [];
            if (rules.length === 0) {
                 rulesList.innerHTML = '<li>No rules defined yet.</li>';
            } else {
                rules.forEach(displayRule);
            }
             // Check background error state (optional enhancement)
             const badgeText = await chrome.action.getBadgeText({});
             if (badgeText === 'ERR') {
                 errorMessage.textContent = 'Warning: One or more rules may have failed to apply. Check background console.';
             }

        } catch (error) {
             console.error("Error loading rules:", error);
             errorMessage.textContent = 'Error loading rules from storage.';
        }
    }

    // --- Add Rule ---
    async function handleAddRule() {
        errorMessage.textContent = '';
        const domainPattern = domainPatternInput.value.trim(); // Keep empty if user leaves it empty
        const operation = operationSelect.value;
        const headerName = headerNameInput.value.trim();
        const headerValue = headerValueInput.value.trim();

        // --- Updated Validation ---
        // Domain pattern can be empty (means all URLs).
        // Check header name and value (value required unless removing).
        if (!headerName || (operation !== 'remove' && !headerValue)) {
             errorMessage.textContent = 'Please fill in Header Name, and Value (unless removing).';
            return;
        }
        // Removed the check: !domainPattern.includes('.') as it's not relevant for urlFilters
        // --- End Updated Validation ---


        const newRule = {
            id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            domainPattern: domainPattern, // Store the pattern as entered (or empty)
            operation: operation,
            headerName: headerName,
            headerValue: headerValue,
            enabled: true
        };

        try {
            const result = await chrome.storage.sync.get(['rules']);
            const rules = result.rules || [];
            rules.push(newRule);
            await chrome.storage.sync.set({ rules: rules });

            domainPatternInput.value = '';
            headerNameInput.value = '';
            headerValueInput.value = '';
            operationSelect.value = 'set';
            loadRulesFromStorage();
        } catch (error) {
             console.error("Error adding rule:", error);
             errorMessage.textContent = 'Error saving rule to storage.';
        }
    }

    // --- Delete Rule (no changes needed) ---
    async function handleDeleteRule(event) {
        const ruleIdToDelete = event.target.dataset.ruleId;
         errorMessage.textContent = '';

        if (!ruleIdToDelete) return;

        try {
            const result = await chrome.storage.sync.get(['rules']);
            let rules = result.rules || [];
            rules = rules.filter(rule => rule.id !== ruleIdToDelete);
            await chrome.storage.sync.set({ rules: rules });
            loadRulesFromStorage();
        } catch (error) {
            console.error("Error deleting rule:", error);
             errorMessage.textContent = 'Error deleting rule from storage.';
        }
    }

    // --- Initial Load and Event Listeners (no changes needed) ---
    addRuleButton.addEventListener('click', handleAddRule);
    loadRulesFromStorage();

    operationSelect.addEventListener('change', () => {
        headerValueInput.style.display = (operationSelect.value === 'remove') ? 'none' : 'block';
        if (operationSelect.value === 'remove') {
            headerValueInput.value = '';
        }
    });
    headerValueInput.style.display = (operationSelect.value === 'remove') ? 'none' : 'block';
});