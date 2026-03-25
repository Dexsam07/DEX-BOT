const settings = require('../settings');

async function ownerCommand(sock, chatId, message) {
    try {
        // Check if bot owner is set
        if (!settings.botOwner || !settings.ownerNumber) {
            return await sock.sendMessage(chatId, {
                text: `⚡ *DEX-BOT OWNER INFO* ⚡\n\n❌ *Owner information not configured*\n\nPlease set botOwner and ownerNumber in settings.js`
            }, { quoted: message });
        }

        // Send initial message
        const statusMsg = await sock.sendMessage(chatId, {
            text: "🔍 *Fetching owner information...*\n\n⏳ Please wait..."
        }, { quoted: message });

        // Update message with owner details
        await sock.sendMessage(chatId, {
            text: `⚡ *DEX-BOT OWNER INFORMATION* ⚡\n\n` +
                  `👤 *Name:* ${settings.botOwner}\n` +
                  `📱 *Number:* ${settings.ownerNumber}\n` +
                  `🌐 *Bot Name:* ${global.botname || 'DEX-BOT'}\n\n` +
                  `📤 *Saving contact card...*`,
            edit: statusMsg.key
        });

        // Create vcard
        const vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${settings.botOwner}
ORG:Dex-bot;
TEL;type=CELL;type=VOICE;waid=${settings.ownerNumber}:${settings.ownerNumber}
X-WA-BIZ-NAME:${global.botname || 'Dex-bot'} Owner
NOTE:Owner of ${global.botname || 'Dex-bot'} WhatsApp Bot
END:VCARD
`;

        // Send the contact card
        await sock.sendMessage(chatId, {
            contacts: { 
                displayName: `${settings.botOwner} (${global.botname || 'DEX-BOT'} Owner)`, 
                contacts: [{ vcard }] 
            }
        });

        // Update final message
        await sock.sendMessage(chatId, {
            text: `✅ *CONTACT SENT SUCCESSFULLY* ✅\n\n` +
                  `👤 *Name:* ${settings.botOwner}\n` +
                  `📱 *Number:* ${settings.ownerNumber}\n` +
                  `🌐 *Bot Name:* ${global.botname || 'Dex-Bot'}\n\n` +
                  `📞 *Contact card has been sent*\n` +
                  `💡 *Tap to save contact*\n\n` +
                  `⭐ *Dex-Bot Support* ⭐`,
            edit: statusMsg.key
        });

    } catch (error) {
        console.error('[Dex-Bot OWNER] Error:', error);
        
        await sock.sendMessage(chatId, {
            text: `🚫 *ERROR* 🚫\n\nFailed to send owner information.\nError: ${error.message}`
        }, { quoted: message });
    }
}

module.exports = ownerCommand;
