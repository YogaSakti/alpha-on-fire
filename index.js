import { TwitterOpenApi } from 'twitter-openapi-typescript';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

// Configuration
const BINANCE_USERNAME = 'binance';
const POLL_INTERVAL = 60000; // 60 seconds - reduced frequency to avoid rate limits
const MAX_TWEETS_TO_CHECK = 5; // Reduced to avoid overwhelming the API

const TELEGRAM_CONFIG = {
    channelID: '@',
    botToken: '',
    enabled: false  // Set to false to disable Telegram posting
};

const POSTED_TWEETS_FILE = 'posted_tweets.json';

let lastCheckedTweetId = null;
let telegramBot = null;

// Initialize Telegram bot
function initTelegramBot() {
    if (!TELEGRAM_CONFIG.enabled) {
        console.log('📴 Telegram integration disabled');
        return false;
    }
    
    try {
        telegramBot = new TelegramBot(TELEGRAM_CONFIG.botToken, { polling: false });
        console.log('✅ Telegram bot initialized');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize Telegram bot:', error.message);
        return false;
    }
}

// Load posted tweets from JSON file
function loadPostedTweets() {
    try {
        if (fs.existsSync(POSTED_TWEETS_FILE)) {
            const data = fs.readFileSync(POSTED_TWEETS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('❌ Error loading posted tweets:', error.message);
    }
    return [];
}

// Save posted tweets to JSON file
function savePostedTweets(postedTweets) {
    try {
        fs.writeFileSync(POSTED_TWEETS_FILE, JSON.stringify(postedTweets, null, 2));
        console.log('✅ Posted tweets saved to file');
    } catch (error) {
        console.error('❌ Error saving posted tweets:', error.message);
    }
}

// Check if tweet is about Binance Alpha
function isBinanceAlphaTweet(tweetText) {
    // Only look for the specific pattern: "Binance Alpha will be the first platform"
    const requiredPattern = 'binance alpha will be the first platform';
    
    const text = tweetText.toLowerCase();
    return text.includes(requiredPattern);
}

// Check if tweet is about Alpha trading opening
function isAlphaTradingOpenTweet(tweetText) {
    const tradingOpenPattern = 'binance alpha is the first platform to feature';
    const text = tweetText.toLowerCase();
    return text.includes(tradingOpenPattern) && text.includes('trading opening');
}

// Find matching announcement tweet for a trading open tweet
function findMatchingAnnouncementTweet(tradingTweet, postedTweets) {
    const tradingTokenInfo = extractTokenInfo(tradingTweet.text);
    if (!tradingTokenInfo) return null;
    
    // Look for a previously posted announcement tweet with the same token
    return postedTweets.find(posted => {
        const announcementTokenInfo = extractTokenInfo(posted.text);
        return announcementTokenInfo && 
               (announcementTokenInfo.symbol === tradingTokenInfo.symbol ||
                announcementTokenInfo.name === tradingTokenInfo.name);
    });
}

// Extract token information from tweet
function extractTokenInfo(tweetText) {
    // Look for patterns like "feature TokenName (SYMBOL)" or "feature SYMBOL"
    const patterns = [
        /feature\s+([^(]+)\s*\(([^)]+)\)/i,  // "feature Token Name (SYMBOL)"
        /feature\s+([A-Z]+)/i                // "feature SYMBOL"
    ];
    
    for (const pattern of patterns) {
        const match = tweetText.match(pattern);
        if (match) {
            if (match[2]) {
                return {
                    name: match[1].trim(),
                    symbol: match[2].trim()
                };
            } else {
                return {
                    name: match[1].trim(),
                    symbol: match[1].trim()
                };
            }
        }
    }
    
    return null;
}

// Format tweet for Telegram
function formatTelegramMessage(tweet) {
    const tokenInfo = extractTokenInfo(tweet.text);
    const tokenDisplay = tokenInfo ? `*${tokenInfo.name} (${tokenInfo.symbol})*` : '*New Alpha Token*';
    
    // Parse escaped newlines
    const formattedText = tweet.text.replace(/\\n/g, '\n');
    
    return `
🚨 *BINANCE ALPHA ALERT* 🚨

${tokenDisplay}

${formattedText}

🔗 [View Tweet](${tweet.url})
📅 ${new Date(tweet.created_at).toLocaleString()}
💖 ${tweet.favorite_count} | 🔄 ${tweet.retweet_count}
`.trim();
}

// Format trading open tweet with quote of original announcement
function formatTradingOpenMessage(tradingTweet, originalTweet) {
    const tokenInfo = extractTokenInfo(tradingTweet.text);
    const tokenDisplay = tokenInfo ? `*${tokenInfo.name} (${tokenInfo.symbol})*` : '*Alpha Token*';
    
    // Parse escaped newlines in both tweets
    const formattedTradingText = tradingTweet.text.replace(/\\n/g, '\n');
    const formattedOriginalText = originalTweet.text.replace(/\\n/g, '\n');
    
    return `
🚨 *TRADING NOW OPEN* 🚨

${tokenDisplay}

${formattedTradingText}

🔗 [View Trading Tweet](${tradingTweet.url})
📅 ${new Date(tradingTweet.created_at).toLocaleString()}
💖 ${tradingTweet.favorite_count} | 🔄 ${tradingTweet.retweet_count}
`.trim();
}

// Send message to Telegram
async function sendToTelegram(tweet, originalTweet = null, postedTweets = []) {
    if (!TELEGRAM_CONFIG.enabled) {
        console.log('📴 Telegram posting disabled - skipping message');
        return { success: false, disabled: true };
    }
    
    if (!telegramBot) {
        console.log('❌ Telegram bot not initialized');
        return { success: false };
    }
    
    try {
        let message;
        let options = { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        };

        if (originalTweet) {
            // This is a trading open tweet, format with quote and reply to original message
            message = formatTradingOpenMessage(tweet, originalTweet);
            
            // Find the original announcement in posted tweets to get its Telegram message ID
            const originalPostedTweet = postedTweets.find(t => t.id === originalTweet.id);
            if (originalPostedTweet && originalPostedTweet.telegram_message_id) {
                options.reply_to_message_id = originalPostedTweet.telegram_message_id;
                console.log(`📎 Replying to Telegram message ID: ${originalPostedTweet.telegram_message_id}`);
            }
        } else {
            // Regular announcement tweet
            message = formatTelegramMessage(tweet);
        }
        
        const sentMessage = await telegramBot.sendMessage(TELEGRAM_CONFIG.channelID, message, options);
        
        const messageType = originalTweet ? 'Trading open tweet' : 'Tweet';
        console.log(`📤 ${messageType} sent to Telegram successfully`);
        console.log(`📨 Telegram message ID: ${sentMessage.message_id}`);
        
        return { 
            success: true, 
            message_id: sentMessage.message_id 
        };
    } catch (error) {
        console.error('❌ Error sending to Telegram:', error.message);
        return { success: false };
    }
}

async function getUserTweets(api, username) {
  try {
    const client = await api.getGuestClient();
    
    // Get user info first
    console.log(`🔍 Fetching user info for @${username}...`);
    const userResponse = await client.getUserApi().getUserByScreenName({ screenName: username });
    
    const user = userResponse.data?.user;
    
    if (!user) {
      console.log(`❌ User ${username} not found`);
      return [];
    }

    const userId = user.restId;
    const screenName = user.legacy?.screenName;
    
    if (!userId) {
      console.log(`❌ Could not get user ID for @${username}`);
      return [];
    }

    console.log(`✅ Found @${screenName} (ID: ${userId})`);

    // Get user's tweets
    console.log(`📱 Fetching tweets for user ID: ${userId}...`);
    const tweetsResponse = await client.getTweetApi().getUserTweets({ 
      userId: userId,
      count: MAX_TWEETS_TO_CHECK 
    });

    if (!tweetsResponse?.data?.data) {
      console.log('❌ No tweets data received');
      return [];
    }

    // Parse tweets from the response - it's an array of tweet objects
    const tweetItems = Object.values(tweetsResponse.data.data);
    
    const tweets = tweetItems
      .filter(item => item?.tweet && item?.user)
      .map(item => {
        const tweet = item.tweet;
        const user = item.user;
        
        if (tweet.legacy && user.legacy) {
          return {
            id: tweet.restId,
            text: tweet.legacy.fullText,
            created_at: tweet.legacy.createdAt,
            screen_name: user.legacy.screenName,
            retweet_count: tweet.legacy.retweetCount,
            favorite_count: tweet.legacy.favoriteCount,
            url: `https://x.com/${user.legacy.screenName}/status/${tweet.restId}`
          };
        }
        return null;
      })
      .filter(tweet => tweet !== null);

    console.log(`✅ Successfully parsed ${tweets.length} tweets`);
    return tweets;

  } catch (error) {
    console.error('❌ Error fetching tweets:', error.message);
    return [];
  }
}

async function processNewTweets(tweets) {
  const postedTweets = loadPostedTweets();
  const newAlphaTweets = [];
  const newTradingOpenTweets = [];
  
  for (const tweet of tweets) {
    // Check if already processed
    const alreadyPosted = postedTweets.some(posted => posted.id === tweet.id);
    if (alreadyPosted) {
      console.log(`⏭️  Tweet already posted: ${tweet.id}`);
      continue;
    }
    
    // Check if it's a Binance Alpha announcement tweet
    if (isBinanceAlphaTweet(tweet.text)) {
      newAlphaTweets.push(tweet);
      continue;
    }
    
    // Check if it's a trading open tweet
    if (isAlphaTradingOpenTweet(tweet.text)) {
      newTradingOpenTweets.push(tweet);
      continue;
    }
    
    console.log(`⏭️  Skipping non-Alpha tweet: "${tweet.text.substring(0, 50)}..."`);
  }
  
  if (newAlphaTweets.length === 0 && newTradingOpenTweets.length === 0) {
    console.log('💤 No new Binance Alpha tweets to process');
    return;
  }
  
  console.log(`🎯 Found ${newAlphaTweets.length} new Alpha announcement(s) and ${newTradingOpenTweets.length} trading open tweet(s)!`);
  
  // Process announcement tweets first
  for (const tweet of newAlphaTweets.reverse()) { // Oldest first
    console.log('\n🚨 NEW BINANCE ALPHA ANNOUNCEMENT FROM @' + tweet.screen_name.toUpperCase() + ' 🚨');
    
    const tokenInfo = extractTokenInfo(tweet.text);
    if (tokenInfo) {
      console.log('🪙 Token:', `${tokenInfo.name} (${tokenInfo.symbol})`);
    }
    
    console.log('📝 Text:', tweet.text);
    console.log('🕐 Time:', new Date(tweet.created_at).toLocaleString());
    console.log('💖 Likes:', tweet.favorite_count);
    console.log('🔄 Retweets:', tweet.retweet_count);
    console.log('🔗 URL:', tweet.url);
    console.log('─'.repeat(80));
    
    // Send to Telegram
    const result = await sendToTelegram(tweet, null, postedTweets);
    
    // Save to posted tweets
    const tweetData = {
      id: tweet.id,
      text: tweet.text,
      created_at: tweet.created_at,
      screen_name: tweet.screen_name,
      url: tweet.url,
      type: 'announcement',
      posted_to_telegram: result.success || result.disabled === true,
      telegram_message_id: result.message_id,
      processed_at: new Date().toISOString()
    };
    
    postedTweets.push(tweetData);
    console.log(`✅ Announcement tweet ${tweet.id} marked as processed`);
  }
  
  // Process trading open tweets
  for (const tweet of newTradingOpenTweets.reverse()) { // Oldest first
    console.log('\n� TRADING OPEN TWEET FROM @' + tweet.screen_name.toUpperCase() + ' 🔥');
    
    const tokenInfo = extractTokenInfo(tweet.text);
    if (tokenInfo) {
      console.log('🪙 Token:', `${tokenInfo.name} (${tokenInfo.symbol})`);
    }
    
    // Find matching announcement tweet
    const matchingAnnouncement = findMatchingAnnouncementTweet(tweet, postedTweets);
    
    if (matchingAnnouncement) {
      console.log('🔗 Found matching announcement tweet:', matchingAnnouncement.id);
      console.log('📝 Trading Text:', tweet.text);
      console.log('🕐 Time:', new Date(tweet.created_at).toLocaleString());
      console.log('💖 Likes:', tweet.favorite_count);
      console.log('🔄 Retweets:', tweet.retweet_count);
      console.log('🔗 URL:', tweet.url);
      console.log('─'.repeat(80));
      
      // Send to Telegram with quote of original announcement
      const result = await sendToTelegram(tweet, matchingAnnouncement, postedTweets);
      
      // Save to posted tweets
      const tweetData = {
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        screen_name: tweet.screen_name,
        url: tweet.url,
        type: 'trading_open',
        quoted_tweet_id: matchingAnnouncement.id,
        posted_to_telegram: result.success || result.disabled === true,
        telegram_message_id: result.message_id,
        processed_at: new Date().toISOString()
      };
      
      postedTweets.push(tweetData);
      console.log(`✅ Trading open tweet ${tweet.id} marked as processed (quoted ${matchingAnnouncement.id})`);
    } else {
      console.log('⚠️  No matching announcement found for trading open tweet');
      console.log('📝 Text:', tweet.text);
      console.log('─'.repeat(80));
      
      // Still send to Telegram but as a regular tweet
      const result = await sendToTelegram(tweet, null, postedTweets);
      
      const tweetData = {
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        screen_name: tweet.screen_name,
        url: tweet.url,
        type: 'trading_open_orphan',
        posted_to_telegram: result.success || result.disabled === true,
        telegram_message_id: result.message_id,
        processed_at: new Date().toISOString()
      };
      
      postedTweets.push(tweetData);
      console.log(`✅ Orphan trading open tweet ${tweet.id} marked as processed`);
    }
  }
  
  // Save updated posted tweets list
  if (newAlphaTweets.length > 0 || newTradingOpenTweets.length > 0) {
    savePostedTweets(postedTweets);
  }
}

async function monitorTweets() {
  console.log(`🤖 Starting Binance Alpha Twitter monitor for @${BINANCE_USERNAME}`);
  console.log(`⏱️  Checking every ${POLL_INTERVAL/1000} seconds`);
  console.log(`📤 Telegram posting: ${TELEGRAM_CONFIG.enabled ? `enabled - ${TELEGRAM_CONFIG.channelID}` : 'disabled'}`);
  console.log('─'.repeat(80));

  // Initialize Telegram bot
  const telegramReady = initTelegramBot();
  if (!telegramReady && TELEGRAM_CONFIG.enabled) {
    console.log('⚠️  Continuing without Telegram integration');
  }

  const api = new TwitterOpenApi();

  // Load existing posted tweets
  const postedTweets = loadPostedTweets();
  console.log(`📋 Loaded ${postedTweets.length} previously posted tweets`);

  // Initial fetch to set baseline
  const initialTweets = await getUserTweets(api, BINANCE_USERNAME);
  if (initialTweets.length > 0) {
    lastCheckedTweetId = initialTweets[0].id;
    console.log(`✅ Baseline set. Latest tweet ID: ${lastCheckedTweetId}`);
    console.log(`📊 Found ${initialTweets.length} recent tweets`);
    
    // Check if any initial tweets are new Alpha tweets
    console.log('🔍 Checking initial tweets for new Alpha content...');
    await processNewTweets(initialTweets);
  }

  // Start polling
  setInterval(async () => {
    console.log(`🔍 Checking for new tweets... ${new Date().toLocaleTimeString()}`);
    
    const tweets = await getUserTweets(api, BINANCE_USERNAME);
    
    if (tweets.length === 0) {
      console.log('⚠️  No tweets found');
      return;
    }

    // Find new tweets since last check
    const newTweets = [];
    for (const tweet of tweets) {
      if (tweet.id === lastCheckedTweetId) {
        break; // Stop when we reach the last checked tweet
      }
      newTweets.push(tweet);
    }

    if (newTweets.length > 0) {
      console.log(`📨 Found ${newTweets.length} new tweet(s) since last check`);
      
      // Process new tweets (filter for Alpha tweets and send to Telegram)
      await processNewTweets(newTweets);
      
      // Update last checked tweet ID
      lastCheckedTweetId = tweets[0].id;
    } else {
      console.log('💤 No new tweets');
    }
  }, POLL_INTERVAL);
}

// Start monitoring
monitorTweets().catch(console.error);
