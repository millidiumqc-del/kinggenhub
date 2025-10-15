const express = require('express');
const serverless = require('serverless-http');
const fetch = require('node-fetch');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const router = express.Router();
app.use(cookieParser());
app.use(express.json());
app.use('/api/', router);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, JWT_SECRET, GUILD_ID, BOT_TOKEN, REDIRECT_URI, SUGGESTION_WEBHOOK_URL, LINKVERTISE_API_TOKEN } = process.env;
const PERM_ROLE_IDS = ['869611811962511451', '1426871180282822757', '869611883836104734', '877989445725483009', '869612027897839666', '1421439929052954674', '1426774369711165501', '1422640196020867113', '877904473983447101'];
const ADMIN_ROLE_IDS = ['869611811962511451', '877989445725483009'];

const generateKey = (length = 16) => crypto.randomBytes(length).toString('hex');

const protect = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Not authorized, no token' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Not authorized, token failed' });
    }
};

router.get('/auth/login', (req, res) => {
    const discordOAuthURL = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(discordOAuthURL);
});

router.get('/auth/logout', (req, res) => {
    res.clearCookie('token', { path: '/' });
    res.redirect('/');
});

router.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('Error: Discord code not provided.');
    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const tokenData = await tokenResponse.json();
        if (tokenData.error) return res.status(400).send(`Discord Token Error: ${tokenData.error_description}`);
        const userResponse = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` } });
        const userData = await userResponse.json();
        const guildMemberResponse = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${userData.id}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });

        if (!guildMemberResponse.ok) {
            return res.status(403).send(`<html><body style="font-family: sans-serif; background-color: #36393f; color: white; text-align: center; padding-top: 50px;"><h1>Access Denied</h1><p>You must be a member of our Discord server to access this site.</p><a href="https://discord.gg/d7DMck3NuA" style="color: #7289da;">Join Server</a></body></html>`);
        }
        
        const memberData = await guildMemberResponse.json();
        const userRoles = memberData.roles || [];
        const isPerm = userRoles.some(roleId => PERM_ROLE_IDS.includes(roleId));
        const isAdmin = userRoles.some(roleId => ADMIN_ROLE_IDS.includes(roleId));

        const client = await pool.connect();
        await client.query(`INSERT INTO users (discord_id, username, avatar, is_perm, is_admin) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (discord_id) DO UPDATE SET username = EXCLUDED.username, avatar = EXCLUDED.avatar, is_perm = EXCLUDED.is_perm, is_admin = EXCLUDED.is_admin;`, [userData.id, userData.username, userData.avatar, isPerm, isAdmin]);
        client.release();

        const token = jwt.sign({ discordId: userData.id, username: userData.username, avatar: userData.avatar, isPerm, isAdmin }, JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 24 * 60 * 60 * 1000 });
        res.redirect('/home.html');
    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send('An internal error occurred.');
    }
});

router.get('/user/me', protect, (req, res) => res.json(req.user));

router.post('/key/get', protect, async (req, res) => {
    const { discordId, isPerm } = req.user;
    const client = await pool.connect();
    try {
        if (isPerm) {
            let { rows } = await client.query('SELECT * FROM keys WHERE owner_discord_id = $1 AND is_permanent = TRUE', [discordId]);
            if (rows.length > 0) return res.json({ key: rows[0].key_value, type: 'perm' });
            const newKey = `KeyHub-Perm-${generateKey(8)}`;
            await client.query('INSERT INTO keys (key_value, owner_discord_id, is_permanent) VALUES ($1, $2, TRUE)', [newKey, discordId]);
            return res.json({ key: newKey, type: 'perm' });
        } else {
            const linkvertiseUrl = `https://link-hub.net/1409420/j5AokQm937Cf?user_id=${discordId}`;
            return res.json({ linkvertiseUrl: linkvertiseUrl, type: 'free' });
        }
    } catch (error) {
        console.error("Get key error:", error);
        res.status(500).json({ error: 'Failed to process key request' });
    } finally {
        client.release();
    }
});

router.post('/key/claim-free-key', protect, async (req, res) => {
    const { discordId, isPerm } = req.user;
    if (isPerm) return res.status(400).json({ error: 'Permanent users do not need to claim keys.' });
    const client = await pool.connect();
    try {
        let { rows } = await client.query("SELECT * FROM keys WHERE owner_discord_id = $1 AND is_permanent = FALSE AND expires_at > NOW()", [discordId]);
        if (rows.length > 0) return res.json({ key: rows[0].key_value, message: 'You already have a valid key.' });

        const verificationUrl = `https://publisher.linkvertise.com/api/v1/user-tracking/status?token=${LINKVERTISE_API_TOKEN}&user_id=${discordId}`;
        const lvResponse = await fetch(verificationUrl);
        const lvData = await lvResponse.json();

        if (!lvData.data?.completed) return res.status(403).json({ error: 'Linkvertise task not completed. Please try again.' });

        await client.query("DELETE FROM keys WHERE owner_discord_id = $1 AND is_permanent = FALSE", [discordId]);
        const newKey = `KeyHub-Free-${generateKey(12)}`;
        const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await client.query('INSERT INTO keys (key_value, owner_discord_id, is_permanent, expires_at) VALUES ($1, $2, FALSE, $3)', [newKey, discordId, expires_at]);
        
        return res.json({ key: newKey, message: 'Key successfully generated!' });
    } catch (error) {
        console.error("Claim key error:", error);
        res.status(500).json({ error: 'Failed to claim key.' });
    } finally {
        client.release();
    }
});

router.post('/verify', async (req, res) => {
    const { key, robloxId } = req.body;
    if (!key || !robloxId) return res.status(400).json({ status: "error", message: "Invalid request" });
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT * FROM keys WHERE key_value = $1', [key]);
        if (rows.length === 0) return res.status(404).json({ status: "error", message: "Invalid Key" });
        const keyData = rows[0];
        if (!keyData.is_permanent && new Date(keyData.expires_at) < new Date()) return res.status(403).json({ status: "error", message: "Key Expired" });
        if (keyData.roblox_user_id && keyData.roblox_user_id !== robloxId.toString()) return res.status(403).json({ status: "error", message: "Key linked to another user" });
        if (!keyData.roblox_user_id) await client.query('UPDATE keys SET roblox_user_id = $1 WHERE key_value = $2', [robloxId, key]);
        const scriptContent = `print("KeyHub: Successfully Authenticated! Welcome, User ID: ${robloxId}")`; // Remplace par ton vrai script
        res.json({ status: "success", script: scriptContent });
    } catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    } finally {
        client.release();
    }
});

module.exports.handler = serverless(app);
