const fetch = require('node-fetch');

// Utility: split long lyrics into safe chunks for WhatsApp
function chunkText(text, size = 3000) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
}

async function lyricsCommand(sock, chatId, songTitle, message) {
    if (!songTitle) {
        await sock.sendMessage(chatId, { 
            text: '🎵 *ZENITSU-BOT LYRICS*\n\nPlease enter the song name!\nUsage: *.lyrics <song name>*\n\nExample: .lyrics Bohemian Rhapsody - Queen'
        }, { quoted: message });
        return;
    }

    try {
        // Use David Cyril Tech API v3
        const apiUrl = `https://apis.davidcyriltech.my.id/lyrics3?song=${encodeURIComponent(songTitle)}`;
        
        // Send initial reaction
        await sock.sendMessage(chatId, {
            react: { text: '🎵', key: message.key }
        });

        const res = await fetch(apiUrl);

        if (!res.ok) {
            throw new Error(await res.text());
        }

        const json = await res.json();
        if (!json.success || !json.result || !json.result.lyrics) {
            await sock.sendMessage(chatId, { 
                text: `❌ *ZENITSU-BOT LYRICS*\n\nSorry, I couldn't find lyrics for:\n"${songTitle}"\n\n💡 Try:\n• Adding artist name\n• Check spelling\n\n> ρσωєяє∂ ву chrisGaaju`
            }, { quoted: message });
            return;
        }

        const { song, artist, lyrics } = json.result;

        // Prepare header with Benzo-MD styling
        const header = `╔══════════════════════════╗
        🎵 *ZENITSU-BOT LYRICS* 🎵
╚══════════════════════════╝

📝 *Song:* ${song || songTitle}
🎤 *Artist:* ${artist || 'Unknown Artist'}

📜 *LYRICS:*\n`;

        // Send header first
        await sock.sendMessage(chatId, { text: header });

        // Split long lyrics into chunks with footer
        const parts = chunkText(lyrics);
        for (let i = 0; i < parts.length; i++) {
            let text = parts[i];
            
            // Add page number if multiple parts
            if (parts.length > 1) {
                text += `\n\n📄 Page ${i + 1}/${parts.length}`;
            }
            
            // Add footer on last part
            if (i === parts.length - 1) {
                text += `\n\n⭐ *Powered by Zenitsu-BOT*\n> ρσωєяє∂ ву chrisGaaju`;
            }
            
            await sock.sendMessage(chatId, { text: text });
            
            // Small delay between messages
            if (i < parts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Send success reaction
        await sock.sendMessage(chatId, {
            react: { text: '✅', key: message.key }
        });

    } catch (error) {
        console.error('[ZENITSU-BOT LYRICS] Error:', error);
        
        await sock.sendMessage(chatId, { 
            text: `❌ *ZENITSU-BOT LYRICS*\n\nError fetching lyrics for:\n"${songTitle}"\n\nError: ${error.message}\n\n> ρσωєяє∂ ву chrisGaaju`
        }, { quoted: message });
        
        await sock.sendMessage(chatId, {
            react: { text: '❌', key: message.key }
        });
    }
}

module.exports = { lyricsCommand };