# Binance Alpha Twitter Monitor

A Node.js bot that monitors Binance's Twitter account for Binance Alpha announcements and automatically forwards them to a Telegram channel.

## Features

- 🐦 **Real-time Twitter Monitoring**: Continuously monitors @binance for new tweets
- 🎯 **Smart Filtering**: Only processes Binance Alpha-related tweets
- 📱 **Telegram Integration**: Automatically forwards announcements to a Telegram channel
- 💾 **Persistent Storage**: Tracks processed tweets to avoid duplicates
- 🔗 **Smart Linking**: Links trading open tweets with their original announcements
- ⚡ **Rate Limiting**: Built-in delays to respect API limits

## How It Works

The bot monitors two types of Binance Alpha tweets:

1. **Announcement Tweets**: "Binance Alpha will be the first platform..."
2. **Trading Open Tweets**: "Binance Alpha is the first platform to feature... trading opening"

When a trading open tweet is detected, the bot attempts to find and quote the original announcement tweet for context.

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
   
   Edit the configuration section in `index.js`:
   ```javascript
   const TELEGRAM_CONFIG = {
       channelID: '@your_channel_id',
       botToken: 'your_bot_token_here'
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
       botToken: 'your_bot_token'
   };
   ```

### Advanced Configuration

You can modify these settings in `index.js`:

```javascript
const BINANCE_USERNAME = 'binance';          // Twitter account to monitor
const POLL_INTERVAL = 60000;                // Check interval (milliseconds)
const MAX_TWEETS_TO_CHECK = 5;              // Number of recent tweets to check
```

## Usage

1. **Start the bot**
   ```bash
   npm start
   ```
   or
   ```bash
   node index.js
   ```

2. **Monitor the console output**
   - The bot will display its status and any new tweets found
   - Successfully sent messages will show Telegram message IDs

3. **Check your Telegram channel**
   - New Binance Alpha announcements will appear automatically
   - Trading open tweets will reply to their original announcements

## File Structure

```
├── index.js              # Main bot logic
├── package.json          # Dependencies and scripts
├── posted_tweets.json    # Persistent storage for processed tweets
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## Message Format

### Announcement Tweet Format
```
🚨 BINANCE ALPHA ALERT 🚨

*Token Name (SYMBOL)*

[Original tweet content]

🔗 View Tweet
📅 [Timestamp]
💖 [Likes] | 🔄 [Retweets]
```

### Trading Open Tweet Format
```
🚨 TRADING NOW OPEN 🚨

*Token Name (SYMBOL)*

[Trading open tweet content]

🔗 View Trading Tweet
📅 [Timestamp]
💖 [Likes] | 🔄 [Retweets]
```

## Data Storage

The bot stores processed tweets in `posted_tweets.json` with the following structure:

```json
{
  "id": "tweet_id",
  "text": "tweet_content",
  "created_at": "timestamp",
  "screen_name": "binance",
  "url": "tweet_url",
  "type": "announcement|trading_open|trading_open_orphan",
  "posted_to_telegram": true,
  "telegram_message_id": 12345,
  "processed_at": "iso_timestamp"
}
```

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

### Adding New Tweet Types

To monitor additional tweet patterns:

1. Create a new detection function:
   ```javascript
   function isNewTweetType(tweetText) {
       return tweetText.includes('your_pattern');
   }
   ```

2. Add it to the processing logic in `processNewTweets()`

3. Update the message formatting if needed

### Testing

- Monitor console output for debugging information
- Check `posted_tweets.json` for persistent state
- Verify Telegram messages are sent correctly

## Troubleshooting

### Common Issues

1. **Bot not sending to Telegram**
   - Verify bot token is correct
   - Ensure bot is added as admin to the channel
   - Check channel ID format (should start with @)

2. **No tweets detected**
   - Verify Twitter API is accessible
   - Check if Binance account is active
   - Review filtering patterns

3. **Duplicate messages**
   - Check if `posted_tweets.json` exists and is readable
   - Verify file permissions

### Debug Mode

Enable verbose logging by adding console.log statements or modify the polling interval for testing:

```javascript
const POLL_INTERVAL = 10000; // 10 seconds for testing
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

This bot is for educational and personal use. Ensure you comply with:
- Twitter's Terms of Service
- Telegram's Bot API Terms
- Any relevant data protection regulations

Use responsibly and respect API rate limits.
