let micDisabled = false;
let adminPromptActive = false;

function setMicDisabled(value) {
  micDisabled = Boolean(value);
}

function isMicDisabled() {
  return micDisabled;
}

function setAdminPromptActive(value) {
  adminPromptActive = Boolean(value);
}

function isAdminPromptActive() {
  return adminPromptActive;
}

module.exports = {
  setMicDisabled,
  isMicDisabled,
  setAdminPromptActive,
  isAdminPromptActive
};
