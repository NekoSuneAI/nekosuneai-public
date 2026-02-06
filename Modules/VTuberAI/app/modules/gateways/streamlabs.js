import { io } from "socket.io-client";
import fetch from "node-fetch";
import fs from "fs";
import crypto from "crypto";
import config from "../../config/runtimeConfig.js";
import { TOKENS_DIR } from "../../utils/paths.js";
import { addToQueue } from "../../index.js";

import {
    convertToGBP,
    parseDonationEvent,
    GBP_THRESHOLD
} from "../utils/donations.js";

/* ============================================================
   TOKEN STORAGE
============================================================ */

const TOKENS_FILE = `${TOKENS_DIR}/streamlabs_tokens.json`;

function saveTokens(data) {
    fs.mkdirSync(TOKENS_DIR, { recursive: true });
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2));
}

function loadTokens() {
    if (!fs.existsSync(TOKENS_FILE)) return null;
    return JSON.parse(fs.readFileSync(TOKENS_FILE));
}

/* ============================================================
   1. BUILD /AUTHORIZE URL
============================================================ */

export function getStreamlabsAuthorizeURL() {
    const clientId = config.streamlabs.client_id;
    const redirect = config.streamlabs.redirect_uri;
    const scope = encodeURIComponent("donations.read socket.token alerts.write legacy.token");

    const state = crypto.randomUUID();

    return `https://streamlabs.com/api/v2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirect}&scope=${scope}&state=${state}`;
}

/* ============================================================
   2. HANDLE /callback → EXCHANGE CODE FOR TOKEN
============================================================ */

export async function exchangeCodeForToken(code) {
    const clientId = config.streamlabs.client_id;
    const clientSecret = config.streamlabs.client_secret;
    const redirect = config.streamlabs.redirect_uri;

    const resp = await fetch("https://streamlabs.com/api/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirect,
            code
        })
    });

    const json = await resp.json();

    if (json.error) {
        console.error("[Streamlabs] Token exchange error:", json);
        return null;
    }

    saveTokens({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: Date.now() + json.expires_in * 1000
    });

    console.log("[Streamlabs] OAuth tokens saved.");
    return json.access_token;
}

/* ============================================================
   3. REFRESH ACCESS TOKEN
============================================================ */

export async function refreshToken() {
    const tokens = loadTokens();
    if (!tokens?.refresh_token) return null;

    const clientId = config.streamlabs.client_id;
    const clientSecret = config.streamlabs.client_secret;
    const redirect = config.streamlabs.redirect_uri;

    const resp = await fetch("https://streamlabs.com/api/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirect,
            refresh_token: tokens.refresh_token
        })
    });

    const json = await resp.json();

    if (json.error) {
        console.error("[Streamlabs] Token refresh failed:", json);
        return null;
    }

    saveTokens({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: Date.now() + json.expires_in * 1000
    });

    console.log("[Streamlabs] Access token refreshed.");
    return json.access_token;
}

/* ============================================================
   4. GET VALID ACCESS TOKEN
============================================================ */

export async function getValidAccessToken() {
    const tokens = loadTokens();
    if (!tokens) return null;

    // Not expired yet?
    if (Date.now() < tokens.expires_at) {
        return tokens.access_token;
    }

    // Expired → refresh
    return await refreshToken();
}

/* ============================================================
   5. GET SOCKET TOKEN
============================================================ */

