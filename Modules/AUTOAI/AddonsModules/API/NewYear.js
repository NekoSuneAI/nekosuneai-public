const { timezone } = require("../../../config");

function findCountryByName(countryName) {
  const lowerCasecountryName = countryName.toLowerCase();
  const foundCountry = timezone.find(
    country => country.countryName.toLowerCase() === lowerCasecountryName
  );
  return foundCountry || null;
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

function getParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = getParts(date, timeZone);
  const utcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (utcMs - date.getTime()) / 60000;
}

function zonedTimeToUtc(year, month, day, hour, minute, second, timeZone) {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMs), timeZone);
  return utcMs - offsetMinutes * 60000;
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
    if (cleanedQuery) {
      const foundCountry = findCountryByName(cleanedQuery);
      if (!foundCountry || !foundCountry.timeZone) {
        return { error: `No timezone match for: ${cleanedQuery}` };
      }
      timeZone = foundCountry.timeZone;
      locationLabel = foundCountry.countryName;
    } else {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      locationLabel = timeZone || "your area";
    }

    const now = new Date();
    const parts = getParts(now, timeZone);
    const localYear = Number(parts.year);
    const targetYear = localYear + 1;
    const targetUtcMs = zonedTimeToUtc(
      targetYear,
      1,
      1,
      0,
      0,
      0,
      timeZone
    );

    const diffMs = Math.max(0, targetUtcMs - now.getTime());
    const totalHours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    return {
      hours: totalHours,
      minutes,
      seconds,
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
