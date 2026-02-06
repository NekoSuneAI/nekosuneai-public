import axios from "axios";

export const GBP_THRESHOLD = 3.0;

// Convert any currency to GBP using exchangerate.host
export async function convertToGBP(amount, currency) {
    try {
        const url = `https://api.exchangerate.host/convert?from=${encodeURIComponent(currency)}&to=GBP&amount=${encodeURIComponent(amount)}`;
        const res = await axios.get(url, { timeout: 5000 });

        if (res.data && typeof res.data.result === "number") {
            return Number(res.data.result);
        }
    } catch (err) {
        console.error("Currency conversion error:", err?.message || err);
    }
    return null;
}

// Normalize donation across SE + SL
export function parseDonationEvent(event, platform) {
    let username = "Anonymous";
    let amount = 0;
    let currency = "GBP";
    let message = "";

    if (!event) return null;

    // StreamElements Astro
    if (platform == "streamelements") {
        return {
            username: event.data.username || username,
            amount: parseFloat(event.data.amount || 0),
            currency: event.data.currency || currency,
            message: event.data.message || "",
        };
    } else if (platform == "streamlabs") {
        const msg = event;
        return {
            username: msg.name || msg.displayName || username,
            amount: parseFloat(msg.amount || msg.formatted_amount?.replace(/[^\d\.]/g, '') || 0),
            currency: msg.currency || currency,
            message: msg.message || "",
        };
    } else {
        return {
            username: event.username || event.user || username,
            amount: parseFloat(event.amount || 0),
            currency: event.currency || currency,
            message: event.message || "",
        };
    }

    return null;
}
