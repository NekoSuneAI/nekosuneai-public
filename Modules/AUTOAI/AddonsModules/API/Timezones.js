const { timezone } = require("../../../config");

function findCountryByName(countryName) {
  // Convert the input countryName to lowercase for case-insensitive comparison
  const lowerCasecountryName = countryName.toLowerCase();

  // Find the country in the array
  const foundCountry = timezone.find(
    country => country.countryName.toLowerCase() === lowerCasecountryName
  );

  return foundCountry || null;
}

function processText(originalText, commandPatterns) {
  // Convert text to lowercase
  originalText = originalText.toLowerCase();

  // Remove command patterns using regular expressions
  commandPatterns.forEach(function(pattern) {
    originalText = originalText.replace(pattern, "");
  });

  // Trim any leading or trailing spaces
  originalText = originalText.trim();

  // Remove "?", ".", and "!" from the end of the string
  originalText = originalText.replace(/[?\.!]+$/, "");

  // Check if "in" starts at the beginning of the string
  if (originalText.indexOf("in") === 0) {
    // Remove "in" from the beginning
    originalText = originalText.substring(2).trim();
  }

  // Check if "the" starts at the beginning of the string
  if (originalText.indexOf("the") === 0) {
    // Remove "the" from the beginning
    originalText = originalText.substring(3).trim();
  }

  return originalText;
}

function formatAMPM(date) {
  let hours = date.getHours();
  let minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  minutes = minutes < 10 ? "0" + minutes : minutes;
  const strTime = hours + ":" + minutes + " " + ampm;
  return strTime;
}

function getTimeFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  let hours = date.getHours();
  let minutes = date.getMinutes();
  hours = hours < 10 ? "0" + hours : hours;
  minutes = minutes < 10 ? "0" + minutes : minutes;
  return hours + ":" + minutes;
}

async function TimezonesGrabber(originalText) {
  try {
    const commandPatterns = [
      /what is time in/i,
      /what is time in the/i,
      /what is time at/i,
      /what is the time like/i,
      /what time is it in/i,
      /what time is it/i
    ];
    const foundCountry = findCountryByName(
      processText(originalText, commandPatterns)
    );

    // Get the current time in the specified region
    const selectedTime = new Date().toLocaleString("en-US", {
      timeZone: foundCountry.timeZone
    });

    // Convert the time string to a Date object
    const localTime = new Date(selectedTime);

    // Format the time into AM/PM format
    const formattedTime = formatAMPM(localTime);

    return { ampm: formattedTime, time: getTimeFromTimestamp(localTime) };
  } catch (error) {
    console.error("Error fetching time data:", error);
    return null;
  }
}

module.exports = {
  TimezonesGrabber
};
