# Conversion Prompt: Japanese Speakers Learning English

Use this prompt with an AI assistant to convert this Thai learning bot into a bot that helps Japanese speakers learn English.

## Conversion Prompt

```
Convert this Thai language learning Telegram bot into an English language learning bot for Japanese speakers.

CHANGES NEEDED:

1. LANGUAGE TARGET:
   - Change from: Thai lessons for English speakers
   - Change to: English lessons for Japanese speakers (日本語話者向けの英語レッスン)

2. ALL TEXT CONTENT:
   - Update all user-facing messages, descriptions, and UI text
   - Change bot messages from English to Japanese (use polite Japanese: です/ます form)
   - Keep English lesson content in English (since that's what they're learning)
   - Update help messages, status messages, subscription messages

3. FILES TO UPDATE:
   - src/telegramBot.js: All bot messages, commands, and responses
   - public/index.html: Title, description, headings, content
   - README.md: Project description
   - Any configuration files with language-specific content

4. EXAMPLE LESSON FORMAT:
   - The bot should send English sentences
   - Provide Japanese translations (日本語訳)
   - Word-by-word breakdowns: English word → Japanese meaning → pronunciation (katakana)
   - Example:
     English: "I like to eat pizza."
     Japanese: 私はピザを食べるのが好きです。
     Breakdown:
     I - 私 - アイ
     like - 好き - ライク
     to eat - 食べる - トゥ イート
     pizza - ピザ - ピザ

5. SEO & METADATA:
   - Update public/index.html title: "Learn English for Japanese Speakers | Daily English Lessons"
   - Update meta descriptions for Japanese audience learning English
   - Update keywords: "learn English", "English for Japanese", "英語学習", "日本人向け英語"
   - Keep language tag as Japanese: <html lang="ja">

6. BOT BRANDING:
   - Change bot name/description from "Thai Learning Bot" to "English Learning Bot" (英語学習ボット)
   - Update Telegram bot commands to Japanese
   - Update difficulty levels if needed (beginner English for Japanese speakers)

7. CURRENCY & PAYMENTS:
   - Keep payment system as-is (TON/USDT)
   - Update payment button text to Japanese: "💳 購読する" (Subscribe)

8. TIMEZONE:
   - Consider Japan timezone (JST) instead of Bangkok time
   - Update "9am BKK time" to appropriate time for Japanese users (e.g., "9am JST" or "日本時間9時")

9. DIFFICULTY LEVELS:
   - Adapt 5 difficulty levels for Japanese speakers learning English:
     - Level 1: Very basic English (simple sentences)
     - Level 2: Basic English (present tense)
     - Level 3: Intermediate English (past/future tense)
     - Level 4: Advanced English (complex sentences)
     - Level 5: Advanced English (idioms, phrasal verbs)

10. COMMAND STRUCTURE:
    - Keep command structure but translate to Japanese:
      - /help → ヘルプ (help)
      - /status → ステータス (status)
      - /subscribe → 購読 (subscribe)
      - /difficulty → 難易度 (difficulty)

MAKE SURE TO:
- Keep all technical functionality intact (database, scheduler, payment processing)
- Only change language content, not code structure
- Test that all commands still work after conversion
- Maintain the same subscription model and payment flow
- Keep all backend services and API integrations working
```

## Notes

- The bot will send English lessons daily to help Japanese speakers learn English
- Japanese explanations and translations will help learners understand the English content
- The timezone should be updated to Japan Standard Time (JST)
- All user interface text should be in Japanese, while lesson content remains in English
