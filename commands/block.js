const isAdmin = require('../lib/isAdmin');

module.exports = async (sock, chatId, userIds, message) => {
    try {
        // Check if sender is admin
        const senderId = message.key.participant || message.key.remoteJid;
        const senderAdminStatus = await isAdmin(sock, chatId, senderId);
        if (!senderAdminStatus.isSenderAdmin && !message.key.fromMe) {
            return sock.sendMessage(chatId, { text: '❌ Only admins can block users.' }, { quoted: message });
        }

        let successCount = 0;
        let failedCount = 0;
        let results = [];

        for (const userId of userIds) {
            try {
                await sock.updateBlockStatus(userId, 'block');
                successCount++;
                results.push(`✅ ${userId.split('@')[0]}`);
            } catch (error) {
                failedCount++;
                results.push(`❌ ${userId.split('@')[0]} (Failed)`);
            }
        }

        await sock.sendMessage(chatId, {
            text: `🚫 *Block Users Report*\n\n${results.join('\n')}\n\n✅ Blocked: ${successCount}\n❌ Failed: ${failedCount}`
        }, { quoted: message });

    } catch (error) {
        console.error('Error in block command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to block users. Please try again.' }, { quoted: message });
    }
};