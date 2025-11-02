#!/bin/bash

# English Learning Bot (EigoBot) - Fresh Deployment Script
# This script wipes the server and deploys fresh

SERVER_IP=${1:-"68.183.185.81"}
APP_DIR="/opt/english-learning-bot"
SERVICE_NAME="english-learning-bot"

echo "🧹 Wiping server and deploying fresh English Learning Bot (EigoBot) to $SERVER_IP"
echo "⚠️  This will completely remove the existing installation!"

# Upload files directly to server
echo "🚀 Uploading files and deploying fresh installation..."

# Upload files directly
scp -r src root@$SERVER_IP:/tmp/
scp -r public root@$SERVER_IP:/tmp/
scp package.json root@$SERVER_IP:/tmp/
scp .env.example root@$SERVER_IP:/tmp/
scp README.md root@$SERVER_IP:/tmp/
scp CRITICAL_FIXES_SUMMARY.md root@$SERVER_IP:/tmp/

# Deploy on server
ssh root@$SERVER_IP << EOF
  echo "🧹 Stopping and removing existing installation..."
  
  # Stop and disable service
  systemctl stop $SERVICE_NAME 2>/dev/null || true
  systemctl disable $SERVICE_NAME 2>/dev/null || true
  
  # Remove old installation
  rm -rf $APP_DIR
  
  # Remove systemd service
  rm -f /etc/systemd/system/$SERVICE_NAME.service
  
  # Reload systemd
  systemctl daemon-reload
  
  echo "✅ Server wiped clean"
  
  # Create fresh app directory
  mkdir -p $APP_DIR
  cd $APP_DIR
  
  # Copy fresh files
  cp -r /tmp/src $APP_DIR/
  cp -r /tmp/public $APP_DIR/
  cp /tmp/package.json $APP_DIR/
  cp /tmp/.env.example $APP_DIR/
  cp /tmp/README.md $APP_DIR/
  cp /tmp/CRITICAL_FIXES_SUMMARY.md $APP_DIR/
  
  # Install dependencies
  echo "📦 Installing dependencies..."
  npm install --production
  
  # Create data directory
  mkdir -p data
  
  # Set up environment - copy from local .env if it exists
  if [ -f .env ]; then
    echo "📋 Copying local .env file..."
    cp .env .env.backup
  else
    echo "⚠️  No local .env file found. Creating from template..."
    cat > .env << 'EOL'
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=8398725072:AAGGQTvGOx5EueDNTPQ8DU5BTYkH08Y90Zc

# DeepSeek API
DEEPSEEK_API_KEY=your-deepseek-api-key

# TON Configuration
TON_ADDRESS=your-ton-address
SUBSCRIPTION_DAYS=30

# TON Console API Key
TON_API_KEY=your-ton-console-api-key

# Webhook Configuration
WEBHOOK_BASE_URL=https://eigobot.com

# Database
DATABASE_PATH=./data/bot.db

# Server
PORT=3000
NODE_ENV=production

# Timezone
TIMEZONE=Asia/Tokyo
EOL
    echo "⚠️  Please update .env file with your actual API keys!"
  fi
  
  # Create systemd service
  cat > /etc/systemd/system/$SERVICE_NAME.service << EOL
[Unit]
Description=English Learning Bot (EigoBot)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOL

  # Reload systemd and start service
  systemctl daemon-reload
  systemctl enable $SERVICE_NAME
  systemctl start $SERVICE_NAME
  
  # Wait a moment for startup
  sleep 3
  
  # Check status
  echo "📊 Service status:"
  systemctl status $SERVICE_NAME --no-pager
  
  # Check if running
  if systemctl is-active --quiet $SERVICE_NAME; then
    echo "✅ Service started successfully!"
  else
    echo "❌ Service failed to start"
    echo "📝 Recent logs:"
    journalctl -u $SERVICE_NAME --no-pager -n 20
  fi
  
  echo "🎉 Fresh deployment completed!"
EOF

# Clean up
ssh root@$SERVER_IP "rm -rf /tmp/src /tmp/package.json /tmp/.env.example /tmp/README.md /tmp/CRITICAL_FIXES_SUMMARY.md"

echo ""
echo "🎉 Fresh deployment completed!"
echo "🌐 Health check: http://$SERVER_IP:3000/health"
echo "📱 Bot should be running on Telegram"
echo "📝 To check logs: ssh root@$SERVER_IP 'journalctl -u $SERVICE_NAME -f'"
