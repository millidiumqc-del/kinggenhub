const express = require('express');
const serverless = require('serverless-http');
const fetch = require('node-fetch');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// --- CONFIGURATION ---
const app = express();
const router = express.Router();
app.use(cookieParser());
app.use('/api/', router);

// Configuration de la base de données Neon
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Constantes et secrets (à mettre dans les variables d'environnement Netlify)
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET; // Une phrase secrète longue et aléatoire
const GUILD_ID = process.env.GUILD_ID; // L'ID de ton serveur Discord
const REDIRECT_URI = process.env.REDIRECT_URI; // L'URL de ton site/.netlify/functions/callback

// Listes des IDs de rôles
const PERM_ROLE_IDS = [
    '869611811962511451', '1426871180282822757', '869611883836104734',
    '877989445725483009', '869612027897839666', '1421439929052954674',
    '1426774369711165501', '1422640196020867113', '877904473983447101'
];
const ADMIN_ROLE_IDS = ['869611811962511451', '877989445725483009'];

// --- ROUTES API ---

// Route 1: Redirection vers la page de connexion Discord
router.get('/auth/login', (req, res) => {
    const discordOAuthURL = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join%20guilds`;
    res.redirect(discordOAuthURL);
});

// Route 2: Déconnexion
router.get('/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});


// Route 3: Callback de Discord après la connexion
router.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('Error: Discord code not provided.');
    }

    try {
        // Échanger le code contre un access token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
            return res.status(400).send(`Discord Token Error: ${tokenData.error_description}`);
        }

        // Utiliser l'access token pour obtenir les infos de l'utilisateur
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        // Utiliser le BOT TOKEN pour vérifier si l'utilisateur est dans le serveur
        const guildMemberResponse = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${userData.id}`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        });

        if (!guildMemberResponse.ok) {
            // L'utilisateur n'est pas dans le serveur
            return res.status(403).send(`
                <html>
                    <body style="font-family: sans-serif; background-color: #36393f; color: white; text-align: center; padding-top: 50px;">
                        <h1>Access Denied</h1>
                        <p>You must be a member of our Discord server to access this site.</p>
                        <a href="https://discord.gg/d7DMck3NuA" style="color: #7289da;">Join Server</a>
                    </body>
                </html>
            `);
        }
        
        const memberData = await guildMemberResponse.json();
        const userRoles = memberData.roles || [];

        // Vérifier si l'utilisateur a un rôle Perm ou Admin
        const isPerm = userRoles.some(roleId => PERM_ROLE_IDS.includes(roleId));
        const isAdmin = userRoles.some(roleId => ADMIN_ROLE_IDS.includes(roleId));

        // Insérer ou mettre à jour l'utilisateur dans la base de données
        const client = await pool.connect();
        const userQuery = `
            INSERT INTO users (discord_id, username, avatar, is_perm, is_admin)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (discord_id) DO UPDATE SET
                username = EXCLUDED.username,
                avatar = EXCLUDED.avatar,
                is_perm = EXCLUDED.is_perm,
                is_admin = EXCLUDED.is_admin;
        `;
        await client.query(userQuery, [userData.id, userData.username, userData.avatar, isPerm, isAdmin]);
        client.release();

        // Créer un jeton de session (JWT)
        const token = jwt.sign(
            { discordId: userData.id, username: userData.username, avatar: userData.avatar, isPerm, isAdmin },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Envoyer le token dans un cookie et rediriger vers la page principale
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });
        res.redirect('/home.html'); // On créera cette page plus tard

    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send('An internal error occurred.');
    }
});

// Middleware pour protéger les routes
const protect = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: 'Not authorized, no token' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Not authorized, token failed' });
    }
};

// Route pour obtenir les infos de l'utilisateur connecté
router.get('/user/me', protect, (req, res) => {
    // req.user est rempli par le middleware 'protect'
    res.json(req.user);
});


// NOTE: Les routes pour la gestion des clés et la vérification
// seront ajoutées dans les prochaines parties pour ne pas surcharger.


module.exports.handler = serverless(app);
