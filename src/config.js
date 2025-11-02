require('dotenv').config();

module.exports = {
  // Telegram Bot Configuration
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  
  // DeepSeek API
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  
  // TON API
  TON_API_KEY: process.env.TON_API_KEY,
  
  // TON Configuration
  TON_ADDRESS: process.env.TON_ADDRESS || 'UQBDTEPa2TsufNyTFvpydJH07AlOt48cB7Nyq6rFZ7p6e-wt',
  SUBSCRIPTION_DAYS: parseInt(process.env.SUBSCRIPTION_DAYS) || 30,
  
  // TON Native USDT Configuration (Jetton)
  USDT_CONTRACT_ADDRESS: process.env.USDT_CONTRACT_ADDRESS || 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', // Native USDT on TON
  USDT_AMOUNT: parseFloat(process.env.USDT_AMOUNT) || 1.0, // $1.00 USDT
  
  // Database
  DATABASE_PATH: process.env.DATABASE_PATH || './data/bot.db',
  
  // Server
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Timezone
  TIMEZONE: process.env.TIMEZONE || 'Asia/Tokyo',
  
  // Difficulty levels (for Japanese speakers learning English)
  DIFFICULTY_LEVELS: {
    1: { name: 'Very Basic', description: 'simple sentences' },
    2: { name: 'Basic', description: 'present tense' },
    3: { name: 'Intermediate', description: 'past/future tense' },
    4: { name: 'Advanced', description: 'complex sentences' },
    5: { name: 'Advanced', description: 'idioms, phrasal verbs' }
  },
  
  // Daily message schedule (9:00 AM JST)
  DAILY_MESSAGE_CRON: '0 9 * * *', // 9:00 AM JST (Japan time)
  
  // Grading thresholds
  GRADING: {
    EXCELLENT: 90,
    GOOD: 70,
    FAIR: 50,
    POOR: 30
  },

  // Payment Check Configuration
  PAYMENT_CHECK: {
    INITIAL_DELAY_MS: 3000, // 3 seconds before first check
    RETRY_DELAY_MS: 3000, // 3 seconds between retries
    MAX_ATTEMPTS: 3, // Maximum number of check attempts
    TRANSACTION_LIMIT: 20 // Number of transactions to fetch from TON API
  },

  // TON Amount Conversions
  TON_CONVERSIONS: {
    NANO_TO_TON: 1000000000, // 1 TON = 1,000,000,000 nanoTON
    MICRO_USDT_TO_USDT: 1000000 // 1 USDT = 1,000,000 microUSDT
  }
};
