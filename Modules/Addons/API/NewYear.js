const { timezone } = require("../../config");
const { getNewYearCountdown } = require("@nekosuneprojects/newyear-tz-countdown");

const defaultTimeZonesByName = {
  "united states": "America/New_York",
  "canada": "America/Toronto",
  "russian federation": "Europe/Moscow",
  "australia": "Australia/Sydney",
  "brazil": "America/Sao_Paulo",
  "mexico": "America/Mexico_City"
};

function findCountryByName(countryName) {
  const lowerCasecountryName = countryName.toLowerCase();
  const matches = timezone.filter(
    country => country.countryName.toLowerCase() === lowerCasecountryName
  );
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localMatch = matches.find(entry => entry.timeZone === localTz);
  if (localMatch) {
    return localMatch;
  }
  const preferred = defaultTimeZonesByName[lowerCasecountryName];
  if (preferred) {
    const preferredMatch = matches.find(entry => entry.timeZone === preferred);
    if (preferredMatch) {
      return preferredMatch;
    }
  }
  return matches[0];
}

const aliasMap = {
  uk: "United Kingdom",
  "u k": "United Kingdom",
  "u.k": "United Kingdom",
  "u.k.": "United Kingdom",
  gb: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  "northern ireland": "United Kingdom",
  us: "United States",
  "u s": "United States",
  "u.s": "United States",
  "u.s.": "United States",
  usa: "United States",
  "u s a": "United States",
  "u.s.a": "United States",
  "united states of america": "United States",
  uae: "United Arab Emirates"
};

const defaultTimeZonesByCode = {
  US: "America/New_York",
  CA: "America/Toronto",
  RU: "Europe/Moscow",
  AU: "Australia/Sydney",
  BR: "America/Sao_Paulo",
  MX: "America/Mexico_City"
};

function findCountryByAlias(normalizedQuery) {
  const alias = aliasMap[normalizedQuery];
  if (!alias) return null;
  return findCountryByName(alias);
}

function findCountryByCode(normalizedQuery) {
  const code = (normalizedQuery || "").toUpperCase();
  if (!code || code.length > 3) return null;
  const matches = timezone.filter(
    entry => (entry.CountryCode || "").toUpperCase() === code
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localMatch = matches.find(entry => entry.timeZone === localTz);
  if (localMatch) return localMatch;
  const preferred = defaultTimeZonesByCode[code];
  if (preferred) {
    const preferredMatch = matches.find(entry => entry.timeZone === preferred);
    if (preferredMatch) return preferredMatch;
  }
  return matches[0];
}

function normalizeForMatch(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCountryInText(text) {
  const normalizedText = normalizeForMatch(text);
  if (!normalizedText) return null;
  const candidates = timezone
    .map(entry => ({
      entry,
      name: normalizeForMatch(entry.countryName)
    }))
    .filter(item => item.name);
  candidates.sort((a, b) => b.name.length - a.name.length);
  for (const item of candidates) {
    if (normalizedText.includes(item.name)) {
      return item.entry;
    }
  }
  return null;
}

function processText(originalText, commandPatterns) {
  originalText = originalText.toLowerCase();
  commandPatterns.forEach(function (pattern) {
    originalText = originalText.replace(pattern, "");
  });
  originalText = originalText.trim();
  originalText = originalText.replace(/[?\.!]+$/, "");
  if (originalText.indexOf("in") === 0) {
    originalText = originalText.substring(2).trim();
  }
  if (originalText.indexOf("the") === 0) {
    originalText = originalText.substring(3).trim();
  }
  return originalText;
}

async function NewYearCountdownGrabber(originalText) {
  try {
    const commandPatterns = [
      /how many hours (are|is) (left )?(until|till|for) new year'?s?/i,
      /how long (until|till) new year'?s?/i,
      /new year'?s? countdown/i,
      /new year'?s? in/i
    ];

    const cleanedQuery = processText(originalText, commandPatterns);
    let timeZone = null;
    let locationLabel = cleanedQuery;
    let foundCountry = null;

    if (cleanedQuery) {
      foundCountry = findCountryByName(cleanedQuery);
      if (!foundCountry) {
        const normalizedQuery = normalizeForMatch(cleanedQuery);
        foundCountry = findCountryByAlias(normalizedQuery);
        if (!foundCountry) {
          foundCountry = findCountryByCode(normalizedQuery);
        }
      }
    }
    if (!foundCountry) {
      foundCountry = findCountryInText(originalText);
    }
    if (foundCountry && foundCountry.timeZone) {
      timeZone = foundCountry.timeZone;
      locationLabel = foundCountry.countryName;
    } else if (!cleanedQuery) {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      locationLabel = timeZone || "your area";
    } else {
      return { error: `No timezone match for: ${cleanedQuery}` };
    }

    const countdown = getNewYearCountdown(timeZone);

    return {
      days: countdown.days,
      hours: countdown.hours,
      minutes: countdown.minutes,
      seconds: countdown.seconds,
      targetYear: countdown.targetYear,
      location: locationLabel,
      timeZone
    };
  } catch (error) {
    console.error("Error fetching New Year countdown:", error);
    return null;
  }
}

module.exports = {
  NewYearCountdownGrabber
};
