const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  async init() {
    const config = require('./config');
    const dbPath = config.DATABASE_PATH;
    this.db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        console.error('❌ Database connection error:', err.message);
      } else {
        console.log('✅ Connected to SQLite database');
        try {
          await this.createTables();
        } catch (error) {
          console.error('❌ Error creating tables:', error);
        }
      }
    });
  }

  createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id TEXT UNIQUE NOT NULL,
        display_name TEXT,
        difficulty_level INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at DATETIME,
        payment_reference TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS sentences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        english_text TEXT NOT NULL,
        japanese_translation TEXT,
        difficulty_level INTEGER,
        word_breakdown TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS user_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id TEXT NOT NULL,
        sentence_id INTEGER,
        user_response TEXT,
        grade INTEGER,
        is_correct BOOLEAN,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    return new Promise((resolve, reject) => {
      let completed = 0;
      const total = queries.length;

      queries.forEach((query, index) => {
        this.db.run(query, (err) => {
          if (err) {
            console.error(`❌ Table creation error (${index + 1}):`, err.message);
            reject(err);
          } else {
            completed++;
            if (completed === total) {
              console.log('✅ All database tables created successfully');
              resolve();
            }
          }
        });
      });
    });
  }

  // CRITICAL FIX: Always fetch fresh user data from database
  async getUser(telegramUserId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM users WHERE telegram_user_id = ?';
      this.db.get(query, [telegramUserId], (err, row) => {
        if (err) {
          console.error('❌ Database getUser error:', err.message);
          reject(err);
        } else {
          console.log('🔍 Fresh user data fetched from database:', row);
          resolve(row);
        }
      });
    });
  }

  async createUser(telegramUserId, displayName) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO users (telegram_user_id, display_name, difficulty_level)
        VALUES (?, ?, 1)
        ON CONFLICT(telegram_user_id) DO UPDATE SET
        display_name = excluded.display_name,
        updated_at = CURRENT_TIMESTAMP
      `;
      this.db.run(query, [telegramUserId, displayName], function(err) {
        if (err) {
          console.error('❌ Database createUser error:', err.message);
          reject(err);
        } else {
          console.log('✅ User created/updated:', telegramUserId);
          resolve(this.lastID);
        }
      });
    });
  }

  // CRITICAL FIX: Update user level and ensure it persists
  async updateUserLevel(telegramUserId, level) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE users 
        SET difficulty_level = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE telegram_user_id = ?
      `;
      this.db.run(query, [level, telegramUserId], function(err) {
        if (err) {
          console.error('❌ Database updateUserLevel error:', err.message);
          reject(err);
        } else {
          console.log(`📝 Database: Updated ${this.changes} rows for user ${telegramUserId} to level ${level}`);
          resolve(this.changes);
        }
      });
    });
  }

  async getActiveSubscription(telegramUserId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM subscriptions 
        WHERE telegram_user_id = ? AND status = 'active' AND expires_at > datetime('now')
        ORDER BY created_at DESC LIMIT 1
      `;
      this.db.get(query, [telegramUserId], (err, row) => {
        if (err) {
          console.error('❌ Database getActiveSubscription error:', err.message);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async createSubscription(telegramUserId, paymentReference, days = 30) {
    return new Promise((resolve, reject) => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      
      const query = `
        INSERT INTO subscriptions (telegram_user_id, status, expires_at, payment_reference)
        VALUES (?, 'active', ?, ?)
      `;
      this.db.run(query, [telegramUserId, expiresAt.toISOString(), paymentReference], function(err) {
        if (err) {
          console.error('❌ Database createSubscription error:', err.message);
          reject(err);
        } else {
          console.log('✅ Subscription created:', telegramUserId);
          resolve(this.lastID);
        }
      });
    });
  }

  async getRandomSentence(difficultyLevel) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM sentences 
        WHERE difficulty_level = ? 
        ORDER BY RANDOM() 
        LIMIT 1
      `;
      this.db.get(query, [difficultyLevel], (err, row) => {
        if (err) {
          console.error('❌ Database getRandomSentence error:', err.message);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async saveUserProgress(telegramUserId, sentenceId, userResponse, grade, isCorrect) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO user_progress (telegram_user_id, sentence_id, user_response, grade, is_correct)
        VALUES (?, ?, ?, ?, ?)
      `;
      this.db.run(query, [telegramUserId, sentenceId, userResponse, grade, isCorrect], function(err) {
        if (err) {
          console.error('❌ Database saveUserProgress error:', err.message);
          reject(err);
        } else {
          console.log('✅ Progress saved:', telegramUserId);
          resolve(this.lastID);
        }
      });
    });
  }

  // Cancel user subscription
  cancelSubscription(telegramUserId) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE subscriptions 
        SET status = 'cancelled'
        WHERE telegram_user_id = ? AND status = 'active'
      `;
      this.db.run(query, [telegramUserId], function(err) {
        if (err) {
          console.error('❌ Database cancelSubscription error:', err.message);
          reject(err);
        } else {
          console.log('✅ Subscription cancelled:', telegramUserId);
          resolve(this.changes);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('❌ Database close error:', err.message);
        } else {
          console.log('✅ Database connection closed');
        }
      });
    }
  }
}

module.exports = new Database();
