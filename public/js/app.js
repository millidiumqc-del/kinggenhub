document.addEventListener('DOMContentLoaded', () => {
    const userNameEl = document.getElementById('user-name');
    const userAvatarEl = document.getElementById('user-avatar');
    const userStatusEl = document.getElementById('user-status');
    const manageKeysBtn = document.getElementById('manage-keys-btn');
    const mainContentEl = document.getElementById('main-content');
    const userProfileEl = document.getElementById('user-profile');
    const userDropdownEl = document.getElementById('user-dropdown');
    let currentUser = null;

    async function fetchUser() {
        try {
            const response = await fetch('/api/user/me');
            if (!response.ok) {
                window.location.href = '/index.html';
                return null;
            }
            const user = await response.json();
            currentUser = user;
            
            userNameEl.textContent = user.username;
            if (user.avatar) {
                userAvatarEl.src = `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`;
            }
            userStatusEl.textContent = user.isPerm ? '(Perm)' : '(Free)';

            if (user.isAdmin && !document.querySelector('a[href="#managekeys"]')) {
                manageKeysBtn.style.display = 'block';
                const adminNavLink = document.createElement('a');
                adminNavLink.href = '#managekeys';
                adminNavLink.className = 'nav-link';
                adminNavLink.textContent = 'Manage Keys';
                document.querySelector('nav').appendChild(adminNavLink);
            }
            return user;
        } catch (error) {
            console.error('Error fetching user:', error);
            window.location.href = '/index.html';
            return null;
        }
    }
    
    async function navigate(hash) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.hash === hash);
        });

        mainContentEl.innerHTML = '<h1>Loading...</h1>';
        
        switch (hash) {
            case '#home':
                mainContentEl.innerHTML = `<h1>Welcome, ${currentUser.username}!</h1><p>This is the main page of your key system. Select an option from the navigation bar to begin.</p>`;
                break;
            case '#getkey':
                await renderGetKeyPage();
                break;
            case '#suggestion':
                renderSuggestionPage();
                break;
            case '#managekeys':
                if(currentUser && currentUser.isAdmin) await renderManageKeysPage();
                else mainContentEl.innerHTML = '<h1>Access Denied</h1>';
                break;
            default:
                mainContentEl.innerHTML = `<h1>Welcome, ${currentUser.username}!</h1><p>This is the main page of your key system. Select an option from the navigation bar to begin.</p>`;
        }
    }
    
    async function renderGetKeyPage() {
        let keyInfoHtml, buttonText;
        if (currentUser.isPerm) {
            keyInfoHtml = `<p>As a permanent user, you have one key linked to your account for life.</p>
             <button id="reset-key-btn" class="btn btn-primary">Reset Roblox User ID (1 week cooldown)</button>`;
            buttonText = "Get/View My Key";
        } else {
            keyInfoHtml = `<p>As a free user, you need to complete a task to get a key that lasts for 24 hours.</p>`;
            buttonText = "Start Task to Get Key";
        }

        mainContentEl.innerHTML = `
            <h1>Get Your Key</h1>
            ${keyInfoHtml}
            <button id="get-key-btn" class="btn btn-primary" style="margin-top: 10px;">${buttonText}</button>
            <div id="key-display-box" style="display:none; margin-top: 20px; background-color: var(--background-tertiary); padding: 15px; border-radius: var(--border-radius);">
                <p>Your Key:</p>
                <input type="text" id="key-output" readonly style="width: 100%; background-color: var(--background-primary); border: none; color: white; padding: 10px; border-radius: 5px; text-align: center; font-size: 1.1em;">
                <button id="copy-key-btn" class="btn" style="margin-top: 10px;">Copy</button>
            </div>
            <p id="key-message" style="margin-top: 10px;"></p>
        `;
        
        document.getElementById('get-key-btn').addEventListener('click', async () => {
            const messageEl = document.getElementById('key-message');
            messageEl.textContent = 'Processing...';
            const response = await fetch('/api/key/get', { method: 'POST' });
            const data = await response.json();

            if (data.key) {
                document.getElementById('key-display-box').style.display = 'block';
                document.getElementById('key-output').value = data.key;
                messageEl.textContent = 'Key retrieved successfully!';
            } else if (data.linkvertiseUrl) {
                messageEl.textContent = 'Redirecting to task...';
                window.location.href = data.linkvertiseUrl;
            } else {
                messageEl.textContent = data.error || 'An unknown error occurred.';
            }
        });

        document.getElementById('copy-key-btn')?.addEventListener('click', () => {
            const keyOutput = document.getElementById('key-output');
            keyOutput.select();
            document.execCommand('copy');
            document.getElementById('key-message').textContent = 'Key copied to clipboard!';
        });

        document.getElementById('reset-key-btn')?.addEventListener('click', async () => {
             const messageEl = document.getElementById('key-message');
                messageEl.textContent = 'Resetting...';
                const response = await fetch('/api/key/reset', { method: 'POST' });
                const data = await response.json();
                messageEl.textContent = data.error || data.message;
        });
        
        // Vérifier si l'utilisateur revient de Linkvertise
        const currentUrl = new URL(window.location.href);
        const hash = currentUrl.hash;
        if (hash.startsWith('#getkey?from=linkvertise')) {
            claimFreeKey();
        }
    }

    async function claimFreeKey() {
        const messageEl = document.getElementById('key-message');
        if (!messageEl) return;

        messageEl.textContent = 'Verifying task completion, please wait...';
        const response = await fetch('/api/key/claim-free-key', { method: 'POST' });
        const data = await response.json();

        if (data.key) {
            document.getElementById('key-display-box').style.display = 'block';
            document.getElementById('key-output').value = data.key;
            messageEl.textContent = data.message || 'Key claimed successfully!';
        } else {
            messageEl.textContent = `Error: ${data.error}`;
        }
        history.pushState(null, '', window.location.pathname + '#getkey');
    }

    function renderSuggestionPage() {
        mainContentEl.innerHTML = `
            <h1>Submit a Suggestion</h1>
            <textarea id="suggestion-text" placeholder="Type your suggestion here (min 10 characters)..." style="width: 100%; height: 150px; background-color: var(--background-secondary); border: 1px solid var(--background-tertiary); color: white; padding: 10px; border-radius: 5px;"></textarea>
            <button id="submit-suggestion-btn" class="btn btn-primary" style="margin-top: 10px;">Submit</button>
            <p id="suggestion-message" style="margin-top: 10px;"></p>
        `;
        document.getElementById('submit-suggestion-btn').addEventListener('click', async () => {
            const text = document.getElementById('suggestion-text').value;
            const messageEl = document.getElementById('suggestion-message');
            messageEl.textContent = 'Submitting...';
            const response = await fetch('/api/suggestion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suggestion: text })
            });
            const data = await response.json();
            if (response.ok) {
                messageEl.textContent = 'Suggestion submitted successfully!';
                document.getElementById('suggestion-text').value = '';
            } else {
                messageEl.textContent = `Error: ${data.error}`;
            }
        });
    }
    
    async function renderManageKeysPage() {
        mainContentEl.innerHTML = `<h1>Key Management</h1><p>This feature is not yet fully implemented in the frontend.</p>`;
    }

    userProfileEl.addEventListener('click', () => {
        userDropdownEl.style.display = userDropdownEl.style.display === 'flex' ? 'none' : 'flex';
    });

    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.split('?')[0];
        navigate(hash || '#home');
    });

    (async () => {
        if (await fetchUser()) {
            const hash = window.location.hash.split('?')[0];
            navigate(hash || '#home');
        }
    })();
});
