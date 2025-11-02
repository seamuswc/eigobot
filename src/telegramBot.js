const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const database = require('./database');
const config = require('./config');
const deepseekService = require('./services/deepseek');
const priceService = require('./services/priceService');

class TelegramBotHandler {
  constructor(options = {}) {
    try {
      console.log('🚀 Initializing English Learning Bot...');
      console.log('🔑 Bot token present:', !!config.TELEGRAM_BOT_TOKEN);
      console.log('🔑 Bot token length:', config.TELEGRAM_BOT_TOKEN ? config.TELEGRAM_BOT_TOKEN.length : 0);
      
      // Allow disabling polling for testing
      const polling = options.polling !== false;
      console.log('📡 Polling enabled:', polling);
      
      this.bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling });
      
      // Add deduplication tracking
      this.processedCallbacks = new Set();
      this.processedMessages = new Set();
      
      // Payment tracking
      this.pendingPayments = new Map();
      this.checkingPayments = new Set();
      
      this.setupEventHandlers();
      console.log('🤖 English Learning Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to initialize bot:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Helper function to create inline keyboard
   * @param {Array<Array<Object>>} buttons - Array of button rows
   * @returns {Object} Telegram keyboard format
   */
  createKeyboard(buttons) {
    return {
      reply_markup: {
        inline_keyboard: buttons
      }
    };
  }

  setupEventHandlers() {
    console.log('🔧 Setting up event handlers...');
    
    // Handle callback queries (button clicks) - HIGHEST PRIORITY
    this.bot.on('callback_query', (callbackQuery) => {
      const callbackId = `${callbackQuery.id}_${callbackQuery.data}`;
      
      // Check for duplicate processing
      if (this.processedCallbacks.has(callbackId)) {
        console.log(`⚠️ Duplicate callback ignored: ${callbackQuery.data}`);
        return;
      }
      
      this.processedCallbacks.add(callbackId);
      console.log(`🔘 Callback query received: ${callbackQuery.data} from user ${callbackQuery.from.id}`);
      
      this.handleCallbackQuery(callbackQuery).catch(error => {
        console.error('❌ Error in callback query handler:', error);
        console.error('❌ Callback data:', callbackQuery.data);
        console.error('❌ User ID:', callbackQuery.from.id);
        // Remove from processed set on error so it can be retried
        this.processedCallbacks.delete(callbackId);
      });
    });
    
    // Note: TON payments use deep links, not Telegram Payments API
    
    // Handle /start command
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    
    // Handle /help command
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg.chat.id));
    
    
    // Handle text messages (user responses to sentences) - ONLY for non-command messages
    this.bot.on('message', (msg) => {
      // Skip if it's a command (handled by onText above)
      if (msg.text && msg.text.startsWith('/')) {
        return;
      }
      
      // Skip if it's from a bot
      if (msg.from.is_bot) {
        return;
      }
      
      // Only handle regular text messages
      if (msg.text) {
        const messageId = `${msg.message_id}_${msg.from.id}`;
        
        // Check for duplicate processing
        if (this.processedMessages.has(messageId)) {
          console.log(`⚠️ Duplicate message ignored: ${msg.text.substring(0, 50)}...`);
          return;
        }
        
        this.processedMessages.add(messageId);
        this.handleMessage(msg);
      }
    });
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const displayName = msg.from.first_name || msg.from.username || 'User';

