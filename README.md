# Binance Alpha Airdrop Monitor

A specialized Node.js bot that monitors Binance's Twitter account for Binance Alpha airdrop announcements and automatically forwards them to a Telegram channel with comprehensive airdrop data extraction.

## Features

- 🎁 **Airdrop-Focused Monitoring**: Specifically monitors for Binance Alpha airdrop announcements  
- 🧠 **Smart Data Extraction**: Automatically extracts token info, trading times, airdrop amounts, phases, and point requirements
- 📱 **Rich Telegram Alerts**: Sends beautifully formatted messages with inline buttons  
- 🌏 **WIB Timezone**: All times displayed in Jakarta timezone (WIB) for Indonesian users
- 💾 **Persistent Storage**: Tracks processed tweets with comprehensive airdrop data
- ⚡ **Real-time Processing**: 60-second monitoring intervals for immediate notifications
- 🔄 **Phase Detection**: Supports both single-phase and two-phase airdrop structures

## How It Works

The bot specifically monitors for Binance Alpha airdrop announcement tweets with the pattern:
- "Binance Alpha is the first platform to feature [Token] ([SYMBOL]), with Alpha trading opening on..."
- Must include airdrop information and Binance Alpha Points requirements
- Extracts comprehensive data including phases, point thresholds, and time windows

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn  
- Twitter API access (guest mode - no authentication required)
- Telegram Bot Token
- Telegram Channel ID

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd alpha-on-fire
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure the bot**
   
   Edit the configuration section in `alpha-drop-monitor.js`:
   ```javascript
   const TELEGRAM_CONFIG = {
       channelID: '@your_channel_id',
       botToken: 'your_bot_token_here',
       enabled: true  // Set to false to disable Telegram posting
   };
   ```

## Configuration

### Telegram Setup

1. **Create a Telegram Bot**:
   - Message @BotFather on Telegram
   - Create a new bot with `/newbot`
   - Get your bot token

2. **Set up Channel**:
   - Create a Telegram channel
   - Add your bot as an administrator
   - Get the channel ID (usually starts with @)

3. **Update Configuration**:
   ```javascript
   const TELEGRAM_CONFIG = {
       channelID: '@your_channel_name',
       botToken: 'your_bot_token',
       enabled: true  // Set to false to disable Telegram posting
   };
   ```

### Advanced Configuration

You can modify these settings in `alpha-drop-monitor.js`:

```javascript
const BINANCE_USERNAME = 'binance';          // Twitter account to monitor
const POLL_INTERVAL = 60000;                // Check interval (milliseconds)
const MAX_TWEETS_TO_CHECK = 10;             // Number of recent tweets to check
```

### Telegram Configuration Options

- **`enabled`**: Set to `false` to disable Telegram posting while keeping monitoring active (useful for testing)
- **`channelID`**: Your Telegram channel ID (e.g., `@your_channel`)
- **`botToken`**: Your Telegram bot token from @BotFather

When `enabled` is set to `false`:
- The bot will continue monitoring Twitter
- All tweets will be logged to console
- Tweets will be marked as processed to avoid duplicates
- No messages will be sent to Telegram

## Usage

1. **Start the airdrop monitor**
   ```bash
   node alpha-drop-monitor.js
   ```

2. **Monitor the console output**
   - The bot will display airdrop detection status and extracted data
   - Successfully sent messages will show Telegram message IDs
   - Extracted airdrop information will be logged for each detected tweet

3. **Check your Telegram channel**
   - New Binance Alpha airdrop announcements will appear with rich formatting
   - Interactive buttons link directly to the original tweets
   - All times displayed in Jakarta timezone (WIB)

## Airdrop Data Extraction

The bot automatically extracts the following information from airdrop tweets:

### Single-Phase Airdrops
- **Token Info**: Name and symbol
- **Trading Time**: Converted to WIB timezone  
- **Airdrop Amount**: Number of tokens
- **Points Required**: Alpha Points needed (will be deducted)
- **Claim Window**: Time limit to claim airdrop
- **Point Reduction**: Auto-reduction rate if not fully claimed

### Two-Phase Airdrops
- **Phase 1**: Guaranteed allocation with higher point requirement
- **Phase 2**: First-come-first-served with lower point requirement
- **Duration**: Time allocation for each phase
- **Thresholds**: Different point requirements per phase

## File Structure

```
├── alpha-drop-monitor.js    # Main airdrop monitoring bot
├── index.js                 # General Alpha monitoring (legacy)
├── package.json             # Dependencies and scripts
├── airdrop_tweets.json      # Persistent storage for airdrop data
├── posted_tweets.json       # Storage for general announcements
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## Message Format

### Airdrop Alert Format
```
🚨 BINANCE ALPHA AIRDROP ALERT 🚨

*Token Name (SYMBOL)*

⏰ Trading Opens: Aug 5th, 2025 at 19:30 (WIB)

🎁 Airdrop: 500 SUP tokens
⏳ Claim Window: 24 hours after trading begins  
� Points Required: 15 Alpha Points (will be deducted)

