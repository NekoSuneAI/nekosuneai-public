const { windowManager } = require('node-window-manager');
const screenshot = require('screenshot-desktop');
const sharp = require('sharp');

async function captureVRChat(outPath = 'vrchat.png') {
  const win = windowManager.getWindows().find(w => w.getTitle().includes('VRChat'));
  if (!win) throw new Error('VRChat window not found');

  let { x, y, width, height } = win.getBounds();
  console.log('VRChat bounds:', { x, y, width, height });

  // Bail if the window is minimized/off-screen
  if (x <= -30000 || y <= -30000) {
    throw new Error('VRChat is minimized or off-screen — restore it first');
  }

  // Clamp negative coords
  if (x < 0) x = 0;
  if (y < 0) y = 0;

  const imgBuffer = await screenshot({ format: 'png' });
  const { width: screenW, height: screenH } = await sharp(imgBuffer).metadata();

  // Adjust width/height so we don’t go outside the screenshot
  if (x + width > screenW) width = screenW - x;
  if (y + height > screenH) height = screenH - y;

  await sharp(imgBuffer)
    .extract({ left: x, top: y, width, height })
    .toFile(outPath);

  return outPath;
}

module.exports = {
  captureVRChat
};