const fs = require('fs');
const path = require('path');

module.exports = async (sock, chatId, newPrefix, message) => {
    try {
        const configPath = path.join(__dirname, '../config.js');
        
        // Read current config
        let configContent = fs.readFileSync(configPath, 'utf8');
        
        // Update prefix in config
        configContent = configContent.replace(
            /prefix:\s*['"][^'"]*['"]/,
            `prefix: '${newPrefix}'`
        );
        
        // Write updated config
        fs.writeFileSync(configPath, configContent, 'utf8');
        
        // Reload config
        delete require.cache[require.resolve('../config.js')];
        require('../config.js');
        
        await sock.sendMessage(chatId, {
            text: `✅ Prefix updated to: *${newPrefix}*\n\n⚠️ Please restart the bot for changes to take effect.`
        }, { quoted: message });

    } catch (error) {
        console.error('Error in setprefix command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to update prefix. Please check the config file.' }, { quoted: message });
    }
};