📋 Airdrop Phases:

🔸 Phase 1 (First 18 hours)
   • Min Points: 230
   • Type: guaranteed

🔸 Phase 2 (Last 6 hours)  
   • Min Points: 200
   • Type: first-come-first-served
   • Auto reduction: -15 points/hour if not fully claimed

[📅 8/5/2025, 7:53:30 PM (WIB) | 💖 589 | 🔄 124] ← Interactive Button
```

## Data Storage

The bot stores processed airdrop tweets in `airdrop_tweets.json` with comprehensive data structure:

```json
{
  "id": "tweet_id",
  "text": "tweet_content", 
  "created_at": "timestamp",
  "screen_name": "binance",
  "url": "tweet_url",
  "type": "airdrop_announcement",
  "posted_to_telegram": true,
  "telegram_message_id": 12345,
  "processed_at": "iso_timestamp",
  "token_info": {
    "name": "Token Name",
    "symbol": "SYMBOL"
  },
  "airdrop_info": {
    "token": { "name": "Token Name", "symbol": "SYMBOL" },
    "tradingTime": "Aug 5th, 2025 at 19:30 (WIB)",
    "airdropAmount": { "amount": 500, "symbol": "SYMBOL" },
    "pointsDeducted": 15,
    "claimWindow": "24 hours",
    "phases": [
      {
        "phase": 1,
        "duration": "First 18 hours", 
        "minPoints": 230,
        "type": "guaranteed"
      },
      {
        "phase": 2,
        "duration": "Last 6 hours",
        "minPoints": 200,
        "type": "first-come-first-served",
        "pointReduction": 15
      }
    ]
  }
}
```

## WIB Timezone Conversion

All times are automatically converted to Jakarta timezone (WIB = UTC+7):

| UTC Time | WIB Time |
|----------|----------|
| 10:00 (UTC) | 17:00 (WIB) |
| 12:30 (UTC) | 19:30 (WIB) |
| 15:00 (UTC) | 22:00 (WIB) |
| 23:30 (UTC) | 06:30 (WIB) |

## Error Handling

- **Twitter API Errors**: The bot continues running and retries on the next interval
- **Telegram Errors**: Messages are logged but the bot continues monitoring
- **File System Errors**: Posted tweets tracking continues in memory

## Rate Limiting

The bot includes built-in rate limiting:
- 60-second intervals between checks (configurable)
- Limited number of tweets checked per request
- Graceful handling of API rate limits

## Development

### Airdrop Detection Patterns

The bot detects airdrops using these criteria:

1. **Must contain**: "Binance Alpha is the first platform to feature"
2. **Must mention**: "trading opening on" with time information  
3. **Must include**: "airdrop", "tokens", and "Binance Alpha Points"

### Adding New Airdrop Patterns

To support additional airdrop formats:

1. Update the detection function:
   ```javascript
   function isAlphaTradingOpenTweet(tweetText) {
       // Add new pattern detection
   }
   ```

2. Extend the extraction function:
   ```javascript
   function extractAirdropInfo(tweetText) {
       // Add new data extraction patterns
   }
   ```

3. Update message formatting if needed

### Testing Airdrop Extraction

Test the extraction with sample tweets:

```bash
node -e "
const tweetText = 'Your sample airdrop tweet...';
// Test extraction functions
"
```

## Troubleshooting

### Common Issues

1. **No airdrop tweets detected**
   - Verify the tweet contains all required keywords
   - Check airdrop detection patterns in console output
   - Ensure tweets mention "Binance Alpha Points"

2. **Bot not sending to Telegram**
   - Verify bot token is correct
   - Ensure bot is added as admin to the channel
   - Check channel ID format (should start with @)

3. **Incomplete data extraction**
   - Check console for "Extracted airdrop data" logs
   - Verify tweet format matches expected patterns
   - Review extraction functions for new formats

4. **Timezone issues**
   - All times should show (WIB) suffix
   - Trading times should be UTC+7 from original
   - Button dates should be in Jakarta timezone

### Debug Mode

Enable verbose logging for troubleshooting:

```javascript
const POLL_INTERVAL = 10000; // 10 seconds for testing
// Add console.log statements to extraction functions
```

### Data Validation

Check stored airdrop data:

```bash
# View processed airdrops
cat airdrop_tweets.json | jq '.[] | {token: .token_info, phases: .airdrop_info.phases}'
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License - see package.json for details

## Disclaimer

This airdrop monitor is for educational and personal use. Ensure you comply with:
- Twitter's Terms of Service
- Telegram's Bot API Terms  
- Any relevant data protection regulations
- Binance's Terms of Service

**Important Notes:**
- This bot only monitors public tweets and does not guarantee airdrop availability
- Always verify airdrop details on official Binance Alpha platform
- Monitor responsibly and respect API rate limits
- Airdrop participation requires meeting Binance Alpha Points requirements

Use at your own discretion and always do your own research before participating in any airdrops.
