const fs = require('fs');
const path = require('path');

async function saveStatusCommand(message, { conn }) {
    try {
        const quoted = message.quoted || message;
        const mime = quoted.mimetype || '';

        if (!/image|video/.test(mime)) {
            await conn.sendMessage(message.chat, { 
                text: '❌ Reply to an image/video status with *.save* to save it.' 
            }, { quoted: message });
            return;
        }

        const buffer = await quoted.download();
        const fileExt = mime.split('/')[1];
        const fileName = `status-${Date.now()}.${fileExt}`;
        const filePath = path.join(__dirname, fileName);
        
        fs.writeFileSync(filePath, buffer);

        const mediaType = mime.split('/')[0];
        await conn.sendMessage(message.chat, { 
            [mediaType]: fs.readFileSync(filePath), 
            caption: '✅ Saved & uploaded!' 
        }, { quoted: message });

        fs.unlinkSync(filePath); // clean up
        await conn.sendMessage(message.chat, { 
            react: { text: '📥', key: message.key } 
        });
    } catch (err) {
        console.error(err);
        await conn.sendMessage(message.chat, { 
            text: '❌ Failed to save status.' 
        }, { quoted: message });
    }
}

module.exports = saveStatusCommand;