require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

console.log('Token exists:', !!token);
console.log('Token length:', token?.length);
console.log('Token format valid:', /^\d+:[A-Za-z0-9_-]{35,}$/.test(token || ''));

if (token) {
    console.log('First 10 chars:', token.substring(0, 10));
    console.log('Has colon at right position:', token.indexOf(':') > 0 && token.indexOf(':') < 15);
}

// Test with Telegram API
if (token && /^\d+:[A-Za-z0-9_-]{35,}$/.test(token)) {
    const { Telegraf } = require('telegraf');
    
    const bot = new Telegraf(token);
    
    bot.telegram.getMe().then(info => {
        console.log('✅ Bot info:', info);
        console.log('Bot username:', info.username);
        process.exit(0);
    }).catch(error => {
        console.error('❌ Token validation failed:', error.message);
        console.error('Error code:', error.response?.error_code);
        console.error('Description:', error.response?.description);
        process.exit(1);
    });
} else {
    console.log('❌ Invalid token format');
    process.exit(1);
}
