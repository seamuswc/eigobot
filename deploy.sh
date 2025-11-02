#!/bin/bash

# English Learning Bot (EigoBot) Deployment Script
# Usage: ./deploy.sh [server_ip]

SERVER_IP=${1:-"152.42.166.129"}
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
  
  # Install Node.js if not installed
  if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
  
  # Install nginx and certbot if not installed
  if ! command -v nginx &> /dev/null; then
    echo "🌐 Installing nginx and certbot..."
    apt-get update
    apt-get install -y nginx certbot python3-certbot-nginx
    systemctl enable nginx
  fi
  
  # Install dependencies
  npm install --production
  
  # Create data directory
  mkdir -p data
  
  # Set up environment - preserve existing .env if it exists
  if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cat > .env << 'EOL'
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# DeepSeek API
DEEPSEEK_API_KEY=your-deepseek-api-key

# TON Configuration
TON_ADDRESS=UQBDTEPa2TsufNyTFvpydJH07AlOt48cB7Nyq6rFZ7p6e-wt
SUBSCRIPTION_DAYS=30

# TON Console API Key
TON_API_KEY=your-ton-console-api-key

# USDT Configuration
USDT_CONTRACT_ADDRESS=your-usdt-contract-address
USDT_AMOUNT=1

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
    echo "⚠️  Please update .env file with your actual API keys on the server!"
  else
    echo "✅ Preserving existing .env file"
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
  
  # Configure nginx reverse proxy if not already configured
  if [ ! -f /etc/nginx/sites-enabled/eigobot ]; then
    echo "🌐 Configuring nginx reverse proxy..."
    
    # Check if SSL certificate exists
    SSL_EXISTS=false
    if [ -f /etc/letsencrypt/live/eigobot.com/fullchain.pem ]; then
      SSL_EXISTS=true
      echo "🔒 SSL certificate detected..."
    fi
    
    # Only write HTTP config if SSL is not configured
    if [ "$SSL_EXISTS" = false ]; then
      # Create HTTP-only config (for initial SSL setup)
      cat > /etc/nginx/sites-available/eigobot << NGINX_EOF
server {
    listen 80;
    server_name eigobot.com www.eigobot.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF
      
      # Enable site
      ln -sf /etc/nginx/sites-available/eigobot /etc/nginx/sites-enabled/
      rm -f /etc/nginx/sites-enabled/default
      
      # Test nginx configuration
      nginx -t
      
      # Enable and start nginx
      systemctl enable nginx
      systemctl restart nginx
      
      # Wait for nginx to be fully ready
      sleep 2
      
      # Install SSL certificate with Let's Encrypt
      echo "🔒 Setting up SSL certificate..."
      certbot --nginx -d eigobot.com -d www.eigobot.com --non-interactive --agree-tos --email admin@eigobot.com --redirect || {
        echo "⚠️ SSL certificate installation failed. You can run it manually later with:"
        echo "   certbot --nginx -d eigobot.com -d www.eigobot.com"
      }
    else
      # SSL exists but config doesn't - let certbot configure it
      echo "🔒 SSL certificate exists - configuring nginx with certbot..."
      certbot --nginx -d eigobot.com -d www.eigobot.com --non-interactive --agree-tos --redirect || true
    fi
  else
    echo "✅ Nginx configuration already exists"
    # Verify nginx config is valid
    if nginx -t; then
      systemctl reload nginx || systemctl restart nginx
      echo "✅ Nginx reloaded"
    else
      echo "⚠️ Nginx config has errors. Run manually: nginx -t"
    fi
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
