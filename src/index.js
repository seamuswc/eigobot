const express = require('express');
const path = require('path');
const fs = require('fs');
const TelegramBotHandler = require('./telegramBot');
const Scheduler = require('./scheduler');
const messageQueue = require('./messageQueue');
const config = require('./config');

class EnglishLearningBot {
  constructor() {
    this.app = express();
    this.telegramBot = new TelegramBotHandler();
    
    // Set bot instance for message queue so it can send messages
    messageQueue.setBot(this.telegramBot.bot);
    
    this.scheduler = new Scheduler(this.telegramBot);
    this.setupExpress();
  }

  setupExpress() {
    // Parse JSON bodies and URL-encoded bodies
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Trust proxy for IP address (if behind reverse proxy)
    this.app.set('trust proxy', true);
    
    // Serve static landing page
    this.app.use(express.static(path.join(__dirname, '..', 'public')));
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const queueStatus = messageQueue.getStatus();
      
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        timezone: config.TIMEZONE,
        messageQueue: queueStatus
      });
    });

    // Root endpoint serves landing page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    // Payment webhook endpoint
    this.app.post('/webhook/payment', (req, res) => {
      this.handlePaymentWebhook(req, res);
    });

    // Contact form endpoint
    this.app.post('/api/contact', (req, res) => {
      this.handleContactForm(req, res);
    });




    // Start server
    this.app.listen(config.PORT, () => {
      console.log(`🚀 Server running on port ${config.PORT}`);
      console.log(`🌍 Timezone: ${config.TIMEZONE}`);
      console.log(`📅 Daily messages scheduled for 9:00 AM JST`);
    });
  }

  // Start background services
  startServices() {
    console.log('🚀 Background services started');
  }

  // Handle payment webhook
  async handlePaymentWebhook(req, res) {
    try {
      console.log('💰 Payment webhook received:', req.body);
      
      const { userId, chatId, paymentReference, amount, transactionHash } = req.body;
      
      if (!userId || !chatId || !paymentReference) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Trigger payment success
      await this.telegramBot.handlePaymentSuccess(chatId, userId, paymentReference);
      
      res.json({ 
        status: 'success', 
        message: 'Payment processed successfully' 
      });
      
    } catch (error) {
      console.error('❌ Payment webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Handle contact form submission
  async handleContactForm(req, res) {
    try {
      const { message } = req.body;
      
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Create logs directory if it doesn't exist
      const logsDir = path.join(__dirname, '..', 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      // Log file path
      const logFile = path.join(logsDir, 'contact-form.log');
      
      // Format log entry
      const timestamp = new Date().toISOString();
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const logEntry = `\n=== Contact Form Submission ===\nTimestamp: ${timestamp}\nIP: ${ip}\nMessage:\n${message}\n${'='.repeat(50)}\n`;
      
      // Append to log file
      fs.appendFileSync(logFile, logEntry, 'utf8');
      
      console.log('📝 Contact form message logged successfully');
      
      res.json({ 
        status: 'success', 
        message: 'Message sent successfully' 
      });
      
    } catch (error) {
      console.error('❌ Contact form error:', error);
      res.status(500).json({ error: 'Failed to save message. Please try again later.' });
    }
  }


}

// Start the bot
const bot = new EnglishLearningBot();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down English Learning Bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down English Learning Bot...');
  process.exit(0);
});
