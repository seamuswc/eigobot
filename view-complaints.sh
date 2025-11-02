#!/bin/bash

# View Contact Form Complaints/Logs
# Usage: ./view-complaints.sh [number_of_lines]

LOG_FILE="/opt/english-learning-bot/logs/contact-form.log"
LINES=${1:-50}

echo "📝 Contact Form Complaints/Logs"
echo "================================"
echo ""

if [ ! -f "$LOG_FILE" ]; then
  echo "❌ Log file not found: $LOG_FILE"
  echo "💡 The file will be created when someone submits the contact form."
  exit 1
fi

if [ ! -s "$LOG_FILE" ]; then
  echo "📭 No complaints yet - the log file is empty."
  exit 0
fi

echo "Showing last $LINES lines:"
echo ""
tail -n "$LINES" "$LOG_FILE"

echo ""
echo "================================"
echo "💡 To watch for new complaints in real-time: tail -f $LOG_FILE"
echo "💡 To see all complaints: cat $LOG_FILE"

