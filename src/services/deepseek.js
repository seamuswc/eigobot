const axios = require('axios');
const config = require('../config');
const database = require('../database');

class DeepSeekService {
  constructor() {
    this.apiKey = config.DEEPSEEK_API_KEY;
    this.apiUrl = config.DEEPSEEK_API_URL;
    this.sentenceCache = {}; // Cache for sentences by difficulty level
    this.lastCacheDate = null; // Track when cache was last updated
  }

  // Sanitize pronunciation to only use Latin alphabet (a-z, A-Z, spaces, hyphens, apostrophes)
  sanitizePronunciation(text) {
    if (!text) return '';
    // Only allow: a-z, A-Z, spaces, hyphens, apostrophes
    return text.toString().replace(/[^a-zA-Z\s\-']/g, '').trim();
  }

  // Check if cache needs to be reset (8:00 AM JST)
  shouldResetCache() {
    const now = new Date();
    const japanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
    const currentHour = japanTime.getHours();
    const currentDate = japanTime.toDateString();
    
    // Reset cache at 8:00 AM JST or if it's a new day after 8 AM
    const shouldReset = (currentHour >= 8 && this.lastCacheDate !== currentDate) || 
                       (this.lastCacheDate && this.lastCacheDate !== currentDate);
    
    if (shouldReset) {
      console.log('🔄 8:00 AM JST detected, resetting sentence cache');
      this.sentenceCache = {};
      this.lastCacheDate = currentDate;
      return true;
    }
    return false;
  }

  // Get cached sentence or generate new one
  async generateEnglishSentence(difficultyLevel, retryCount = 0) {
    // Check if cache needs reset
    this.shouldResetCache();
    
    // Return cached sentence if available
    if (this.sentenceCache[difficultyLevel]) {
      console.log(`📦 Using cached sentence for difficulty ${difficultyLevel}`);
      return this.sentenceCache[difficultyLevel];
    }
    
    console.log(`🔄 Generating new sentence for difficulty ${difficultyLevel}`);
    
    try {
      // Get recent sentences to avoid duplicates
      const recentSentences = await database.getRecentSentences(difficultyLevel, 30);
      const recentEnglishTexts = recentSentences.map(s => s.english_text).filter(Boolean);
      
      let avoidPrompt = '';
      if (recentEnglishTexts.length > 0) {
        avoidPrompt = `\n\nCRITICAL: Do NOT generate any of these sentences that were recently used:\n${recentEnglishTexts.slice(0, 10).map((text, i) => `${i + 1}. ${text}`).join('\n')}\n\nYou MUST create a completely different sentence with different words, topics, and structure. Do not repeat similar phrases or patterns.`;
      }
      
      const levelInfo = config.DIFFICULTY_LEVELS[difficultyLevel];
      const prompt = `Generate an English sentence for Japanese speakers learning English at ${levelInfo.name} level (${levelInfo.description}). 
      The sentence should be:
      - In English
      - Include Japanese translation (日本語訳)
      - Be appropriate for the difficulty level
      - Completely unique and different from previously generated sentences
      
      For word_breakdown, provide an array of objects with:
      - word: the individual English word
      - meaning: Japanese meaning (日本語の意味)
      - pinyin: English pronunciation in romaji (ローマ字表記)
      
      CRITICAL FOR PRONUNCIATION (pinyin field):
      - ONLY use Latin alphabet characters: a-z, A-Z
      - You may use spaces, hyphens (-), and apostrophes (')
      - DO NOT use Greek letters, Cyrillic, or any other non-Latin characters
      - Examples: "harou", "raiku", "piza", "ai", "iito", "tudei"
      
      IMPORTANT: Break down into individual words. For example:
      - "I like to eat pizza." should be broken down as:
        - "I" (私 - ai)
        - "like" (好き - raiku)
        - "to eat" (食べる - tu iito)
        - "pizza" (ピザ - piza)
      
      CRITICAL REQUIREMENTS:
      - Use a completely different topic, vocabulary, and sentence structure
      - Vary the topics: try different activities, places, foods, emotions, weather, etc.
      - Avoid repeating similar sentence patterns or word combinations
      - Be creative and diverse in your sentence generation${avoidPrompt}

      Format the response as JSON with fields: english_text, japanese_translation, word_breakdown`;

      const response = await axios.post(this.apiUrl, {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9, // Increased from 0.7 for more variation
        max_tokens: 1500
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const content = response.data.choices[0].message.content;
      console.log('🔍 DeepSeek raw response:', content);
      
      try {
        // Clean up the response - remove markdown code blocks
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        }
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        console.log('🔍 Cleaned content length:', cleanContent.length);
        console.log('🔍 Cleaned content preview:', cleanContent.substring(0, 200) + '...');
        
        const parsed = JSON.parse(cleanContent);
        console.log('🔍 Parsed JSON successfully');
        console.log('🔍 English text:', parsed.english_text);
        
        // Validate that we have actual English text
        if (!parsed.english_text || parsed.english_text.trim() === '' || parsed.english_text.includes('```')) {
          throw new Error('Invalid English text in response');
        }
        
        // Check for duplicate sentences
        const isDuplicate = recentEnglishTexts.some(recentText => 
          recentText.trim().toLowerCase() === parsed.english_text.trim().toLowerCase()
        );
        
        if (isDuplicate) {
          console.log(`⚠️ Duplicate sentence detected: "${parsed.english_text}"`);
          if (retryCount < 3) {
            console.log(`🔄 Retrying with different prompt (attempt ${retryCount + 1})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.generateEnglishSentence(difficultyLevel, retryCount + 1);
          } else {
            console.log(`⚠️ Max retries reached, using sentence despite duplicate check`);
          }
        }
        
        // Sanitize and add romaji pronunciation if missing
        if (parsed.word_breakdown && Array.isArray(parsed.word_breakdown)) {
          parsed.word_breakdown.forEach(word => {
            if (word.pinyin) {
              // Sanitize existing pronunciation to remove non-Latin characters
              const sanitized = this.sanitizePronunciation(word.pinyin);
              if (sanitized !== word.pinyin) {
                console.log(`🔧 Sanitized pronunciation: "${word.pinyin}" → "${sanitized}"`);
              }
              word.pinyin = sanitized;
            }
            
            if (!word.pinyin || word.pinyin.trim() === '') {
              // Simple romaji fallback based on common English words
              const romajiMap = {
                'I': 'ai',
                'like': 'raiku',
                'to': 'tuu',
                'eat': 'iito',
                'pizza': 'piza',
                'hello': 'harou',
                'thank you': 'sankyuu',
                'yes': 'iesu',
                'no': 'nou'
              };
              word.pinyin = romajiMap[word.word.toLowerCase()] || word.word.toLowerCase();
            }
          });
        }
        
        // Cache the generated sentence
        this.sentenceCache[difficultyLevel] = parsed;
        console.log(`💾 Cached sentence for difficulty ${difficultyLevel}`);
        
        return parsed;
      } catch (parseError) {
        console.error('❌ JSON parsing failed:', parseError.message);
        console.error('❌ Raw content:', content);
        
        throw new Error('Failed to parse AI response');
      }
    } catch (error) {
      console.error(`❌ DeepSeek API error (attempt ${retryCount + 1}):`, error.message);
      
      // Retry logic
      const maxRetries = 3;
      if (retryCount < maxRetries) {
        const baseDelay = 1000; // 1 second base delay
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`🔄 Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.generateEnglishSentence(difficultyLevel, retryCount + 1);
      }
      
      console.error('❌ All DeepSeek attempts failed');
      throw error;
    }
  }
}

module.exports = new DeepSeekService();
