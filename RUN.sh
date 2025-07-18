#!/bin/bash

echo "📦 Starting script..."

# 1. Pull latest code from Git
echo "🔄 Pulling latest code from Git..."
git pull

# 2. Check if Node.js v20+ is installed
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  echo "⚠️ Node.js v20 not found. Installing Node.js v20..."

  # Install Node.js v20 using NodeSource
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 3. Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing node modules..."
  npm install
fi

# 4. Start the app
echo "🚀 Starting app..."
node index.js
