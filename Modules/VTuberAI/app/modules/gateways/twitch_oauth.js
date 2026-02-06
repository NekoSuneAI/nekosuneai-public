import fs from "fs";
import crypto from "crypto";
import fetch from "node-fetch";
import config from "../../config/runtimeConfig.js";
import { TOKENS_DIR } from "../../utils/paths.js";

const TOKENS_FILE = `${TOKENS_DIR}/twitch_tokens.json`;

function saveTokens(data) {
    fs.mkdirSync(TOKENS_DIR, { recursive: true });
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2));
}

function loadTokens() {
    if (!fs.existsSync(TOKENS_FILE)) return null;
    return JSON.parse(fs.readFileSync(TOKENS_FILE));
}

/* -----------------------------------------------------------
   1. Build Twitch OAuth URL
----------------------------------------------------------- */
export function getTwitchAuthURL() {
    const state = crypto.randomUUID();
    const scope = encodeURIComponent(config.twitchchat.scopes);

    return `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${config.twitchchat.client_id}&redirect_uri=${config.twitchchat.redirect_uri}&scope=${scope}&state=${state}`;
}

/* -----------------------------------------------------------
   2. Exchange code for access + refresh tokens
----------------------------------------------------------- */
export async function exchangeTwitchCode(code) {
    const resp = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        body: new URLSearchParams({
            client_id: config.twitchchat.client_id,
            client_secret: config.twitchchat.client_secret,
            code,
            grant_type: "authorization_code",
            redirect_uri: config.twitchchat.redirect_uri
        }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const json = await resp.json();

    if (json.error) {
        console.error("[TWITCH] OAuth token error:", json);
        return null;
    }

    saveTokens({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_in: Date.now() + json.expires_in * 1000
    });

    return json.access_token;
}

/* -----------------------------------------------------------
   3. Validate token
----------------------------------------------------------- */
export async function validateToken(token) {
    try {
        const resp = await fetch("https://id.twitch.tv/oauth2/validate", {
            headers: { Authorization: `OAuth ${token}` }
        });

        if (!resp.ok) return null;

        return await resp.json();
    } catch {
        return null;
    }
}

/* -----------------------------------------------------------
   4. Refresh token
----------------------------------------------------------- */
export async function refreshTwitchToken() {
    const tokens = loadTokens();
    if (!tokens?.refresh_token) return null;

    const resp = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        body: new URLSearchParams({
            client_id: config.twitchchat.client_id,
            client_secret: config.twitchchat.client_secret,
            grant_type: "refresh_token",
            refresh_token: tokens.refresh_token
        }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const json = await resp.json();

    if (json.error) {
        console.error("[TWITCH] Token refresh failed:", json);
        return null;
    }

    saveTokens({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_in: Date.now() + json.expires_in * 1000
    });

    return json.access_token;
}

/* -----------------------------------------------------------
   5. Get valid token (auto refresh)
----------------------------------------------------------- */
export async function getValidTwitchToken() {
    const tokens = loadTokens();
    if (!tokens) return null;

    const valid = await validateToken(tokens.access_token);
    if (valid) return tokens.access_token;

    return await refreshTwitchToken();
}