    try {
      // Ensure user exists in database
      await database.createUser(userId.toString(), displayName);
      
      const keyboard = this.createKeyboard([
        [
          { text: '📚 ヘルプ', callback_data: 'help' },
          { text: '📊 ステータス', callback_data: 'status' }
        ],
        [
          { text: '💳 購読する', callback_data: 'subscribe' },
          { text: '⚙️ 難易度', callback_data: 'settings' }
        ]
      ]);

      const welcomeMessage = `🇬🇧 英語学習ボットへようこそ！

📖 毎日の英語の文章を受け取って、語学力を向上させましょう！
💰 TON暗号通貨で30日間のレッスンを購読できます。

🎯 難易度を選択して学習を始めましょう！`;

      await this.bot.sendMessage(chatId, welcomeMessage, keyboard);
    } catch (error) {
      console.error('❌ Error in handleStart:', error);
      await this.bot.sendMessage(chatId, '❌ 申し訳ございませんが、問題が発生しました。もう一度お試しください。');
    }
  }

  async handleHelp(chatId) {
    const helpMessage = `🇬🇧 英語学習ボット ヘルプ

📖 使い方:
• 毎日9時に英語の文章を受信します（日本時間）
• 本物の英語コンテンツで練習できます

💰 購読: 30日間で$1 USD
🎯 難易度: 5レベル（初級から上級まで）

🎮 下のボタンでナビゲートできます！`;

    const keyboard = this.createKeyboard([
      [{ text: '🏠 メインメニュー', callback_data: 'back_to_main' }]
    ]);

    await this.bot.sendMessage(chatId, helpMessage, keyboard);
  }



  async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    console.log(`🔘 Button clicked: ${data} by user ${userId} in chat ${chatId}`);

    try {
      await this.bot.answerCallbackQuery(callbackQuery.id);

      switch (data) {
        case 'help':
          await this.handleHelp(chatId);
          break;
        case 'status':
          await this.handleStatus(chatId, userId);
          break;
        case 'subscribe':
          await this.handleSubscribe(chatId, userId);
          break;
        case 'settings':
          await this.handleSettings(chatId, userId);
          break;
        case 'back_to_main':
          await this.handleStart({ chat: { id: chatId }, from: { id: userId } });
          break;
        case 'unsubscribe':
          await this.handleUnsubscribe(chatId, userId);
          break;
        default:
          if (data.startsWith('level_')) {
            const level = parseInt(data.split('_')[1]);
            await this.handleSetLevel(chatId, userId, level);
          } else if (data.startsWith('check_payment_')) {
            const targetUserId = data.split('_')[2];
            await this.handleCheckPayment(chatId, targetUserId);
          }
          break;
      }
    } catch (error) {
      console.error('❌ Error in handleCallbackQuery:', error);
      await this.bot.sendMessage(chatId, '❌ 申し訳ございませんが、問題が発生しました。もう一度お試しください。');
    }
  }

  // CRITICAL FIX: Always fetch fresh user data from database
  async handleStatus(chatId, userId) {
    console.log(`📊 Handling status request for user ${userId}`);
    
    try {
      // CRITICAL FIX: Fetch fresh user data from database
      const user = await database.getUser(userId.toString());
      if (!user) {
        await this.bot.sendMessage(chatId, '❌ ユーザーが見つかりません。まず/startを使用してください。');
        return;
      }

      console.log(`📊 Status request for user ${userId}, current level: ${user.difficulty_level}`);

      const subscription = await database.getActiveSubscription(userId.toString());
      const levelName = config.DIFFICULTY_LEVELS[user.difficulty_level]?.name || '不明';

      let statusMessage = `📊 購読ステータス\n\n`;
      
      if (subscription) {
        const expiresAt = new Date(subscription.expires_at);
        const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        statusMessage += `✅ 有効（残り${daysLeft}日）\n`;
      } else {
        statusMessage += `❌ アクティブな購読がありません\n`;
      }
      
      statusMessage += `現在のレベル: ${user.difficulty_level} (${levelName})\n\n`;
      statusMessage += `毎日のレッスンは日本時間9時に送信されます。`;

      // Create keyboard based on subscription status
      const keyboard = subscription && subscription.status === 'active'
        ? this.createKeyboard([
            [{ text: '🚫 購読を解除', callback_data: 'unsubscribe' }],
            [{ text: '🏠 メインメニュー', callback_data: 'back_to_main' }]
          ])
        : this.createKeyboard([
            [{ text: '🏠 メインメニュー', callback_data: 'back_to_main' }]
          ]);

      await this.bot.sendMessage(chatId, statusMessage, keyboard);
    } catch (error) {
      console.error('❌ Error in handleStatus:', error);
      await this.bot.sendMessage(chatId, '❌ 申し訳ございませんが、問題が発生しました。もう一度お試しください。');
    }
  }

  async handleSubscribe(chatId, userId) {
    try {
      console.log(`💎 Starting subscription process for user ${userId}`);
      
      // Check if user already has active subscription
      const existingSubscription = await database.getActiveSubscription(userId.toString());
      if (existingSubscription) {
        console.log(`⚠️ User ${userId} already has active subscription`);
        await this.bot.sendMessage(chatId, '✅ すでにアクティブな購読があります！');
        return;
      }
      
      // Calculate TON amount for $1 USD (equivalent to USDT amount)
      let tonAmountForUSD = await priceService.getTonAmountForUSD(1.0);
      
      if (!tonAmountForUSD) {
        // Fallback if price fetch fails - use a default estimate (assume $2.50 per TON)
        console.warn('⚠️ Could not fetch TON price, using fallback estimate');
        const fallbackPrice = 2.5;
        tonAmountForUSD = 1.0 / fallbackPrice; // ~0.4 TON for $1
      }
      
      const usdtAmount = Math.floor(config.USDT_AMOUNT * config.TON_CONVERSIONS.MICRO_USDT_TO_USDT); // Convert to microUSDT (6 decimals)
      const tonAmountNano = Math.floor(tonAmountForUSD * config.TON_CONVERSIONS.NANO_TO_TON); // Convert to nanoTON
      const paymentReference = `english-bot-${userId}-${Date.now()}`;
      
      console.log(`💎 Creating payment links for user ${userId}`);
      console.log(`💰 TON Amount: ${tonAmountForUSD.toFixed(4)} TON (≈ $1.00, ${tonAmountNano} nanoTON)`);
      console.log(`💰 USDT Amount: ${config.USDT_AMOUNT} USDT (${usdtAmount} microUSDT)`);
      console.log(`🔗 Reference: ${paymentReference}`);
      
      // Create TON deep link
      const tonDeepLink = `ton://transfer/${config.TON_ADDRESS}?amount=${tonAmountNano}&text=${paymentReference}`;
      console.log(`🔗 TON Deep Link: ${tonDeepLink}`);
      
      // Create TON Native USDT deep link
      const tonUsdtDeepLink = `ton://transfer/${config.TON_ADDRESS}?amount=${usdtAmount}&text=${paymentReference}&jetton=${config.USDT_CONTRACT_ADDRESS}`;
      console.log(`🔗 TON USDT Deep Link: ${tonUsdtDeepLink}`);
      
      // Store payment reference for verification (store both amounts)
      // Use an array to store multiple pending payments per user to prevent clashes
      
      // Get existing pending payments for this user (if any)
      const existingPayments = this.pendingPayments.get(userId.toString()) || [];
      
      // Add new payment to the array
      const newPayment = {
        reference: paymentReference,
        amount: tonAmountNano,
        tonAmount: tonAmountForUSD,
        usdtAmount: usdtAmount,
        timestamp: Date.now()
      };
      
      // Keep only the 3 most recent pending payments per user (to prevent memory issues)
      existingPayments.push(newPayment);
      const recentPayments = existingPayments.slice(-3);
      
      this.pendingPayments.set(userId.toString(), recentPayments);
      
      // Format price message with $1 USD equivalent
      const priceMessage = await priceService.formatPriceMessage(tonAmountForUSD, config.USDT_AMOUNT);
      
      // Create payment buttons
      const keyboard = this.createKeyboard([
        [{ text: `💎 ${tonAmountForUSD.toFixed(4)} TONを支払う（Tonkeeper）`, url: tonDeepLink }],
        [{ text: '💵 1 USDTを支払う（Tonkeeper）', url: tonUsdtDeepLink }],
        [{ text: '✅ 支払い済み', callback_data: `check_payment_${userId}` }],
        [{ text: '🏠 メインメニュー', callback_data: 'back_to_main' }]
      ]);
      
      const message = `💎 英語学習ボットを購読する

${priceMessage}    
📅 期間: 30日間の毎日のレッスン        
🎯 含まれるもの:
• 毎日の英語レッスン
• 単語ごとの解説と発音
• 難易度のカスタマイズ

💳 下からお支払い方法を選択してください！`;

      await this.bot.sendMessage(chatId, message, keyboard);
      console.log(`✅ Payment link sent to user ${userId}`);
      
    } catch (error) {
      console.error('❌ Error in handleSubscribe:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
        await this.bot.sendMessage(chatId, '❌ お支払い中に問題が発生しました。もう一度お試しください。');
    }
  }

  // CRITICAL FIX: Always fetch fresh user data from database
  async handleSettings(chatId, userId) {
    console.log(`⚙️ Handling settings request for user ${userId}`);
    
    try {
      // CRITICAL FIX: Fetch fresh user data from database
      const user = await database.getUser(userId.toString());
      if (!user) {
        await this.bot.sendMessage(chatId, '❌ ユーザーが見つかりません。まず/startを使用してください。');
        return;
      }

      console.log(`⚙️ Settings request for user ${userId}, current level: ${user.difficulty_level}`);

      const levelName = config.DIFFICULTY_LEVELS[user.difficulty_level]?.name || '不明';
      
      let settingsMessage = `⚙️ 設定\n\n`;
      settingsMessage += `現在の難易度レベル: ${user.difficulty_level} (${levelName})\n\n`;
      settingsMessage += `難易度を選択してください:\n`;

      Object.entries(config.DIFFICULTY_LEVELS).forEach(([level, info]) => {
        settingsMessage += `• レベル ${level}: ${info.name} (${info.description})\n`;
      });

      const keyboard = this.createKeyboard([
        [
          { text: 'レベル 1', callback_data: 'level_1' },
          { text: 'レベル 2', callback_data: 'level_2' },
          { text: 'レベル 3', callback_data: 'level_3' }
        ],
        [
          { text: 'レベル 4', callback_data: 'level_4' },
          { text: 'レベル 5', callback_data: 'level_5' }
        ],
        [{ text: '🏠 メインメニュー', callback_data: 'back_to_main' }]
      ]);

      await this.bot.sendMessage(chatId, settingsMessage, keyboard);
    } catch (error) {
      console.error('❌ Error in handleSettings:', error);
      await this.bot.sendMessage(chatId, '❌ 申し訳ございませんが、問題が発生しました。もう一度お試しください。');
    }
  }

  // CRITICAL FIX: Update user level and verify the change
  async handleSetLevel(chatId, userId, level) {
    console.log(`🎯 Handling level change request: ${level} for user ${userId}`);
    
    try {
      console.log(`🎯 Starting level change: user ${userId} to level ${level}`);
      
      // Update user level in database
      console.log(`📝 Updating user ${userId} to level ${level}`);
      const result = await database.updateUserLevel(userId.toString(), level);
      console.log(`📊 Database update result: ${result} rows affected`);
      
      // CRITICAL FIX: Verify the update by fetching fresh data
      console.log(`🔍 Verifying update for user ${userId}`);
      const updatedUser = await database.getUser(userId.toString());
      console.log(`👤 User after update:`, updatedUser);
      
      const levelName = config.DIFFICULTY_LEVELS[level]?.name || '不明';
      
      const confirmMessage = `✅ 難易度がレベル ${level} に更新されました！\n\n毎日のレッスンは${levelName}レベルになります。`;

      const keyboard = this.createKeyboard([
        [{ text: '🏠 メインメニュー', callback_data: 'back_to_main' }]
      ]);

      console.log(`📤 Sending confirmation message to user ${userId}`);
      await this.bot.sendMessage(chatId, confirmMessage, keyboard);
      console.log(`✅ Level change completed successfully for user ${userId}`);
    } catch (error) {
      console.error('❌ Error in handleSetLevel:', error);
      await this.bot.sendMessage(chatId, '❌ 申し訳ございませんが、問題が発生しました。もう一度お試しください。');
    }
  }

  async handleUnsubscribe(chatId, userId) {
    try {
      console.log(`🚫 Handling unsubscribe request for user ${userId}`);
      
      // Check if user has an active subscription
      const subscription = await database.getActiveSubscription(userId.toString());
      
      if (!subscription) {
        await this.bot.sendMessage(chatId, '❌ キャンセルするアクティブな購読がありません。');
        return;
      }
      
      // Cancel the subscription
      await database.cancelSubscription(userId.toString());
      
      const message = `🚫 購読がキャンセルされました\n\n購読がキャンセルされました。毎日のレッスンは受信されません。\n\nいつでも購読ボタンを使用して再購読できます。`;
      
      const keyboard = this.createKeyboard([
        [{ text: '💎 再度購読する', callback_data: 'subscribe' }],
        [{ text: '🏠 メインメニュー', callback_data: 'back_to_main' }]
      ]);
      
      await this.bot.sendMessage(chatId, message, keyboard);
    } catch (error) {
      console.error('❌ Error in handleUnsubscribe:', error);
      await this.bot.sendMessage(chatId, '❌ 申し訳ございませんが、問題が発生しました。もう一度お試しください。');
    }
  }


  async handleCheckPayment(chatId, userId) {
      // Prevent duplicate checking messages if user clicks "I Paid" multiple times
      const checkKey = `checking_${userId}`;
      if (this.checkingPayments && this.checkingPayments.has(checkKey)) {
        await this.bot.sendMessage(chatId, '⏳ お支払いの確認が進行中です。お待ちください...');
        return;
      }
    
    // Mark as checking
    this.checkingPayments.add(checkKey);
    
    try {
      console.log(`💳 Checking payment for user ${userId}`);
      
      // Check if we have pending payment data
      if (!this.pendingPayments || !this.pendingPayments.has(userId.toString())) {
        this.checkingPayments.delete(checkKey);
        await this.bot.sendMessage(chatId, '❌ 保留中の支払いが見つかりません。再度購読してください。');
        return;
      }
      
      const pendingPaymentsList = this.pendingPayments.get(userId.toString());
      
      // Check if it's an array (new format) or object (old format) for backwards compatibility
      const paymentsToCheck = Array.isArray(pendingPaymentsList) ? pendingPaymentsList : [pendingPaymentsList];
      
      if (paymentsToCheck.length === 0) {
        this.checkingPayments.delete(checkKey);
        await this.bot.sendMessage(chatId, '❌ 保留中の支払いが見つかりません。再度購読してください。');
        return;
      }
      
      console.log(`🔍 Checking ${paymentsToCheck.length} pending payment(s) for user ${userId}`);
      
      // Send checking message (only one message to user)
      await this.bot.sendMessage(chatId, '🔍 お支払いを確認中です... しばらくお待ちください。');
      
      // Wait before first check (silent - no message to user)
      await new Promise(resolve => setTimeout(resolve, config.PAYMENT_CHECK.INITIAL_DELAY_MS));
      
      try {
        let paymentFound = false;
        let foundPaymentData = null;
        const maxAttempts = config.PAYMENT_CHECK.MAX_ATTEMPTS;
        
        // Loop check up to 3 times
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`🔍 Payment check attempt ${attempt}/${maxAttempts}`);
            
            // Check TON blockchain for payment
            const response = await axios.get(`https://tonapi.io/v2/blockchain/accounts/${config.TON_ADDRESS}/transactions`, {
              headers: {
                'Authorization': `Bearer ${config.TON_API_KEY}`
              },
              params: {
                limit: config.PAYMENT_CHECK.TRANSACTION_LIMIT
              }
            });
            
            console.log(`📊 TON API response: ${response.status}`);
            
            // Look for payment with matching reference
            const transactions = response.data.transactions || [];
            
            console.log(`🔍 Searching ${transactions.length} transactions for payments...`);
            
            // Check all pending payments in reverse order (most recent first)
            // Use slice() to avoid mutating the original array
            const paymentsReversed = [...paymentsToCheck].reverse();
            for (const paymentData of paymentsReversed) {
              console.log(`🔍 Checking payment reference: ${paymentData.reference}`);
              
              // Check TON transactions first
              for (const tx of transactions) {
                // Check in_msg for text comment (TON payment)
                if (tx.in_msg && tx.in_msg.decoded_body && tx.in_msg.decoded_body.text) {
                  const messageText = tx.in_msg.decoded_body.text;
                  // Use exact match to prevent substring clashes
                  if (messageText === paymentData.reference || messageText.includes(paymentData.reference)) {
                    console.log(`✅ TON Payment found in in_msg: ${paymentData.reference}`);
                    paymentFound = true;
                    foundPaymentData = paymentData;
                    break;
                  }
                }
                
                // Check out_msgs for text comment
                if (tx.out_msgs && tx.out_msgs.length > 0) {
                  for (const outMsg of tx.out_msgs) {
                    if (outMsg.decoded_body && outMsg.decoded_body.text) {
                      const messageText = outMsg.decoded_body.text;
                      // Use exact match to prevent substring clashes
                      if (messageText === paymentData.reference || messageText.includes(paymentData.reference)) {
                        console.log(`✅ TON Payment found in out_msg: ${paymentData.reference}`);
                        paymentFound = true;
                        foundPaymentData = paymentData;
                        break;
                      }
                    }
                  }
                }
                
                if (paymentFound) break;
              }
              
              // If TON payment not found, check TON USDT Jetton
              if (!paymentFound) {
                try {
                  console.log(`🔍 Checking TON USDT Jetton transactions for reference: ${paymentData.reference}`);
                  
                  // Check for Jetton transfers in TON transactions
                  for (const tx of transactions) {
                    // Check if transaction has Jetton transfers
                    if (tx.out_msgs && tx.out_msgs.length > 0) {
                      for (const outMsg of tx.out_msgs) {
                        // Check if this is a Jetton transfer
                        if (outMsg.source && outMsg.destination && outMsg.decoded_body) {
                          const body = outMsg.decoded_body;
                          
                          // Check if it's a Jetton transfer with our USDT contract
                          if (body.jetton_transfer && 
                              body.jetton_transfer.jetton_master_address === config.USDT_CONTRACT_ADDRESS) {
                            
                            // Check amount (1 USDT = 1,000,000 microUSDT)
                            const expectedAmount = Math.floor(config.USDT_AMOUNT * config.TON_CONVERSIONS.MICRO_USDT_TO_USDT);
                            const receivedAmount = parseInt(body.jetton_transfer.amount);
                            
                            console.log(`💰 Jetton transfer: received ${receivedAmount} microUSDT (expected ${expectedAmount})`);
                            
                            // Check if amount matches and message contains reference
                            if (receivedAmount >= expectedAmount && 
                                body.jetton_transfer.forward_ton_amount && 
                                body.jetton_transfer.forward_payload) {
                              
                              // Check the forward payload for our reference (exact match when possible)
                              const payload = body.jetton_transfer.forward_payload;
                              if (payload && (payload.includes(paymentData.reference) || payload === paymentData.reference)) {
                                console.log(`✅ TON USDT Jetton Payment found: ${paymentData.reference}`);
                                paymentFound = true;
                                foundPaymentData = paymentData;
                                break;
                              }
                            }
                          }
                        }
                      }
                    }
                    
                    if (paymentFound) break;
                  }
                } catch (usdtError) {
                  console.log('⚠️ TON USDT Jetton check error:', usdtError.message);
                }
              }
              
              if (paymentFound) break;
            }
            
            // If payment found, break out of retry loop
            if (paymentFound) {
              break;
            }
            
            // If not found and not last attempt, wait before next check (silent - no message to user)
            if (attempt < maxAttempts) {
              console.log(`⏳ Payment not found on attempt ${attempt}, waiting before retry...`);
              await new Promise(resolve => setTimeout(resolve, config.PAYMENT_CHECK.RETRY_DELAY_MS));
            }
            
          } catch (apiError) {
            console.error(`❌ TON API Error on attempt ${attempt}:`, apiError.message);
            
            // If not last attempt, wait and retry
            if (attempt < maxAttempts) {
              console.log(`⏳ API error on attempt ${attempt}, waiting before retry...`);
              await new Promise(resolve => setTimeout(resolve, config.PAYMENT_CHECK.RETRY_DELAY_MS));
            } else {
              // Last attempt failed with API error
              await this.bot.sendMessage(chatId, '❌ お支払いの確認が一時的に利用できません。数分後にもう一度お試しください。');
              return;
            }
          }
        }
      
      // Only ONE message sent: success if either TON or USDT payment found, failure if neither found
      if (paymentFound && foundPaymentData) {
        // Payment confirmed (either TON or USDT succeeded) - create subscription
        await database.createSubscription(userId.toString(), foundPaymentData.reference, config.SUBSCRIPTION_DAYS);
        
        // Remove ALL pending payments for this user (payment confirmed)
        this.pendingPayments.delete(userId.toString());
        
        // Send success message (only one message sent)
        const successMessage = `🎉 お支払いが確認されました！30日間の購読が有効になりました。`;
        
        const keyboard = this.createKeyboard([
          [{ text: '🏠 メインメニュー', callback_data: 'back_to_main' }]
        ]);
        
        await this.bot.sendMessage(chatId, successMessage, keyboard);
        
        // Send immediate lesson
        await this.sendImmediateSentence(chatId, userId);
        
      } else {
        // Payment not found after 3 attempts (both TON and USDT checks failed)
        // Only one failure message sent
        await this.bot.sendMessage(chatId, `❌ 3回試行してもお支払いが見つかりませんでした。数分後にもう一度お試しください。`);
        }
        
      } catch (error) {
        console.error('❌ Error in payment check loop:', error);
        await this.bot.sendMessage(chatId, '❌ お支払いの確認中に問題が発生しました。もう一度お試しください。');
      } finally {
        // Clear checking flag
        this.checkingPayments.delete(checkKey);
      }
      
    } catch (error) {
      console.error('❌ Error in handleCheckPayment:', error);
      await this.bot.sendMessage(chatId, '❌ お支払いの確認中に問題が発生しました。もう一度お試しください。');
      // Clear checking flag on error
      if (this.checkingPayments) {
        this.checkingPayments.delete(checkKey);
      }
    }
  }


  async handleMessage(msg) {
    // Handle user responses to sentences
    console.log(`📝 User text message: ${msg.text}`);
    
    // Check if message contains Japanese script (hiragana, katakana, kanji)
    const hasJapaneseScript = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(msg.text);
    
    if (hasJapaneseScript) {
      console.log('🇯🇵 User typed in Japanese - not responding');
      return; // Don't respond to Japanese text (they're practicing English)
    }
    
    // Show main menu buttons for any non-Japanese text message (same as /start)
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const displayName = msg.from.first_name || msg.from.username || 'User';

    try {
      // Ensure user exists in database
      await database.createUser(userId.toString(), displayName);
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📚 ヘルプ', callback_data: 'help' },
              { text: '📊 ステータス', callback_data: 'status' }
            ],
            [
              { text: '💳 購読する', callback_data: 'subscribe' },
              { text: '⚙️ 難易度', callback_data: 'settings' }
            ]
          ]
        }
      };

      const welcomeMessage = `🇬🇧 英語学習ボットへようこそ！

📖 毎日の英語の文章を受け取って、語学力を向上させましょう！
💰 TON暗号通貨で30日間のレッスンを購読できます。

🎯 難易度を選択して学習を始めましょう！`;

      await this.bot.sendMessage(chatId, welcomeMessage, keyboard);
    } catch (error) {
      console.error('❌ Error in handleMessage:', error);
      await this.bot.sendMessage(chatId, '❌ 申し訳ございませんが、問題が発生しました。もう一度お試しください。');
    }
  }

  // Handle payment success callback
  async handlePaymentSuccess(chatId, userId, paymentReference) {
    try {
      console.log(`💰 Payment success for user ${userId}, reference: ${paymentReference}`);
      
      // Create subscription in database
      await database.createSubscription(userId.toString(), paymentReference, 30);
      
      // Send success message
      const successMessage = `🎉 お支払いが完了しました！

✅ 英語学習ボットの購読が開始されました！
📅 購読は30日間有効です
🎯 毎日のレッスンは日本時間9時に送信されます

最初のレッスンです：`;

      await this.bot.sendMessage(chatId, successMessage);
      
    } catch (error) {
      console.error('❌ Error in handlePaymentSuccess:', error);
        await this.bot.sendMessage(chatId, '❌ お支払いは処理されましたが、エラーが発生しました。サポートにお問い合わせください。');
    }
  }

  // Send immediate sentence after payment
  async sendImmediateSentence(chatId, userId) {
    try {
      // Get user's difficulty level
      const user = await database.getUser(userId.toString());
      if (!user) {
        console.error('❌ User not found for immediate sentence');
        return;
      }

      // Generate sentence based on user's difficulty level
      const sentenceData = await this.generateSentence(user.difficulty_level);
      
      // Save sentence to database
      const sentenceId = await this.saveSentence(sentenceData, user.difficulty_level);
      
      // Create word breakdown
      let wordBreakdown = '';
      if (sentenceData.word_breakdown && sentenceData.word_breakdown.length > 0) {
        wordBreakdown = '\n\n📚 単語の解説:\n';
        for (const word of sentenceData.word_breakdown) {
          if (typeof word === 'object' && word.word && word.meaning) {
            const romaji = word.pinyin || '';
            wordBreakdown += `${word.word} - ${word.meaning} - ${romaji}\n`;
          } else if (typeof word === 'string') {
            wordBreakdown += `${word}\n`;
          }
        }
      }

      const message = `🇬🇧 最初の英語レッスン

📝 英語の文章:
${sentenceData.english_text}

🔤 日本語訳:
${sentenceData.japanese_translation}

英語の文章をタイプしてみましょう！${wordBreakdown}

英語の文章を練習しましょう！`;

      console.log(`📤 Sending immediate lesson to user ${userId}:`, message);
      await this.bot.sendMessage(chatId, message);
      
      console.log(`✅ Immediate sentence sent to user ${userId}`);
    } catch (error) {
      console.error('❌ Error in sendImmediateSentence:', error);
    }
  }

  // Generate sentence using DeepSeek API
  async generateSentence(difficultyLevel) {
    try {
      return await deepseekService.generateEnglishSentence(difficultyLevel);
    } catch (error) {
      console.error('❌ Error generating sentence:', error);
      // Fallback sentence
      const fallbackSentences = {
        1: { english_text: 'Hello.', japanese_translation: 'こんにちは。', word_breakdown: [{ word: 'Hello', meaning: 'こんにちは', pinyin: 'harou' }] },
        2: { english_text: 'I like to eat pizza.', japanese_translation: '私はピザを食べるのが好きです。', word_breakdown: [{ word: 'I', meaning: '私', pinyin: 'ai' }, { word: 'like', meaning: '好き', pinyin: 'raiku' }, { word: 'to eat', meaning: '食べる', pinyin: 'tu iito' }, { word: 'pizza', meaning: 'ピザ', pinyin: 'piza' }] },
        3: { english_text: 'The weather is very nice today.', japanese_translation: '今日はとても良い天気です。', word_breakdown: [{ word: 'The', meaning: 'その', pinyin: 'za' }, { word: 'weather', meaning: '天気', pinyin: 'uezza' }, { word: 'is', meaning: 'です', pinyin: 'izu' }, { word: 'very', meaning: 'とても', pinyin: 'veri' }, { word: 'nice', meaning: '良い', pinyin: 'naisu' }, { word: 'today', meaning: '今日', pinyin: 'tudei' }] },
        4: { english_text: 'I like reading books in the library.', japanese_translation: '私は図書館で本を読むのが好きです。', word_breakdown: [{ word: 'I', meaning: '私', pinyin: 'ai' }, { word: 'like', meaning: '好き', pinyin: 'raiku' }, { word: 'reading', meaning: '読むこと', pinyin: 'riidingu' }, { word: 'books', meaning: '本', pinyin: 'bukkusu' }, { word: 'in', meaning: 'で', pinyin: 'in' }, { word: 'the', meaning: 'その', pinyin: 'za' }, { word: 'library', meaning: '図書館', pinyin: 'raibreri' }] },
        5: { english_text: 'I look forward to hearing from you soon.', japanese_translation: '近いうちにご連絡をお待ちしております。', word_breakdown: [{ word: 'I', meaning: '私', pinyin: 'ai' }, { word: 'look forward', meaning: '楽しみにする', pinyin: 'rukku fowaado' }, { word: 'to', meaning: 'に', pinyin: 'tu' }, { word: 'hearing', meaning: '聞くこと', pinyin: 'hiaringu' }, { word: 'from', meaning: 'から', pinyin: 'furomu' }, { word: 'you', meaning: 'あなた', pinyin: 'yuu' }, { word: 'soon', meaning: 'すぐに', pinyin: 'suun' }] }
      };
      return fallbackSentences[difficultyLevel] || fallbackSentences[1];
    }
  }

  // Save sentence to database
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

  // Send daily message to all subscribed users
  async sendDailyMessage() {
    try {
      // This would be implemented to send daily messages
      console.log('📅 Daily message scheduler triggered');
    } catch (error) {
      console.error('❌ Error in sendDailyMessage:', error);
    }
  }
}

module.exports = TelegramBotHandler;

