function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatUptime(uptimeInSeconds) {
  const months = Math.floor(uptimeInSeconds / 2592000); // Approximation: 30 days per month
  const days = Math.floor(uptimeInSeconds % 2592000 / 86400);
  const hours = Math.floor(uptimeInSeconds % 86400 / 3600);
  const minutes = Math.floor(uptimeInSeconds % 3600 / 60);
  const seconds = Math.floor(uptimeInSeconds % 60);

  return `${months} months, ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
}
module.exports = {
  formatUptime,
  sleep
};
