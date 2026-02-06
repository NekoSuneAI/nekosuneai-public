import express from "express";
import {
    getTwitchAuthURL,
    exchangeTwitchCode
} from "../gateways/twitch_oauth.js";

const router = express.Router();

/* --------------------------------------------------
   1. Redirect user to Twitch OAuth
-------------------------------------------------- */
router.get("/auth", (req, res) => {
    return res.redirect(getTwitchAuthURL());
});

/* --------------------------------------------------
   2. Twitch Callback → Exchange code for token
-------------------------------------------------- */
router.get("/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing ?code");

    const token = await exchangeTwitchCode(code);

    if (!token)
        return res.status(500).send("Twitch authentication failed.");

    return res.send("<h2>Twitch Connected! ✔</h2>");
});

export default router;
