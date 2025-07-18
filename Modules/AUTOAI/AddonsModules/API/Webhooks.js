const { config } = require("../../../config");
const axios = require("axios");
const retry = require("retry");

// error webhook///
async function sendToWebhookerror(reason) {
  if (config.addons.discord.toggle == true) {
    const webhookerror = config.addons.discord.webhookerror;

    const operation = retry.operation({
      retries: 5, // adjust the number of retries as needed
      factor: 2, // exponential backoff factor
      minTimeout: 1000, // initial timeout in ms
      maxTimeout: 30000 // maximum timeout in ms
    });
    operation.attempt(async () => {
      try {
        if (
          config.addons.discord.authbearer == "AUTHTOKEN" ||
          config.addons.discord.authbearer == null
        ) {
          var headers = {
            headers: {
              "Content-Type": "application/json"
            }
          };
        } else {
          var headers = {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.addons.discord.authbearer}`
            }
          };
        }

        await axios.post(
          webhookerror,
          { content: reason, isEmbed: false },
          headers
        );
      } catch (error) {
        if (error.response && error.response.status === 429) {
          // rate limited, retry
          operation.retry(error);
        } else {
          // unexpected error, log and stop retrying
          console.error(`Error sending to webhook: ${error.message}`);
          operation.stop();
        }
      }
    });
  }
}

/// chat webhook///
async function sendToWebhookchat(response) {
  if (config.addons.discord.toggle == true) {
    return new Promise((resolve, reject) => {
      const webhookchat = config.addons.discord.webhookchat;
      const operation = retry.operation({
        retries: 5, // adjust the number of retries as needed
        factor: 2, // exponential backoff factor
        minTimeout: 1000, // initial timeout in ms
        maxTimeout: 30000 // maximum timeout in ms
      });
      operation.attempt(async () => {
        try {
          if (
            config.addons.discord.authbearer == "AUTHTOKEN" ||
            config.addons.discord.authbearer == null
          ) {
            var headers = {
              headers: {
                "Content-Type": "application/json"
              }
            };
          } else {
            var headers = {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.addons.discord.authbearer}`
              }
            };
          }

          await axios
            .post(webhookchat, { content: response, isEmbed: false }, headers)
            .then(response => {
              resolve(response.data);
            });
        } catch (error) {
          if (error.response && error.response.status === 429) {
            // rate limited, retry
            operation.retry(error);
          } else {
            // unexpected error, log and stop retrying
            console.error(`Error sending to webhook: ${error.message}`);
            operation.stop();
          }
        }
      });
    });
  }
}

async function sendToWebhookchatResponse(response, messageid) {
  if (config.addons.discord.toggle == true) {
    return new Promise((resolve, reject) => {
      const operation = retry.operation({
        retries: 5, // adjust the number of retries as needed
        factor: 2, // exponential backoff factor
        minTimeout: 1000, // initial timeout in ms
        maxTimeout: 30000 // maximum timeout in ms
      });
      operation.attempt(async () => {
        try {
          if (
            config.addons.discord.authbearer == "AUTHTOKEN" ||
            config.addons.discord.authbearer == null ||
            config.addons.discord.authbearer == undefined
          ) {
            var headers = {
              headers: {
                "Content-Type": "application/json"
              }
            };
          } else {
            var headers = {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.addons.discord.authbearer}`
              }
            };
          }

          if (messageid == null || messageid == undefined) {
            await axios
              .post(
                config.addons.discord.webhookreply,
                { content: response, isEmbed: false },
                headers
              )
              .then(response => {
                resolve(response.data);
              });
          } else {
            await axios
              .post(
                `${config.addons.discord.webhookreply}${messageid}/reply`,
                { content: response, isEmbed: false },
                headers
              )
              .then(response => {
                resolve(response.data);
              });
          }
        } catch (error) {
          if (error.response && error.response.status === 429) {
            // rate limited, retry
            operation.retry(error);
          } else {
            // unexpected error, log and stop retrying
            console.error(`Error sending to webhook: ${error.message}`);
            operation.stop();
          }
        }
      });
    });
  }
}

module.exports = {
  sendToWebhookchat,
  sendToWebhookerror,
  sendToWebhookchatResponse
};
