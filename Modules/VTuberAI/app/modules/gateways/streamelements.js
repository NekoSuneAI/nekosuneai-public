import WebSocket from "ws";
import crypto from "crypto";
import config from "../../config/runtimeConfig.js";
import { addToQueue } from "../../index.js";

import {
    convertToGBP,
    parseDonationEvent,
    GBP_THRESHOLD
} from "../utils/donations.js";

function cleanCheerMessage(msg) {
    if (!msg) return "";

    return msg
        .replace(/Cheer\d+/gi, "")  // remove Cheer<number>
        .replace(/\s+/g, " ")       // remove extra spaces
        .trim();
}

export function initStreamElements() {
    if (!config.streamElements || !Array.isArray(config.streamElements) || config.streamElements.length === 0) {
        console.log("[SE] No StreamElements channels configured.");
        return;
    }

    const topics = [
        "channel.activities",
        "channel.chat.message"
    ];

    config.streamElements.forEach(channel => {
        if (!channel.token || !channel.room) return;

        let ws = null;
        let reconnectDelay = 2000;
        const maxDelay = 30000;
        let heartbeat = null;
        const giftBatchTracker = new Map();

        function connect() {
            console.log(`[SE] Connecting to channel ${channel.accountId || channel.room}...`);
            ws = new WebSocket("wss://astro.streamelements.com");

            ws.on("open", () => {
                console.log(`[SE] Connected to [${channel.platform}] ${channel.accountId || channel.room}`);
                reconnectDelay = 2000;

                // Subscribe to topics
                topics.forEach(topic => {
                    ws.send(JSON.stringify({
                        type: "subscribe",
                        nonce: crypto.randomUUID(),
                        data: {
                            topic,
                            room: channel.room,
                            token: channel.token,
                            token_type: "jwt"
                        }
                    }));
                });
                console.log(`[SE] [${channel.platform}] Subscribed to topics: ${topics.join(", ")}`);

                // heartbeat
                heartbeat = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) ws.ping();
                }, 30000);
            });

            ws.on("message", async (raw) => {
                let msg;
                try { msg = JSON.parse(raw.toString()); } catch { return; }

                // Ignore messages without proper structure
                if (msg.type !== "message" || !msg.data || !msg.data.type) return;

                const eventType = msg.data.type;

                // ---------------- TIP (DONATION) ----------------
                if (eventType === "tip") {
                    const parsed = parseDonationEvent(msg.data, "streamelements");
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

                if (msg.data.provider == "twitch") {

                    // ---------------- Follow ----------------
                    if (eventType === "follow") {
                        const follow = msg.data.data;
                        addToQueue(
                            follow.displayName,
                            `${follow.displayName} just followed you on Twitch!`
                        );
                        return;
                    }

                    // ---------------- CHEER (BITS) ----------------
                    if (eventType === "cheer") {
                        const cheer = msg.data.data;
                        //if (!cheer || cheer.amount < 100) return;

                        const message = cleanCheerMessage(cheer.message || "");
                        addToQueue(
                            cheer.displayName,
                            `${cheer.displayName} just Sent Twitch Bits: ${cheer.amount} bits with message — ${message}`
                        );
                        return;
                    }

                    // ---------------- SUBSCRIBERS ----------------
                    if (eventType === "subscriber") {
                        const subs = msg.data.data;
                        if (!subs) return;

                        const group = msg.data.activityGroup;
                        const sender = subs.sender || subs.displayName;
                        const username = subs.displayName;

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
                            subs.displayName,
                            `${subs.displayName} just subscribed for ${subs.amount} Month(s)! — ${message}`
                        );
                        return;
                    }
                } else if (msg.data.provider == "youtube") {
                    // ---------------- SUBSCRIBERS ----------------
                    if (eventType === "subscriber") {
                        const subs = msg.data.data;
                        if (!subs) return;

                        // NORMAL SUB
                        addToQueue(
                            subs.displayName,
                            `${subs.displayName} just subscribed you on YouTube`
                        );
                        return;
                    }

                    // ---------------- SUPERCHAT ----------------
                    if (eventType === "superchat") {
                        const subs = msg.data.data;
                        if (!subs) return;

                        // NORMAL SUB
                        addToQueue(
                            subs.displayName,
                            `${subs.displayName} just Super chat you on YouTube for ${subs.amount}! — ${message}`
                        );
                        return;
                    }

                    // ---------------- YOUTUBE SPONSOR / COMMUNITY GIFT ----------------
                    if (eventType === "communityGiftPurchase" || eventType === "sponsor") {
                        const sponsor = msg.data.data;
                        if (!sponsor) return;

                        // use activityId as batch key if activityGroup is missing
                        const batchKey = msg.data.activityGroup || msg.data.activityId || `${sponsor.username}-${msg.ts}`;
                        const sender = sponsor.username || sponsor.displayName;
                        const username = sponsor.displayName;

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
                            sponsor.displayName,
                            `${sponsor.displayName} just became a YouTube member! 🎉 — ${message}`
                        );
                        return;
                    }
                } else if (msg.data.provider == "kick") {

                    // ---------------- Follow ----------------
                    if (eventType === "follow") {
                        const follow = msg.data.data;
                        addToQueue(
                            follow.displayName,
                            `${follow.displayName} just followed you on Kick!`
                        );
                        return;
                    }

                    // ---------------- SUBSCRIBERS ----------------
                    if (eventType === "subscriber") {
                        const subs = msg.data.data;
                        if (!subs) return;

                        const group = msg.data.activityGroup;
                        const sender = subs.sender || subs.displayName;
                        const username = subs.displayName;

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
                                        `${batch.sender} just gifted ${batch.total} Kick subscriptions to the viewer chat! 🎁❤️\nGifted to: ${namesList}`
                                    );

                                    giftBatchTracker.delete(group);
                                }, 2500)
                            });
                            return; // skip individual logging
                        }

                        // NORMAL SUB
                        const message = cleanCheerMessage(subs.message || "");
                        addToQueue(
                            subs.displayName,
                            `${subs.displayName} just subscribed for ${subs.amount} Month(s)! — ${message}`
                        );
                        return;
                    }
                } else if (msg.data.provider == "trovo") {

                    // ---------------- Follow ----------------
                    if (eventType === "follow") {
                        const follow = msg.data.data;
                        addToQueue(
                            follow.displayName,
                            `${follow.displayName} just followed you on Trovo!`
                        );
                        return;
                    }

                    // ---------------- SUBSCRIBERS ----------------
                    if (eventType === "subscriber") {
                        const subs = msg.data.data;
                        if (!subs) return;

                        const group = msg.data.activityGroup;
                        const sender = subs.sender || subs.displayName;
                        const username = subs.displayName;

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
                                        `${batch.sender} just gifted ${batch.total} Trovo subscriptions to the viewer chat! 🎁❤️\nGifted to: ${namesList}`
                                    );

                                    giftBatchTracker.delete(group);
                                }, 2500)
                            });
                            return; // skip individual logging
                        }

                        // NORMAL SUB
                        const message = cleanCheerMessage(subs.message || "");
                        addToQueue(
                            subs.displayName,
                            `${subs.displayName} just subscribed for ${subs.amount} Month(s)! — ${message}`
                        );
                        return;
                    }

                    // ---------------- Elixir (elixir) ----------------
                    if (eventType === "elixir") {
                        const cheer = msg.data.data;

                        const message = cleanCheerMessage(cheer.message || "");
                        addToQueue(
                            cheer.displayName,
                            `${cheer.displayName} just Sent Trovo elixir: ${cheer.amount} elixir with message — ${message}`
                        );
                        return;
                    }
                }
            });

            ws.on("error", (err) => console.error(`[SE ${channel.accountId || channel.room}] Error:`, err?.message || err));
            ws.on("close", () => {
                console.log(`[SE ${channel.accountId || channel.room}] Closed. Reconnecting...`);
                if (heartbeat) clearInterval(heartbeat);

                setTimeout(connect, reconnectDelay);
                reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
            });
        }

        connect();
    });
}
