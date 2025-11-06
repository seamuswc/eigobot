const cron = require('node-cron');
const database = require('./database');
const deepseekService = require('./services/deepseek');
const messageQueue = require('./messageQueue');
const config = require('./config');

class Scheduler {
  constructor(telegramBot) {
    this.bot = telegramBot;
    this.setupDailyMessages();
  }

  setupDailyMessages() {
    // Schedule daily messages at 9:00 AM JST
    cron.schedule(config.DAILY_MESSAGE_CRON, async () => {
      console.log('📅 Daily message scheduler triggered');
      await this.sendDailyMessages();
    }, {
      timezone: config.TIMEZONE
    });

    console.log('⏰ Daily message scheduler set for 9:00 AM JST');
  }

  async sendDailyMessages() {
    try {
      // Get all users with active subscriptions
      const activeUsers = await this.getActiveUsers();
      
      console.log(`📤 Queuing daily messages for ${activeUsers.length} users`);

      // Generate one sentence per difficulty level (cached)
      const difficultySentences = {};
      for (let level = 1; level <= 5; level++) {
        try {
          difficultySentences[level] = await deepseekService.generateEnglishSentence(level);
          console.log(`✅ Generated sentence for difficulty ${level}`);
        } catch (error) {
          console.error(`❌ Error generating sentence for difficulty ${level}:`, error);
        }
      }

      // Queue messages for all users
      for (const user of activeUsers) {
        try {
          const sentenceData = difficultySentences[user.difficulty_level];
          if (sentenceData) {
            // Save sentence to database for tracking
            await this.saveSentence(sentenceData, user.difficulty_level);
            
            const message = this.createDailyMessage(sentenceData);
            // Convert telegram_user_id (string) to number for chatId (Telegram API requires number for private chats)
            const chatId = parseInt(user.telegram_user_id, 10);
            if (isNaN(chatId)) {
              console.error(`❌ Invalid chatId for user ${user.telegram_user_id}`);
              continue;
            }
            messageQueue.addMessage(chatId, message);
          } else {
            console.error(`❌ No sentence data for difficulty level ${user.difficulty_level}`);
          }
        } catch (error) {
          console.error(`❌ Error queuing message for user ${user.telegram_user_id}:`, error);
        }
      }

      console.log(`📋 Queued ${activeUsers.length} daily messages`);
    } catch (error) {
      console.error('❌ Error in sendDailyMessages:', error);
    }
  }

  async getActiveUsers() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.*, s.expires_at 
        FROM users u
        JOIN subscriptions s ON u.telegram_user_id = s.telegram_user_id
        WHERE s.status = 'active' AND s.expires_at > datetime('now')
      `;
      
      database.db.all(query, [], (err, rows) => {
        if (err) {
          console.error('❌ Error getting active users:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  // Sanitize pronunciation to only use Latin alphabet (a-z, A-Z, spaces, hyphens, apostrophes)
  sanitizePronunciation(text) {
    if (!text) return '';
    // Only allow: a-z, A-Z, spaces, hyphens, apostrophes
    return text.toString().replace(/[^a-zA-Z\s\-']/g, '').trim();
  }

  createDailyMessage(sentenceData) {
    // Create word breakdown
    let wordBreakdown = '';
    if (sentenceData.word_breakdown && sentenceData.word_breakdown.length > 0) {
      wordBreakdown = '\n\n📚 単語の解説:\n';
      for (const word of sentenceData.word_breakdown) {
        if (typeof word === 'object' && word.word && word.meaning) {
          const romaji = this.sanitizePronunciation(word.pinyin || '');
          wordBreakdown += `${word.word} - ${word.meaning} - ${romaji}\n`;
        } else if (typeof word === 'string') {
          wordBreakdown += `${word}\n`;
        }
      }
    }

    return `🇬🇧 今日の英語レッスン

📝 英語の文章:
${sentenceData.english_text}

🔤 日本語訳:
${sentenceData.japanese_translation}

英語の文章をタイプしてみましょう！${wordBreakdown}

英語の文章を練習しましょう！`;
  }

  async saveSentence(sentenceData, difficultyLevel) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO sentences (english_text, japanese_translation, difficulty_level, word_breakdown)
        VALUES (?, ?, ?, ?)
      `;
      
      const wordBreakdown = JSON.stringify(sentenceData.word_breakdown || []);
      
      database.db.run(query, [
        sentenceData.english_text,
        sentenceData.japanese_translation,
        difficultyLevel,
        wordBreakdown
      ], function(err) {
        if (err) {
          console.error('❌ Error saving sentence:', err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Scheduler;
