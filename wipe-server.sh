#!/bin/bash

# Server Wipe Script - Use with caution!
# This completely removes the English Learning Bot from the server

SERVER_IP=${1:-"68.183.185.81"}
SERVICE_NAME="english-learning-bot"
APP_DIR="/opt/english-learning-bot"

echo "🧹 WIPING SERVER - English Learning Bot (EigoBot) will be completely removed!"
echo "⚠️  This action cannot be undone!"
echo ""

read -p "Are you sure you want to wipe the server? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Operation cancelled"
    exit 1
fi

echo "🧹 Wiping server $SERVER_IP..."

ssh root@$SERVER_IP << EOF
  echo "🛑 Stopping service..."
  systemctl stop $SERVICE_NAME 2>/dev/null || true
  systemctl disable $SERVICE_NAME 2>/dev/null || true
  
  echo "🗑️  Removing files..."
  rm -rf $APP_DIR
  
  echo "🗑️  Removing systemd service..."
  rm -f /etc/systemd/system/$SERVICE_NAME.service
  
  echo "🔄 Reloading systemd..."
  systemctl daemon-reload
  
  echo "✅ Server wiped clean!"
  echo "📁 Directory $APP_DIR removed"
  echo "🔧 Service $SERVICE_NAME removed"
EOF

echo ""
echo "🎉 Server wipe completed!"
echo "💡 Run ./deploy-fresh.sh to deploy fresh installation"