async function getSocketToken() {
    const access = await getValidAccessToken();
    if (!access) {
        console.error("[SL] No valid access token.");
        return null;
    }

    try {
        const resp = await fetch("https://streamlabs.com/api/v2.0/socket/token", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${access}`,
                "Accept": "application/json",
            }
        });

        if (!resp.ok) {
            console.error("[SL] Failed socket token:", resp.status, await resp.text());
            return null;
        }

        const json = await resp.json();
        return json.socket_token || json.token || null;

    } catch (err) {
        console.error("[SL] Socket token error:", err);
        return null;
    }
}

/* ============================================================
   6. MAIN SOCKET CONNECTOR
============================================================ */

export async function initStreamLabs() {
    console.log("[SL] Initializing Streamlabs…");

    let ws = null;
    let reconnectDelay = 2000;
    const maxDelay = 30000;
    let reconnectTimer = null;
    let heartbeatTimer = null;

    async function connectStreamlabs() {
        const socketToken = await getSocketToken();

        if (!socketToken) {
            console.log("[SL] No socket token — retrying...");
            scheduleReconnect();
            return;
        }

        console.log("[SL] Connecting to Streamlabs…");

        // Cleanup old
        if (ws && ws.disconnect) ws.disconnect();

        ws = io("https://sockets.streamlabs.com", {
            transports: ["websocket"],
            query: { token: socketToken }
        });

        ws.on("connect", () => {
            console.log("[SL] Connected to Streamlabs WebSocket");

            reconnectDelay = 2000; // reset backoff

            resetHeartbeat();
        });

        ws.on("event", async (eventData) => {
            resetHeartbeat();

            console.log(eventData)
            const eventType = eventData.type;

            // ---------------- TIP (DONATION) ----------------
            if (eventType === "donation") {
                const parsed = parseDonationEvent(eventData.message[0], "streamlabs");
                if (!parsed) return;

                let gbp;
                if (parsed.currency === "GBP") gbp = parsed.amount;
                else gbp = await convertToGBP(parsed.amount, parsed.currency);
                if (gbp === null) return;

                console.log(`[SE] £${gbp.toFixed(2)} from ${parsed.username}`);
                /*if (gbp >= GBP_THRESHOLD) {*/
                    addToQueue(parsed.username, `${parsed.username} just Donate: £${gbp.toFixed(2)} with message — ${parsed.message}`);
                /*}*/
                return;
            }

            if (eventData.for == "twitch_account") {

                // ---------------- CHEER (BITS) ----------------
                if (eventType === "bits") {
                    const cheer = eventData.message[0];
                    //if (!cheer || cheer.amount < 100) return;

                    const message = cleanCheerMessage(cheer.message || "");
                    addToQueue(
                        cheer.name,
                        `${cheer.name} just Sent Twitch Bits: ${cheer.amount} bits with message — ${message}`
                    );
                    return;
                }

                // ---------------- SUBSCRIBERS ----------------
                /*if (eventType === "subscription") {
                    const subs = eventData.message[0];
                    if (!subs) return;

                    const group = msg.data.activityGroup;
                    const sender = subs.sender || subs.displayName;
                    const username = subs.name;

                    // COMMUNITY GIFT BATCH
                    if (subs.gifted && group) {
                        if (giftBatchTracker.has(group)) {
                            const batch = giftBatchTracker.get(group);
                            batch.total += 1;
                            batch.names.push(username);
                            giftBatchTracker.set(group, batch);
                            return;
                        }

                        giftBatchTracker.set(group, {
                            sender,
                            total: 1,
                            names: [username],
                            timeout: setTimeout(() => {
                                const batch = giftBatchTracker.get(group);
                                if (!batch) return;

                                const namesList = batch.names.join(", ");
                                addToQueue(
                                    batch.sender,
                                    `${batch.sender} just gifted ${batch.total} Twitch subscriptions to the viewer chat! 🎁❤️\nGifted to: ${namesList}`
                                );

                                giftBatchTracker.delete(group);
                            }, 2500)
                        });
                        return; // skip individual logging
                    }

                    // NORMAL SUB
                    const message = cleanCheerMessage(subs.message || "");
                    addToQueue(
                        subs.name,
                        `${subs.name} just subscribed for ${subs.months} Month(s)! — ${message}`
                    );
                    return;
                }*/
            } else if (eventData.for == "youtube_account") {
                // ---------------- SUBSCRIBERS ----------------
                if (eventType === "follow") {
                    const subs = eventData.message[0];
                    if (!subs) return;

                    // NORMAL SUB
                    addToQueue(
                        subs.name,
                        `${subs.name} just subscribed you on YouTube`
                    );
                    return;
                }

                // ---------------- SUPERCHAT ----------------
                if (eventType === "superchat") {
                    const subs = eventData.message[0];
                    if (!subs) return;

                    // NORMAL SUB
                    addToQueue(
                        subs.name,
                        `${subs.name} just Super chat you on YouTube for ${subs.displayString}! — ${subs.comment}`
                    );
                    return;
                }

                // ---------------- YOUTUBE SPONSOR / COMMUNITY GIFT ----------------
                /*if (eventType === "membershipGift" || eventType === "subscription") {
                    const sponsor = eventData.message[0];
                    if (!sponsor) return;

                    // use activityId as batch key if activityGroup is missing
                    const batchKey = `${sponsor.name}-${msg.ts}`;
                    const sender = sponsor.username || sponsor.name;
                    const username = sponsor.name;

                    // COMMUNITY GIFT BATCH
                    if (sponsor.gifted) {
                        if (giftBatchTracker.has(batchKey)) {
                            const batch = giftBatchTracker.get(batchKey);
                            batch.total += 1;
                            batch.names.push(username);
                            giftBatchTracker.set(batchKey, batch);
                            return;
                        }

                        // start new batch
                        giftBatchTracker.set(batchKey, {
                            sender,
                            total: 1,
                            names: [username],
                            timeout: setTimeout(() => {
                                const batch = giftBatchTracker.get(batchKey);
                                if (!batch) return;

                                const namesList = batch.names.join(", ");
                                addToQueue(
                                    batch.sender,
                                    `${batch.sender} just gifted ${batch.total} YouTube memberships to the viewer chat! 🎁❤️\nGifted to: ${namesList}`
                                );

                                giftBatchTracker.delete(batchKey);
                            }, 2500)
                        });

                        return; // skip individual logging
                    }

                    // NORMAL SPONSOR / MEMBER
                    const message = cleanCheerMessage(sponsor.message || "");
                    addToQueue(
                        sponsor.name,
                        `${sponsor.name} just became a YouTube member! 🎉 — ${message}`
                    );
                    return;
                }*/
            }
        });

        ws.on("ping", () => resetHeartbeat());
        ws.on("pong", () => resetHeartbeat());

        ws.on("connect_error", async (err) => {
            console.error("[SL] Connect error:", err?.message);

            if (isTokenExpired(err)) {
                console.log("[SL] Token expired — refreshing…");
                await refreshStreamlabsToken();
            }

            scheduleReconnect();
        });

        ws.on("disconnect", async (reason) => {
            console.warn("[SL] Disconnected:", reason);

            if (isTokenExpired(reason)) {
                console.log("[SL] Token expired — refreshing…");
                await refreshStreamlabsToken();
            }

            scheduleReconnect();
        });
    }

    function isTokenExpired(err) {
        if (!err) return false;
        const msg = err.message ?? err.toString();
        return msg.includes("authentication") ||
            msg.includes("unauthorized") ||
            msg.includes("invalid token") ||
            msg.includes("token");
    }

    async function refreshStreamlabsToken() {
        try {
            await getNewStreamlabsAccessToken(); // <— your function to refresh OAuth2 token
            console.log("[SL] New token obtained.");
        } catch (err) {
            console.error("[SL] Token refresh failed:", err);
        }
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;

        console.log(`[SL] Reconnecting in ${(reconnectDelay / 1000).toFixed(1)}s…`);

        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connectStreamlabs();
        }, reconnectDelay);

        reconnectDelay = Math.min(reconnectDelay * 1.5, maxDelay);
    }

    function resetHeartbeat() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);

        // If no events come in for 40 seconds assume socket died silently
        heartbeatTimer = setTimeout(() => {
            console.warn("[SL] Heartbeat timeout — reconnecting…");
            scheduleReconnect();
        }, 40000);
    }

    // FINAL CALL
    connectStreamlabs();
}

