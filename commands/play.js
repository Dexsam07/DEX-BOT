const yts = require('yt-search');
const axios = require('axios');

async function playCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const args = text.split(' ');
        const searchQuery = args.slice(1).join(' ').trim();
        
        // Help message if no query
        if (!searchQuery) {
            const helpText = `🎵 *DEX-BOT PLAY DOWNLOADER* 🎵

🔍 *USAGE:*
• Search any song name

📌 *EXAMPLES:*
\`\`\`.play never gonna give you up\`\`\`
\`\`\`.play shape of you ed sheeran\`\`\`

⚡ *Features:* MP3 • High Quality • Fast Search`;
            
            await sock.sendMessage(chatId, { 
                text: helpText 
            }, { quoted: message });
            return;
        }

        // Send initial status message
        let statusMsg = await sock.sendMessage(chatId, { 
            text: `🔍 *Searching for "${searchQuery}"...*\n\n⏳ Please wait...` 
        }, { quoted: message });

        // Update to searching status
        await sock.sendMessage(chatId, {
            text: `🔍 *Searching:*\n"${searchQuery}"\n\n🎵 Looking for best match...`,
            edit: statusMsg.key
        });

        // Search for the song
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            await sock.sendMessage(chatId, {
                text: "❌ *No songs found!*\n\nTry different keywords.",
                edit: statusMsg.key
            });
            return;
        }

        // Get the first video result
        const video = videos[0];
        const urlYt = video.url;

        // Update with found song details
        await sock.sendMessage(chatId, {
            text: `✅ *Song found!*\n\n🎶 *Title:* ${video.title}\n🎤 *Artist:* ${video.author.name}\n⏱ *Duration:* ${video.timestamp}\n👁️ *Views:* ${video.views}\n\n⬇️ Starting download...`,
            edit: statusMsg.key
        });

        // Update to downloading status
        await sock.sendMessage(chatId, {
            text: "⬇️ *Downloading audio...*\n\n🎵 *Format:* MP3\n⚡ *Quality:* High\n⏳ *Processing audio data...*",
            edit: statusMsg.key
        });

        // Fetch audio data from API
        let audioUrl, title;
        try {
            const response = await axios.get(`https://apis-keith.vercel.app/download/dlmp3?url=${urlYt}`, {
                timeout: 30000
            });
            const data = response.data;

            if (!data || !data.status || !data.result || !data.result.downloadUrl) {
                throw new Error('API returned invalid data');
            }

            audioUrl = data.result.downloadUrl;
            title = data.result.title || video.title;

            // Update to processing status
            await sock.sendMessage(chatId, {
                text: "⚡ *Processing audio...*\n\n🎵 Converting to MP3...\n🎧 Preparing final output...",
                edit: statusMsg.key
            });

        } catch (apiError) {
            console.error('[PLAY] API Error:', apiError.message);
            await sock.sendMessage(chatId, {
                text: "❌ *API Error!*\n\nFailed to fetch audio data.\nTrying alternative method...",
                edit: statusMsg.key
            });
            
            // Fallback to using direct YouTube audio
            audioUrl = `https://convert2mp3s.com/api/widgetv2?url=${urlYt}`;
            title = video.title;
        }

        // Send the audio with caption
        const caption = `🎵 *DEX-BOT PLAY DOWNLOADER* 🎵\n\n` +
                       `🎶 *Title:* ${title}\n` +
                       `🎤 *Artist:* ${video.author.name}\n` +
                       (video.timestamp ? `⏱ *Duration:* ${video.timestamp}\n` : '') +
                       (video.views ? `👁️ *Views:* ${video.views}\n` : '') +
                       `📁 *Format:* MP3\n` +
                       `⚡ *Quality:* High\n\n` +
                       `✅ *Downloaded successfully*\n\n` +
                       `⭐ *Powered by Dex Shyam Chaudhari*`;

        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${title.substring(0, 40)}.mp3`.replace(/[^a-z0-9]/gi, '_'),
            ptt: false,
            caption: caption
        });

        // Final update to show completion
        await sock.sendMessage(chatId, {
            text: `✅ *Downloaded successfully!*\n\n` +
                  `🎶 *Title:* ${title}\n` +
                  `🎤 *Artist:* ${video.author.name}\n` +
                  (video.timestamp ? `⏱ *Duration:* ${video.timestamp}\n` : '') +
                  (video.views ? `👁️ *Views:* ${video.views}\n` : '') +
                  `📁 *Format:* MP3\n` +
                  `⚡ *Quality:* High\n\n` +
                  `🎵 *Audio sent!*\n\n` +
                  `⭐ *DEX-BOT Task Complete* ⭐`,
            edit: statusMsg.key
        });

    } catch (error) {
        console.error('[DEX-BOT PLAY] Error:', error);
        
        await sock.sendMessage(chatId, { 
            text: "🚫 *ERROR* 🚫\n\nError: " + (error.message || 'Unknown error') + "\n\nPlease try again."
        }, { quoted: message });
    }
}

module.exports = playCommand;