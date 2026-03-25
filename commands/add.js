const isAdmin = require('../lib/isAdmin');

module.exports = async (sock, chatId, message) => {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        
        // Get admin status
        const adminStatus = await isAdmin(sock, chatId, senderId);
        const isBotAdmin = adminStatus.isBotAdmin;
        const isSenderAdmin = adminStatus.isSenderAdmin;
        
        // Check if bot is admin
        if (!isBotAdmin) {
            return sock.sendMessage(chatId, { 
                text: '⚠️ Please make the bot an admin first to use the add command.' 
            }, { quoted: message });
        }
        
        // Check if sender is admin (or bot itself)
        if (!isSenderAdmin && !message.key.fromMe) {
            return sock.sendMessage(chatId, { 
                text: '❌ Only group admins can add users to the group.' 
            }, { quoted: message });
        }
        
        // Get mentioned users
        const mentionedJidList = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        // Get text after command
        const commandText = message.message?.conversation || 
                           message.message?.extendedTextMessage?.text || '';
        const args = commandText.split(' ').slice(1);
        
        let userIds = [...mentionedJidList];
        
        // Process phone numbers from arguments
        if (args.length > 0) {
            for (const arg of args) {
                const cleanNumber = arg.replace(/\D/g, '');
                if (cleanNumber.length >= 8) {
                    const userJid = `${cleanNumber}@s.whatsapp.net`;
                    if (!userIds.includes(userJid)) {
                        userIds.push(userJid);
                    }
                }
            }
        }

        if (userIds.length === 0) {
            return sock.sendMessage(chatId, { 
                text: '📝 *Usage:*\n' +
                      '• `.add @mention` - Add mentioned user(s)\n' +
                      '• `.add 1234567890` - Add by phone number\n' +
                      '• `.add 1234567890 0987654321` - Add multiple numbers'
            }, { quoted: message });
        }

        let successCount = 0;
        let failedCount = 0;
        let results = [];

        for (const userId of userIds) {
            try {
                await sock.groupParticipantsUpdate(chatId, [userId], 'add');
                successCount++;
                results.push(`✅ ${userId.split('@')[0]}`);
            } catch (error) {
                failedCount++;
                results.push(`❌ ${userId.split('@')[0]}`);
            }
        }

        await sock.sendMessage(chatId, {
            text: `👥 *Add Users Report*\n\n${results.join('\n')}\n\n✅ Success: ${successCount}\n❌ Failed: ${failedCount}`
        }, { quoted: message });

    } catch (error) {
        console.error('Error in add command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to add users.' 
        }, { quoted: message });
    }
};