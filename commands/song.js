const axios = require('axios');
const yts = require('yt-search');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}

async function getIzumiDownloadByUrl(youtubeUrl) {
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi download failed');
}

async function getIzumiDownloadByQuery(query) {
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi search failed');
}

async function getOkatsuDownloadByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.dl) {
        return {
            download: res.data.dl,
            title: res.data.title,
            thumbnail: res.data.thumb
        };
    }
    throw new Error('Okatsu download failed');
}

async function songCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const args = text.split(' ');
        const searchQuery = args.slice(1).join(' ').trim();

        // Help message if no query
        if (!searchQuery) {
            const helpText = `🎵 *DEX-BOT AUDIO DOWNLOADER* 🎵

🔍 *USAGE:*
• Send YouTube URL
• Or search by song name

📌 *EXAMPLES:*
\`\`\`.song https://youtube.com/...\`\`\`
\`\`\`.song never gonna give you up\`\`\`

⚡ *Features:* MP3 • High Quality • Fast Download`;
            
            await sock.sendMessage(chatId, { 
                text: helpText 
            }, { quoted: message });
            return;
        }

        // Send initial status message
        let statusMsg = await sock.sendMessage(chatId, { 
            text: "🔍 *Searching for song...*\n\n⏳ Please wait..." 
        }, { quoted: message });

        let video;
        let isUrl = false;

        // Update message based on input type
        if (searchQuery.includes('youtube.com') || searchQuery.includes('youtu.be')) {
            isUrl = true;
            video = { url: searchQuery };
            await sock.sendMessage(chatId, {
                text: "✅ *Link detected*\n📥 Processing YouTube audio...\n\n⚡ Extracting audio data...",
                edit: statusMsg.key
            });
        } else {
            await sock.sendMessage(chatId, {
                text: `🔍 *Searching:*\n"${searchQuery}"\n\n🎵 Looking for best match...`,
                edit: statusMsg.key
            });

            const search = await yts(searchQuery);
            if (!search || !search.videos.length) {
                await sock.sendMessage(chatId, {
                    text: "❌ *No results found!*\n\nTry different keywords.",
                    edit: statusMsg.key
                });
                return;
            }
            
            video = search.videos[0];
            await sock.sendMessage(chatId, {
                text: `✅ *Song found!*\n\n🎵 *Title:* ${video.title}\n⏱ *Duration:* ${video.timestamp}\n🎤 *Channel:* ${video.author.name}\n\n⬇️ Starting download...`,
                edit: statusMsg.key
            });
        }

        // Update to downloading status
        await sock.sendMessage(chatId, {
            text: "⬇️ *Downloading audio...*\n\n🎵 *Format:* MP3\n⚡ *Quality:* High\n\n⏳ Please wait...",
            edit: statusMsg.key
        });

        // Try download methods in sequence
        let audioData;
        try {
            if (isUrl) {
                audioData = await getIzumiDownloadByUrl(video.url);
            } else {
                const query = video.title || searchQuery;
                audioData = await getIzumiDownloadByQuery(query);
            }
        } catch (e1) {
            try {
                if (isUrl) {
                    audioData = await getOkatsuDownloadByUrl(video.url);
                } else {
                    // If we have a search result, get the URL first
                    const search = await yts(searchQuery);
                    if (search && search.videos.length) {
                        video = search.videos[0];
                        audioData = await getOkatsuDownloadByUrl(video.url);
                    } else {
                        throw new Error('No videos found');
                    }
                }
            } catch (e2) {
                await sock.sendMessage(chatId, {
                    text: "❌ *Download failed!*\n\nAll download methods failed.\nPlease try again later.",
                    edit: statusMsg.key
                });
                return;
            }
        }

        // Update to processing audio
        await sock.sendMessage(chatId, {
            text: "⚡ *Processing audio...*\n\n🎵 Converting to MP3...\n🎧 Preparing final output...",
            edit: statusMsg.key
        });

        // Send the audio
        const finalTitle = audioData.title || video.title || 'Audio';
        const caption = `🎵 *DEX-BOT AUDIO DOWNLOADER* 🎵\n\n` +
                       `🎶 *Title:* ${finalTitle}\n` +
                       (video.author ? `🎤 *Artist:* ${video.author.name}\n` : '') +
                       (video.timestamp ? `⏱ *Duration:* ${video.timestamp}\n` : '') +
                       `📁 *Format:* MP3\n` +
                       `⚡ *Quality:* High\n\n` +
                       `✅ *Downloaded successfully*\n\n` +
                       `⭐ *Powered by DEX-BOT*`;

        await sock.sendMessage(chatId, {
            audio: { url: audioData.download || audioData.dl || audioData.url },
            mimetype: 'audio/mpeg',
            fileName: `${finalTitle.substring(0, 40)}.mp3`.replace(/[^a-z0-9]/gi, '_'),
            ptt: false,
            caption: caption
        });

        // Final update to show completion
        await sock.sendMessage(chatId, {
            text: `✅ *Downloaded successfully!*\n\n` +
                  `🎶 *Title:* ${finalTitle}\n` +
                  (video.author ? `🎤 *Artist:* ${video.author.name}\n` : '') +
                  (video.timestamp ? `⏱ *Duration:* ${video.timestamp}\n` : '') +
                  `📁 *Format:* MP3\n` +
                  `⚡ *Quality:* High\n\n` +
                  `🎵 *Audio sent!*\n\n` +
                  `⭐ *DEX-BOT Task Complete* ⭐`,
            edit: statusMsg.key
        });

    } catch (err) {
        console.error('[BENZO-MD SONG] Error:', err);
        
        await sock.sendMessage(chatId, { 
            text: "🚫 *ERROR* 🚫\n\nError: " + (err.message || 'Unknown error') + "\n\nPlease try again."
        }, { quoted: message });
    }
}

module.exports = songCommand;