// index.js
import express from "express";
import {
    getStreamlabsAuthorizeURL,
    exchangeCodeForToken
} from "../gateways/streamlabs.js";

const router = express.Router();

// --------------------------------------------------
// 1. REDIRECT USER TO STREAMLABS LOGIN
// --------------------------------------------------
router.get("/auth", (req, res) => {
    return res.redirect(getStreamlabsAuthorizeURL());
});

// --------------------------------------------------
// 2. STREAMLABS CALLBACK
// --------------------------------------------------
router.get("/callback", async (req, res) => {
    const code = req.query.code;

    if (!code) return res.status(400).send("Missing code.");

    const access = await exchangeCodeForToken(code);

    if (!access) return res.status(500).send("Streamlabs auth failed.");

    return res.send(`<h2>Streamlabs connected!</h2>`);
});

export default router;
