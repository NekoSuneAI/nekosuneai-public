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

function stripLinks(text) {
  if (!text) return text;
  let cleaned = text;
  // Replace markdown links with just the link text.
  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]*)\)/gi, "$1");
  // Remove dangling markdown link starts like [Title](
  cleaned = cleaned.replace(/\[([^\]]+)\]\(/gi, "$1 ");
  // Remove bracketed citation markers like [1], [1,2].
  cleaned = cleaned.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "");
  // Strip URLs.
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, "");
  cleaned = cleaned.replace(/\bwww\.\S+/gi, "");
  // Remove leftover bracket/parenthesis characters.
  cleaned = cleaned.replace(/[\[\]\(\)]/g, " ");
  // Normalize whitespace.
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

module.exports = {
  formatUptime,
  sleep,
  stripLinks
};
