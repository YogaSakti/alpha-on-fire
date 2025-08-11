import { TwitterOpenApi } from 'twitter-openapi-typescript';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

// Configuration
const BINANCE_USERNAME = 'BinanceWallet';
const POLL_INTERVAL = 60000 * 5; // 5 minutes
const MAX_TWEETS_TO_CHECK = 10; // Chenk more tweets for trading opens

const EXTRA_SEARCH = 'Binance Alpha Points';

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

// Helper: parse "... at HH:MM (TZ)" from tradingTime string
function parseTimeAndZone(tradingTimeString) {
    const match = tradingTimeString.match(/at\s+(\d{1,2}:\d{2})\s*\(([^)]+)\)/i);
    if (!match) return null;
    return { time: match[1], zone: match[2] };
}

// Helper: add hours to HH:MM (24h), return HH:MM
function addHoursToTime(baseTime, hoursToAdd) {
    const [hh, mm] = baseTime.split(':').map(n => parseInt(n, 10));
    const totalMinutes = (hh * 60 + mm + (hoursToAdd * 60)) % (24 * 60);
    const norm = totalMinutes < 0 ? totalMinutes + 24 * 60 : totalMinutes;
    const nh = Math.floor(norm / 60);
    const nm = norm % 60;
    return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
}

// Check if tweet is about Alpha trading opening with airdrop
function isAlphaTradingOpenTweet(tweetText) {
    const text = tweetText.toLowerCase();
    
    // Must contain Binance Alpha feature announcement
    const hasAlphaFeature = text.includes('binance alpha is the first platform to feature') ||
                           text.includes('binance alpha will be the first platform to feature');
    // Or a direct now-live announcement
    const hasNowLive = /\b([^(\n]+)?\s*\([A-Z]{2,10}\)\s+is\s+now\s+live\s+on\s+binance\s+alpha\b/i.test(tweetText) ||
                       /\b([A-Z]{2,10})\s+is\s+now\s+live\s+on\s+binance\s+alpha\b/i.test(tweetText);
    
    // Must mention trading opening with time
    const hasTradingOpening = (text.includes('trading opening on') || text.includes('trade opens on')) && 
                             (text.includes('at ') || text.includes('utc'));
    
    // Must mention airdrop and points
    const hasAirdrop = text.includes('airdrop') && text.includes('tokens') && 
                      text.includes('binance alpha points');
    
    // Accept either classic feature+time format or now-live format
    return (((hasAlphaFeature && hasTradingOpening) || hasNowLive) && hasAirdrop);
}

// Enhanced token extraction for trading tweets with airdrop details
function extractTokenInfo(tweetText) {
    // Look for various patterns in trading tweets
    const patterns = [
        /([^()]+)\s*\(([^)]+)\)\s+is\s+now\s+live/i,    // "Name (SYMBOL) is now live"
        /feature\s+([^(]+)\s*\(([^)]+)\)/i,           // "feature Token Name (SYMBOL)"
        /feature\s+([A-Z]{2,10})\b/i,                 // "feature SYMBOL"
        /\b([A-Z]{2,10})\s+is\s+now\s+live/i,          // "SYMBOL is now live"
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
    let tokenMatch = tweetText.match(/feature\s+([^(]+)\s*\(([^)]+)\)/i);
    if (!tokenMatch) {
        tokenMatch = tweetText.match(/([^()]+)\s*\(([^)]+)\)\s+is\s+now\s+live/i);
    }
    if (tokenMatch) {
        airdropInfo.token = {
            name: tokenMatch[1].trim(),
            symbol: tokenMatch[2].trim()
        };
    }

    // Extract trading opening time - handle both "trading opening on" and "Trade Opens on" formats
    let timeMatch = tweetText.match(/trading opening on (.*?) at (.*?)(?:\.|🌟|Once)/i);
    if (!timeMatch) {
        // Try the new format: "Trade Opens on DATE TIME (UTC)"
        timeMatch = tweetText.match(/trade opens on\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*\(UTC\)/i);
        if (timeMatch) {
            const datePart = timeMatch[1].trim();
            const timePart = convertToWIB(timeMatch[2].trim() + ' (UTC)');
            airdropInfo.tradingTime = `${datePart} at ${timePart}`;
        }
    } else {
        // Handle old format
        const datePart = timeMatch[1].trim().replace(/,$/, '');
        const timePart = convertToWIB(timeMatch[2].trim());
        airdropInfo.tradingTime = `${datePart} at ${timePart}`;
    }

    // Extract airdrop amount
    const airdropMatch = tweetText.match(/airdrop of\s+([\d,]+)\s+([A-Z]+)\s+tokens?/i);
    if (airdropMatch) {
        airdropInfo.airdropAmount = {
            amount: parseInt(airdropMatch[1].replace(/,/g, '')),
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
        message += `🎁 *Airdrop:* ${airdropInfo.airdropAmount.amount} ${airdropInfo.airdropAmount.symbol}\n`;
    }
    
    // Claim window
    if (airdropInfo.claimWindow) {
        message += `⏳ *Claim Window:* within ${airdropInfo.claimWindow} once trading begins\n`;
    }
    
    // Points deducted
    if (airdropInfo.pointsDeducted) {
        message += `💎 *Points Required:* ${airdropInfo.pointsDeducted} Alpha Points\n\n`;
    }
    
    // Phases
    if (airdropInfo.phases && airdropInfo.phases.length > 0) {
        message += `🌟 *Airdrop Phases:*\n`;
        // Precompute time ranges if trading time exists
        let phaseTimeRanges = {};
        if (airdropInfo.tradingTime) {
            const tzInfo = parseTimeAndZone(airdropInfo.tradingTime);
            if (tzInfo) {
                // Try to parse explicit hours from durations
                const parseHours = (durationStr) => {
                    const m = durationStr && durationStr.match(/(\d+)\s*hours?/i);
                    return m ? parseInt(m[1], 10) : null;
                };
                const claimWindowMatch = (airdropInfo.claimWindow || '').match(/(\d+)\s*hours?/i);
                const claimWindowHours = claimWindowMatch ? parseInt(claimWindowMatch[1], 10) : null;

                const phase1 = airdropInfo.phases.find(p => p.phase === 1);
                const phase2 = airdropInfo.phases.find(p => p.phase === 2);

                const startTime = tzInfo.time;
                const phase1Hours = phase1 ? parseHours(phase1.duration) : null;
                if (phase1) {
                    if (phase1Hours != null) {
                        const end1 = addHoursToTime(startTime, phase1Hours);
                        phaseTimeRanges[1] = { start: startTime, end: end1, zone: tzInfo.zone };
                    } else if (!phase2 && claimWindowHours != null) {
                        // Single phase without explicit duration: use claim window if available
                        const end1 = addHoursToTime(startTime, claimWindowHours);
                        phaseTimeRanges[1] = { start: startTime, end: end1, zone: tzInfo.zone };
                    } else {
                        // Fallback: show start time even if we cannot compute end time
                        phaseTimeRanges[1] = { start: startTime, end: null, zone: tzInfo.zone };
                    }
                }

                if (phase2) {
                    const phase2Hours = parseHours(phase2.duration);
                    if (phase1Hours != null) {
                        const start2 = addHoursToTime(startTime, phase1Hours);
                        const end2 = phase2Hours != null
                            ? addHoursToTime(start2, phase2Hours)
                            : (claimWindowHours != null ? addHoursToTime(startTime, claimWindowHours) : null);
                        if (end2) {
                            phaseTimeRanges[2] = { start: start2, end: end2, zone: tzInfo.zone };
                        }
                    }
                }
            }
        }

        airdropInfo.phases.forEach(phase => {
            message += `\n🔸 *Phase ${phase.phase}* (${phase.duration})\n`;
            if (phaseTimeRanges[phase.phase]) {
                const pr = phaseTimeRanges[phase.phase];
                if (phase.type === 'first-come-first-served' || !pr.end) {
                    message += `• Time: ${pr.start} (${pr.zone})\n`;
                } else {
                    message += `• Time: ${pr.start} - ${pr.end} (${pr.zone})\n`;
                }
            }
            message += `• Min Points: ${phase.minPoints}\n`;
            message += `• Type: ${phase.type}\n`;
            if (phase.pointReduction) {
                message += `• Auto reduction: -${phase.pointReduction} points/hour\n`;
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

// get user cookie on cookies.json 
async function getUserCookie() {
    try {
        console.log('🍪 Loading cookies...');
        const data = fs.readFileSync('cookies.json', 'utf-8');
        const parsed = JSON.parse(data);
        const cookie = Object.fromEntries(
            parsed.filter((e) => ['.twitter.com', '.x.com'].includes(e.domain)).map((e) => [e.name, e.value]),
        );

        return cookie;
    } catch (error) {
        console.error('❌ Error loading cookies:', error.message);
        return [];
    }
}

// Get user tweets (same as main file)
async function getUserTweets(api, username, extraSearch = EXTRA_SEARCH) {
    try {
        const cookies = await getUserCookie();
        let client;

        if (!cookies.auth_token && !cookies.ct0) {
            console.log('🔍 Using guest client');
            client = await api.getGuestClient();
        } else {
            console.log('🔍 Using cookies to authenticate');
            client = await api.getClientFromCookies(cookies);
        }
        
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
        const tweetsResponse = await client.getTweetApi().getSearchTimeline({
            rawQuery: `(from:${username}) ${extraSearch}`,
            product: 'Latest',
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
        console.error('❌ Error fetching tweets:', error);
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

        // previewText no newline
        const previewText = tweet.text.replace(/\n/g, ' ').substring(0, 50);
        
        console.log(`⏭️  Skipping non-trading tweet: "${previewText}..."`);
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
        
        // Skip if a tweet for this token symbol has already been sent to Telegram
        const normalizedSymbol = tokenInfo?.symbol ? tokenInfo.symbol.trim().toUpperCase() : null;
        if (normalizedSymbol) {
            const alreadySentForSymbol = tradingTweets.some(entry => {
                const existingSymbol = (entry?.token_info?.symbol || entry?.airdrop_info?.token?.symbol || '').trim().toUpperCase();
                return existingSymbol === normalizedSymbol && entry?.posted_to_telegram === true;
            });
            if (alreadySentForSymbol) {
                console.log(`⏭️  Airdrop tweet for token ${normalizedSymbol} already sent to Telegram. Skipping.`);
                continue;
            }
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
    api.setAdditionalApiHeaders({
        'sec-ch-ua-platform': '"Windows"',
    });

    api.setAdditionalApiHeaders({
        'sec-ch-ua-platform': '"Windows"',
    });

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
