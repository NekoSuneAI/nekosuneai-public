const { config } = require("../../../config");

const { writeToLogFile } = require("../../VOICEModules/LogFiles");

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

const weather = require("openweather-apis");
async function WeatherGrabber(originalText) {
  return new Promise(async (resolve, reject) => {
    try {
      // Define the command patterns to remove
      var commandPatterns = [
        /what\s*is\s*weather\s*in\s*/i,
        /what\s*is\s*weather\s*at\s*/i,
        /what\s*is\s*the\s*weather\s*like\s*/i
      ];
      writeToLogFile(originalText);
      weather.setLang("en");
      weather.setCity(`${processText(originalText, commandPatterns)}`);
      weather.setAPPID(`${config.addons.apikey.weather.key}`);

      weather.getAllWeather(function(err, weatherData) {
        if (
          weatherData.weather[0].description == null ||
          weatherData.weather[0].description == undefined
        ) {
          writeToLogFile(
            `[Weather API] Error: Not found ${processText(
              originalText,
              commandPatterns
            )}`
          );
          resolve(
            `We cant find that Data called: ${processText(
              originalText,
              commandPatterns
            )}, Try again or Please Say it Again.`
          );
        } else {
          var datafound = `Weather in ${processText(
            originalText,
            commandPatterns
          )}: ${weatherData.weather[0].description}, tempture is ${weatherData
            .main.temp}, Humidity is: ${weatherData.main
            .humidity} with Wind: ${weatherData.wind.speed} MPH`;
          resolve(datafound);
        }
      });
    } catch (error) {
      console.error("Error fetching time data:", error);
      resolve(null);
    }
  });
}

module.exports = {
  WeatherGrabber
};
