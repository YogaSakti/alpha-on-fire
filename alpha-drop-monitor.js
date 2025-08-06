import { TwitterOpenApi } from 'twitter-openapi-typescript';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

// Configuration
const BINANCE_USERNAME = 'binance';
const POLL_INTERVAL = 60000; // 60 seconds
const MAX_TWEETS_TO_CHECK = 10; // Check more tweets for trading opens

const TELEGRAM_CONFIG = {
    channelID: '@',
    botToken: '',
    enabled: true  // Set to false to disable Telegram posting
};

const AIRDROP_FILE = 'airdrop_tweets.json';

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

// Load trading tweets from JSON file
function loadTradingTweets() {
    try {
        if (fs.existsSync(AIRDROP_FILE)) {
            const data = fs.readFileSync(AIRDROP_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('❌ Error loading trading tweets:', error.message);
    }
    return [];
}

// Save trading tweets to JSON file
function saveTradingTweets(tradingTweets) {
    try {
        fs.writeFileSync(AIRDROP_FILE, JSON.stringify(tradingTweets, null, 2));
        console.log('✅ Trading tweets saved to file');
    } catch (error) {
        console.error('❌ Error saving trading tweets:', error.message);
    }
}

// Helper function to convert time to WIB
function convertToWIB(timeString) {
    // Extract time components from various formats
    const utcTimeMatch = timeString.match(/(\d{1,2}):(\d{2})\s*\(UTC\)/i);
    if (utcTimeMatch) {
        const hours = parseInt(utcTimeMatch[1]);
        const minutes = utcTimeMatch[2];
        const wibHours = (hours + 7) % 24; // Add 7 hours for WIB
        return `${wibHours.toString().padStart(2, '0')}:${minutes} (WIB)`;
    }
    
    // If no UTC found, assume it's already in local time and add WIB label
    return timeString.includes('WIB') ? timeString : timeString + ' (WIB)';
}

// Check if tweet is about Alpha trading opening with airdrop
function isAlphaTradingOpenTweet(tweetText) {
    const text = tweetText.toLowerCase();
    
    // Must contain Binance Alpha feature announcement
    const hasAlphaFeature = text.includes('binance alpha is the first platform to feature') ||
                           text.includes('binance alpha will be the first platform to feature');
    
    // Must mention trading opening with time
    const hasTradingOpening = text.includes('trading opening on') && 
                             (text.includes('at ') || text.includes('utc'));
    
    // Must mention airdrop and points
    const hasAirdrop = text.includes('airdrop') && text.includes('tokens') && 
                      text.includes('binance alpha points');
    
    return hasAlphaFeature && hasTradingOpening && hasAirdrop;
}

// Enhanced token extraction for trading tweets with airdrop details
function extractTokenInfo(tweetText) {
    // Look for various patterns in trading tweets
    const patterns = [
        /feature\s+([^(]+)\s*\(([^)]+)\)/i,           // "feature Token Name (SYMBOL)"
        /feature\s+([A-Z]{2,10})\b/i,                 // "feature SYMBOL"
        /\b([A-Z]{2,10})\s+is\s+now\s+available/i,    // "SYMBOL is now available"
        /\b([A-Z]{2,10})\s+trading/i,                 // "SYMBOL trading"
        /trading\s+([A-Z]{2,10})/i,                   // "trading SYMBOL"
        /\(([A-Z]{2,10})\)\s+trading/i,               // "(SYMBOL) trading"
        /alpha.*?([A-Z]{2,10})/i                      // "alpha ... SYMBOL"
    ];
    
    for (const pattern of patterns) {
        const match = tweetText.match(pattern);
        if (match) {
            if (match[2]) {
                // Pattern with both name and symbol
                return {
                    name: match[1].trim(),
                    symbol: match[2].trim()
                };
            } else {
                // Pattern with just symbol
                const symbol = match[1].trim();
                return {
                    name: symbol,
                    symbol: symbol
                };
            }
        }
    }
    
    return null;
}

// Extract comprehensive airdrop information from tweet
function extractAirdropInfo(tweetText) {
    const airdropInfo = {
        token: null,
        tradingTime: null,
        airdropAmount: null,
        pointsDeducted: null,
        phases: [],
        claimWindow: null
    };

    // Extract token information
    const tokenMatch = tweetText.match(/feature\s+([^(]+)\s*\(([^)]+)\)/i);
    if (tokenMatch) {
        airdropInfo.token = {
            name: tokenMatch[1].trim(),
            symbol: tokenMatch[2].trim()
        };
    }

    // Extract trading opening time
    const timeMatch = tweetText.match(/trading opening on (.*?) at (.*?)(?:\.|🌟|Once)/i);
    if (timeMatch) {
        // Clean up the date part (remove trailing comma if present)
        const datePart = timeMatch[1].trim().replace(/,$/, '');
        const timePart = convertToWIB(timeMatch[2].trim());
        airdropInfo.tradingTime = `${datePart} at ${timePart}`;
    }

    // Extract airdrop amount
    const airdropMatch = tweetText.match(/airdrop of\s+(\d+)\s+([A-Z]+)\s+tokens?/i);
    if (airdropMatch) {
        airdropInfo.airdropAmount = {
            amount: parseInt(airdropMatch[1]),
            symbol: airdropMatch[2]
        };
    }

    // Extract claim window
    const claimWindowMatch = tweetText.match(/within\s+(\d+)\s+hours?(?:\s+(?:once trading begins|otherwise|;))/i);
    if (claimWindowMatch) {
        airdropInfo.claimWindow = `${claimWindowMatch[1]} hours`;
    }

    // Extract points deducted
    const pointsMatch = tweetText.match(/claiming the airdrop will consume\s+(\d+)\s+Binance Alpha [Pp]oints/i);
    if (pointsMatch) {
        airdropInfo.pointsDeducted = parseInt(pointsMatch[1]);
    }

    // Extract phases - Check for two-phase structure first
    const phase1Match = tweetText.match(/Phase 1[^:]*:\s*Users with at least\s+(\d+)\s+Binance Alpha Points[^.]*\.\s*Phase 2[^:]*:\s*Users with at least\s+(\d+)\s+Binance Alpha Points/i);
    if (phase1Match) {
        // Two-phase airdrop
        // Extract phase 1 duration
        const phase1DurationMatch = tweetText.match(/Phase 1\s*\(([^)]+)\)/i);
        const phase1Duration = phase1DurationMatch ? phase1DurationMatch[1] : 'Not specified';

        // Extract phase 2 duration  
        const phase2DurationMatch = tweetText.match(/Phase 2\s*\(([^)]+)\)/i);
        const phase2Duration = phase2DurationMatch ? phase2DurationMatch[1] : 'Not specified';

        airdropInfo.phases = [
            {
                phase: 1,
                duration: phase1Duration,
                minPoints: parseInt(phase1Match[1]),
                type: 'guaranteed'
            },
            {
                phase: 2,
                duration: phase2Duration,
                minPoints: parseInt(phase1Match[2]),
                type: 'first-come-first-served'
            }
        ];

        // Extract dynamic threshold reduction info
        const reductionMatch = tweetText.match(/threshold will automatically decrease by\s+(\d+)\s+points every hour/i);
        if (reductionMatch && airdropInfo.phases[1]) {
            airdropInfo.phases[1].pointReduction = parseInt(reductionMatch[1]);
        }
    } else {
        // Check for single-phase airdrop
        const singlePhaseMatch = tweetText.match(/users with at least\s+(\d+)\s+Binance Alpha Points can claim an airdrop[^.]*on a first-come, first-served basis/i);
        if (singlePhaseMatch) {
            airdropInfo.phases = [
                {
                    phase: 1,
                    duration: 'Until distributed',
                    minPoints: parseInt(singlePhaseMatch[1]),
                    type: 'first-come-first-served'
                }
            ];

            // Extract dynamic threshold reduction info for single phase
            const reductionMatch = tweetText.match(/threshold will automatically decrease by\s+(\d+)\s+points every hour/i);
            if (reductionMatch) {
                airdropInfo.phases[0].pointReduction = parseInt(reductionMatch[1]);
            }
        }
    }

    return airdropInfo;
}

