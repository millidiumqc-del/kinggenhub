document.addEventListener('DOMContentLoaded', () => {
    const userNameEl = document.getElementById('user-name');
    const userAvatarEl = document.getElementById('user-avatar');
    const userStatusEl = document.getElementById('user-status');
    const manageKeysBtn = document.getElementById('manage-keys-btn');
    const mainContentEl = document.getElementById('main-content');
    const navLinks = document.querySelectorAll('.nav-link');
    const userProfileEl = document.getElementById('user-profile');
    const userDropdownEl = document.getElementById('user-dropdown');

    // --- Vérification de l'utilisateur et affichage des infos ---
    async function fetchUser() {
        try {
            const response = await fetch('/api/user/me');
            if (!response.ok) {
                // Si non autorisé, renvoie à la page de connexion
                window.location.href = '/index.html';
                return;
            }
            const user = await response.json();
            
            // Mettre à jour la topbar avec les infos de l'utilisateur
            userNameEl.textContent = user.username;
            if (user.avatar) {
                userAvatarEl.src = `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`;
            }
            userStatusEl.textContent = user.isPerm ? '(Perm)' : '(Free)';

            if (user.isAdmin) {
                manageKeysBtn.style.display = 'block';
            }

        } catch (error) {
            console.error('Error fetching user:', error);
            window.location.href = '/index.html';
        }
    }
    
    // --- Gestion de la navigation (Single Page Application) ---
    function navigate(hash) {
        // Mettre à jour la classe "active" sur les liens de navigation
        navLinks.forEach(link => {
            if (link.hash === hash) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Charger le contenu de la page
        mainContentEl.innerHTML = '<h1>Loading...</h1>'; // Afficher un message de chargement
        
        switch (hash) {
            case '#home':
                mainContentEl.innerHTML = `
                    <h1>Welcome to KeyHub</h1>
                    <p>This is the main page of your key system. You can find all the necessary information here.</p>
                `;
                break;
            case '#getkey':
                mainContentEl.innerHTML = `
                    <h1>Get Your Key</h1>
                    <p>This is where the key generation process will be.</p>
                    `;
                break;
            case '#suggestion':
                mainContentEl.innerHTML = `
                    <h1>Submit a Suggestion</h1>
                    <p>Have an idea? Let us know!</p>
                    `;
                break;
            default:
                mainContentEl.innerHTML = '<h1>Page Not Found</h1>';
        }
    }

    // --- Gestion des événements ---

    // Afficher/cacher le menu déroulant de l'utilisateur
    userProfileEl.addEventListener('click', () => {
        const isDisplayed = userDropdownEl.style.display === 'flex';
        userDropdownEl.style.display = isDisplayed ? 'none' : 'flex';
    });

    // Gérer les clics sur les liens de navigation
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.hash = link.hash;
        });
    });

    // Gérer le changement de hash dans l'URL (pour la navigation)
    window.addEventListener('hashchange', () => navigate(window.location.hash || '#home'));

    // --- Initialisation ---
    fetchUser();
    navigate(window.location.hash || '#home');
});
