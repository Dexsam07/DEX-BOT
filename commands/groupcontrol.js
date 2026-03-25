const isAdmin = require('../lib/isAdmin');

async function openGroupCommand(sock, chatId, senderId, message) {
    console.log(`Attempting to open the group: ${chatId}`);

    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

    if (!isBotAdmin) {
        return sock.sendMessage(chatId, { text: '⚠️ Please make the bot an *admin* first.' }, { quoted: message });
    }

    if (!isSenderAdmin) {
        return sock.sendMessage(chatId, { text: '❌ Only group admins can use the *open group* command.' }, { quoted: message });
    }

    try {
        await sock.groupSettingUpdate(chatId, 'not_announcement'); // Open group
        await sock.sendMessage(chatId, { text: '🔓 The group has been *opened*.\nAll members can send messages now.' });
    } catch (error) {
        console.error('Error opening group:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to open the group.' });
    }
}

async function closeGroupCommand(sock, chatId, senderId, message) {
    console.log(`Attempting to close the group: ${chatId}`);

    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

    if (!isBotAdmin) {
        return sock.sendMessage(chatId, { text: '⚠️ Please make the bot an *admin* first.' }, { quoted: message });
    }

    if (!isSenderAdmin) {
        return sock.sendMessage(chatId, { text: '❌ Only group admins can use the *close group* command.' }, { quoted: message });
    }

    try {
        await sock.groupSettingUpdate(chatId, 'announcement'); // Close group
        await sock.sendMessage(chatId, { text: '🔒 The group has been *closed*.\nOnly admins can send messages now.' });
    } catch (error) {
        console.error('Error closing group:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to close the group.' });
    }
}

// Main groupControlCommand function that handles both .close and .open
module.exports = async (sock, chatId, action, message) => {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        
        if (action === 'close') {
            await closeGroupCommand(sock, chatId, senderId, message);
        } else if (action === 'open') {
            await openGroupCommand(sock, chatId, senderId, message);
        } else {
            await sock.sendMessage(chatId, { 
                text: '❌ Invalid action. Use either:\n.close - Close the group\n.open - Open the group' 
            }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in group control command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to process group control command. Please try again.' 
        }, { quoted: message });
    }
};