// Format trading open tweet for Telegram with airdrop details
function formatTradingOpenMessage(tradingTweet) {
    const airdropInfo = extractAirdropInfo(tradingTweet.text);
    const tokenInfo = airdropInfo.token || extractTokenInfo(tradingTweet.text);
    const tokenDisplay = tokenInfo ? `*${tokenInfo.name} (${tokenInfo.symbol})*` : '*Alpha Token*';
    
    let message = `🚨 *BINANCE ALPHA AIRDROP ALERT* 🚨\n\n`;
    message += `${tokenDisplay}\n\n`;
    
    // Trading time
    if (airdropInfo.tradingTime) {
        message += `⏰ *Trading Opens:* ${airdropInfo.tradingTime}\n\n`;
    }
    
    // Airdrop amount
    if (airdropInfo.airdropAmount) {
        message += `🎁 *Airdrop:* ${airdropInfo.airdropAmount.amount} ${airdropInfo.airdropAmount.symbol} tokens\n`;
    }
    
    // Claim window
    if (airdropInfo.claimWindow) {
        message += `⏳ *Claim Window:* ${airdropInfo.claimWindow} after trading begins\n`;
    }
    
    // Points deducted
    if (airdropInfo.pointsDeducted) {
        message += `💎 *Points Required:* ${airdropInfo.pointsDeducted} Alpha Points (will be deducted)\n\n`;
    }
    
    // Phases
    if (airdropInfo.phases && airdropInfo.phases.length > 0) {
        message += `� *Airdrop Phases:*\n`;
        airdropInfo.phases.forEach(phase => {
            message += `\n🔸 *Phase ${phase.phase}* (${phase.duration})\n`;
            message += `   • Min Points: ${phase.minPoints}\n`;
            message += `   • Type: ${phase.type}\n`;
            if (phase.pointReduction) {
                message += `   • Auto reduction: -${phase.pointReduction} points/hour if not fully claimed\n`;
            }
        });
        message += `\n`;
    }
    
    return { 
        text: message.trim(), 
        url: tradingTweet.url, 
        stats: { 
            likes: tradingTweet.favorite_count, 
            retweets: tradingTweet.retweet_count 
        } 
    };
}

