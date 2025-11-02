#!/bin/bash

# Safe bot status checker - doesn't create new instances
echo "🔍 Checking bot status safely..."

# Check if systemd service is running
echo "📊 Systemd service status:"
systemctl is-active english-learning-bot

# Count running instances
INSTANCE_COUNT=$(ps aux | grep 'src/index.js' | grep -v grep | wc -l)
echo "🤖 Bot instances running: $INSTANCE_COUNT"

if [ $INSTANCE_COUNT -eq 1 ]; then
  echo "✅ Single bot instance confirmed"
elif [ $INSTANCE_COUNT -gt 1 ]; then
  echo "⚠️  Multiple instances detected!"
  echo "🛑 Stopping extra instances..."
  pkill -f 'node.*src/index.js'
  sleep 2
  systemctl restart english-learning-bot
  echo "✅ Restarted service"
else
  echo "❌ No bot instances running"
  echo "🚀 Starting service..."
  systemctl start english-learning-bot
fi

# Health check
echo "🏥 Health check:"
curl -s http://68.183.185.81:3000/health || echo "❌ Health check failed"
