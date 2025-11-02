#!/bin/bash

# English Learning Bot (EigoBot) Deployment Script
# Usage: ./deploy.sh [server_ip]

SERVER_IP=${1:-"68.183.185.81"}
APP_DIR="/opt/english-learning-bot"
SERVICE_NAME="english-learning-bot"

echo "🚀 Deploying English Learning Bot (EigoBot) to $SERVER_IP"

# Create deployment package
echo "📦 Creating deployment package..."
  tar -czf english-learning-bot.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=data \
  --exclude=logs \
  --exclude=*.log \
  src/ public/ package.json .env.example

# Upload to server
echo "📤 Uploading to server..."
scp english-learning-bot.tar.gz root@$SERVER_IP:/tmp/

# Deploy on server
echo "🔧 Deploying on server..."
ssh root@$SERVER_IP << EOF
  # Create app directory
  mkdir -p $APP_DIR
  cd $APP_DIR
  
  # Extract files
  tar -xzf /tmp/english-learning-bot.tar.gz
  
  # Install dependencies
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
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

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

  # Stop any existing instances first
  echo "🛑 Stopping any existing bot instances..."
  pkill -f 'node.*src/index.js' || true
  pkill -f 'node.*telegramBot' || true
  sleep 2
  
  # Reload systemd and start service
  systemctl daemon-reload
  systemctl enable $SERVICE_NAME
  systemctl restart $SERVICE_NAME
  
  # Wait for service to start
  sleep 3
  
  # Check status
  systemctl status $SERVICE_NAME --no-pager
  
  # Verify only one instance is running
  echo "🔍 Checking for multiple instances..."
  INSTANCE_COUNT=\$(ps aux | grep 'src/index.js' | grep -v grep | wc -l)
  if [ \$INSTANCE_COUNT -gt 1 ]; then
    echo "⚠️  Warning: Multiple bot instances detected (\$INSTANCE_COUNT)"
    echo "🛑 Stopping extra instances..."
    pkill -f 'node.*src/index.js'
    sleep 2
    systemctl restart $SERVICE_NAME
  else
    echo "✅ Single bot instance confirmed"
  fi
  
  echo "✅ Deployment completed!"
  echo "📊 Service status:"
  systemctl is-active $SERVICE_NAME
  echo "📝 Logs: journalctl -u $SERVICE_NAME -f"
EOF

# Clean up
rm english-learning-bot.tar.gz

echo "🎉 Deployment completed successfully!"
echo "🌐 Health check: http://$SERVER_IP:3000/health"
echo "📱 Bot should be running on Telegram"