// Send message to Telegram
async function sendToTelegram(tweet) {
    if (!TELEGRAM_CONFIG.enabled) {
        console.log('📴 Telegram posting disabled - skipping message');
        return { success: false, disabled: true };
    }
    
    if (!telegramBot) {
        console.log('❌ Telegram bot not initialized');
        return { success: false };
    }
    
    try {
        const messageData = formatTradingOpenMessage(tweet);
        let options = { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: `💖 ${messageData.stats.likes} | 🔄 ${messageData.stats.retweets}`,
                        url: messageData.url
                    }
                ]]
            }
        };
        
        const sentMessage = await telegramBot.sendMessage(TELEGRAM_CONFIG.channelID, messageData.text, options);
        
        console.log(`📤 Trading open tweet sent to Telegram successfully`);
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

// Get user tweets (same as main file)
async function getUserTweets(api, username) {
    try {
        const client = await api.getGuestClient();
        
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

        console.log(`📱 Fetching tweets for user ID: ${userId}...`);
        const tweetsResponse = await client.getTweetApi().getUserTweets({ 
            userId: userId,
            count: MAX_TWEETS_TO_CHECK 
        });

        if (!tweetsResponse?.data?.data) {
            console.log('❌ No tweets data received');
            return [];
        }

        const tweetItems = Object.values(tweetsResponse.data.data);
        
        const tweets = tweetItems
            .filter(item => item?.tweet && item?.user)
            .map(item => {
                const tweet = item.tweet;
                const user = item.user;
                
                if (tweet.legacy && user.legacy) {
                    // Get tweet text - prefer noteTweet if expandable, otherwise use legacy
                    let tweetText = tweet.legacy.fullText;
                    if (tweet.noteTweet?.isExpandable === true && 
                        tweet.noteTweet?.noteTweetResults?.result?.text) {
                        tweetText = tweet.noteTweet.noteTweetResults.result.text;
                    }
                    
                    return {
                        id: tweet.restId,
                        text: tweetText,
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

// Process trading open tweets
async function processTradingOpenTweets(tweets) {
    const tradingTweets = loadTradingTweets();
    const newTradingTweets = [];
    
    for (const tweet of tweets) {
        // Check if already processed
        const alreadyProcessed = tradingTweets.some(processed => processed.id === tweet.id);
        if (alreadyProcessed) {
            console.log(`⏭️  Trading tweet already processed: ${tweet.id}`);
            continue;
        }
        
        // Check if it's a trading open tweet
        if (isAlphaTradingOpenTweet(tweet.text)) {
            newTradingTweets.push(tweet);
            continue;
        }
        
        console.log(`⏭️  Skipping non-trading tweet: "${tweet.text.substring(0, 50)}..."`);
    }
    
    if (newTradingTweets.length === 0) {
        console.log('💤 No new Alpha airdrop tweets to process');
        return;
    }
    
    console.log(`🎯 Found ${newTradingTweets.length} new Alpha airdrop tweet(s)!`);
    
    // Process airdrop tweets
    for (const tweet of newTradingTweets.reverse()) { // Oldest first
        console.log('\n� NEW ALPHA AIRDROP TWEET FROM @' + tweet.screen_name.toUpperCase() + ' �');
        
        // Extract airdrop information
        const airdropInfo = extractAirdropInfo(tweet.text);
        // console.log('📊 Extracted airdrop data:', airdropInfo);
        
        const tokenInfo = airdropInfo.token || extractTokenInfo(tweet.text);
        if (tokenInfo) {
            console.log('🪙 Token:', `${tokenInfo.name} (${tokenInfo.symbol})`);
        }
        
        // console.log('📝 Text:', tweet.text);
        console.log('🕐 Time:', new Date(tweet.created_at).toLocaleString());
        console.log('💖 Likes:', tweet.favorite_count);
        console.log('🔄 Retweets:', tweet.retweet_count);
        console.log('🔗 URL:', tweet.url);
        console.log('─'.repeat(80));
        
        // Send to Telegram
        const result = await sendToTelegram(tweet);
        
        // Save to trading tweets with airdrop data
        const tweetData = {
            id: tweet.id,
            text: tweet.text,
            created_at: tweet.created_at,
            screen_name: tweet.screen_name,
            url: tweet.url,
            type: 'airdrop_announcement',
            posted_to_telegram: result.success || result.disabled === true,
            telegram_message_id: result.message_id,
            processed_at: new Date().toISOString(),
            token_info: tokenInfo,
            airdrop_info: airdropInfo
        };
        
        tradingTweets.push(tweetData);
        console.log(`✅ Alpha airdrop tweet ${tweet.id} processed`);
    }
    
    // Save updated trading tweets list
    if (newTradingTweets.length > 0) {
        saveTradingTweets(tradingTweets);
    }
}

// Main monitoring function
async function monitorTradingTweets() {
    console.log(`� Starting Binance Alpha AIRDROP monitor for @${BINANCE_USERNAME}`);
    console.log(`⏱️  Checking every ${POLL_INTERVAL/1000} seconds`);
    console.log(`📤 Telegram posting: ${TELEGRAM_CONFIG.enabled ? `enabled - ${TELEGRAM_CONFIG.channelID}` : 'disabled'}`);
    console.log(`📊 Checking ${MAX_TWEETS_TO_CHECK} recent tweets per cycle`);
    console.log('─'.repeat(80));

    // Initialize Telegram bot
    const telegramReady = initTelegramBot();
    if (!telegramReady && TELEGRAM_CONFIG.enabled) {
        console.log('⚠️  Continuing without Telegram integration');
    }

    const api = new TwitterOpenApi();

    // Load existing data
    const tradingTweets = loadTradingTweets();
    console.log(`📋 Loaded ${tradingTweets.length} trading tweets`);

    // Initial fetch to set baseline
    const initialTweets = await getUserTweets(api, BINANCE_USERNAME);
    if (initialTweets.length > 0) {
        lastCheckedTweetId = initialTweets[0].id;
        console.log(`✅ Baseline set. Latest tweet ID: ${lastCheckedTweetId}`);
        console.log(`📊 Found ${initialTweets.length} recent tweets`);
        
        // Check if any initial tweets are new trading tweets
        console.log('🔍 Checking initial tweets for new trading open content...');
        await processTradingOpenTweets(initialTweets);
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
            
            // Process new tweets for trading opens
            await processTradingOpenTweets(newTweets);
            
            // Update last checked tweet ID
            lastCheckedTweetId = tweets[0].id;
        } else {
            console.log('💤 No new tweets');
        }
    }, POLL_INTERVAL);
}

// Start monitoring
monitorTradingTweets().catch(console.error);
