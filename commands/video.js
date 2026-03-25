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

async function getVideoByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.mp4) {
        return { 
            download: res.data.result.mp4, 
            title: res.data.result.title 
        };
    }
    throw new Error('Video download failed');
}

async function videoCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const args = text.split(' ');
        const searchQuery = args.slice(1).join(' ').trim();

        // Help message if no query
        if (!searchQuery) {
            const helpText = `🎬 *ZENITSU-BOT VIDEO DOWNLOADER* 🎬

🔍 *USAGE:*
• Send YouTube URL
• Or search by name

📌 *EXAMPLES:*
\`\`\`.vid https://youtube.com/...\`\`\`
\`\`\`.vid never gonna give you up\`\`\`

⚡ *Features:* 720p • Fast • Auto Search`;
            
            await sock.sendMessage(chatId, { 
                text: helpText 
            }, { quoted: message });
            return;
        }

        // Send initial message that will be edited
        let statusMsg = await sock.sendMessage(chatId, { 
            text: `🔍 *Searching for video...*\n\n⏳ Please wait...` 
        }, { quoted: message });

        let videoUrl = '';
        let videoTitle = '';

        // Update message for searching
        if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
            videoUrl = searchQuery;
            await sock.sendMessage(chatId, {
                text: `✅ *Link detected*\n📥 Processing YouTube video...\n\n⚡ Getting video data...`,
                edit: statusMsg.key
            });
        } else {
            // Search YouTube
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, {
                    text: `❌ *No videos found!*\n\nTry different keywords.`,
                    edit: statusMsg.key
                });
                return;
            }
            
            const video = videos[0];
            videoUrl = video.url;
            videoTitle = video.title;
            
            await sock.sendMessage(chatId, {
                text: `✅ *Video found!*\n\n📽️ *Title:* ${videoTitle}\n🎯 *Quality:* 720p\n\n⏬ Starting download...`,
                edit: statusMsg.key
            });
        }

        // Validate YouTube URL
        const youtubeRegex = /(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi;
        if (!youtubeRegex.test(videoUrl)) {
            await sock.sendMessage(chatId, {
                text: `❌ *Invalid YouTube URL!*\n\nProvide a valid link.`,
                edit: statusMsg.key
            });
            return;
        }

        // Update message for downloading
        await sock.sendMessage(chatId, {
            text: `⬇️ *Downloading video...*\n\n🎯 *Quality:* 720p\n⚡ *Status:* Processing...\n\n⏳ Please wait...`,
            edit: statusMsg.key
        });

        let videoData;
        try {
            videoData = await getVideoByUrl(videoUrl);
        } catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ *Download failed!*\n\nError: ${error.message}\n\nTry again later.`,
                edit: statusMsg.key
            });
            return;
        }

        // Update message to show download complete
        const finalTitle = videoData.title || videoTitle || 'YouTube Video';
        await sock.sendMessage(chatId, {
            text: `✅ *Downloaded successfully!*\n\n📽️ *Title:* ${finalTitle}\n⚡ *Quality:* 720p\n🎬 *Format:* MP4\n\n📤 Sending video now...`,
            edit: statusMsg.key
        });

        // Send video with caption
        const caption = `🎬 *ZENITSU-BOT VIDEO DOWNLOADER* 🎬

📽️ *Title:* ${finalTitle}
⚡ *Quality:* 720p
🎬 *Format:* MP4

✅ *Status:* Downloaded successfully

⭐ *Powered by Zenitsu-BOT*
🎥 *Enjoy your video!*`;

        await sock.sendMessage(chatId, {
            video: { url: videoData.download },
            mimetype: 'video/mp4',
            fileName: `${finalTitle.substring(0, 40)}.mp4`.replace(/[^a-z0-9]/gi, '_'),
            caption: caption
        });

        // Final edit to show completion status (keeping the message)
        await sock.sendMessage(chatId, {
            text: `✅ *Downloaded successfully!*\n\n📽️ *Title:* ${finalTitle}\n⚡ *Quality:* 720p\n🎬 *Format:* MP4\n\n🎬 *Video sent! Check above.*\n\n⭐ *Zenitsu-BOT Task Complete* ⭐`,
            edit: statusMsg.key
        });

    } catch (error) {
        console.error('[BENZO-MD VIDEO] Error:', error);
        
        await sock.sendMessage(chatId, { 
            text: `🚫 *ERROR* 🚫\n\nError: ${error.message}\n\nTry again.` 
        }, { quoted: message });
    }
}

module.exports = videoCommand;