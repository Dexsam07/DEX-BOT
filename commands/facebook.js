const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function facebookCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const args = text.split(' ');
        const url = args.slice(1).join(' ').trim();
        
        // Help message if no query
        if (!url) {
            const helpText = `📹 *ZANITSU-BOT FACEBOOK DOWNLOADER* 📹

🔍 *USAGE:*
• Send Facebook Video URL
• Send Facebook Reel URL
• Send Facebook Post URL

📌 *EXAMPLES:*
\`\`\`.fb https://facebook.com/...\`\`\`
\`\`\`.fb https://fb.watch/...\`\`\`
\`\`\`.fb https://www.facebook.com/reel/...\`\`\`

⚡ *Features:* HD • SD • Fast Download`;
            
            return await sock.sendMessage(chatId, { 
                text: helpText 
            }, { quoted: message });
        }

        // Validate Facebook URL
        if (!url.includes('facebook.com') && !url.includes('fb.watch')) {
            return await sock.sendMessage(chatId, { 
                text: "❌ *INVALID LINK* ❌\n\nThat is not a Facebook link.\nPlease provide a valid Facebook video URL."
            }, { quoted: message });
        }

        // Send initial status message
        let statusMsg = await sock.sendMessage(chatId, {
            text: "🔍 *Processing Facebook link...*\n\n⏳ Please wait..."
        }, { quoted: message });

        // Update status to validating
        await sock.sendMessage(chatId, {
            text: "✅ *Link validated*\n🔗 Extracting video data...\n\n⚡ *Zenitsu-MD* is working...",
            edit: statusMsg.key
        });

        await sock.sendMessage(chatId, {
            react: { text: '🔄', key: message.key }
        });

        // Update status to resolving URL
        await sock.sendMessage(chatId, {
            text: "🔄 *Resolving URL...*\n\n🔗 Checking for redirects...\n⏳ Please wait...",
            edit: statusMsg.key
        });

        // Resolve share/short URLs to their final destination first
        let resolvedUrl = url;
        try {
            const res = await axios.get(url, { 
                timeout: 20000, 
                maxRedirects: 10, 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' 
                } 
            });
            const possible = res?.request?.res?.responseUrl;
            if (possible && typeof possible === 'string') {
                resolvedUrl = possible;
                await sock.sendMessage(chatId, {
                    text: "✅ *URL resolved*\n🔄 Using direct video link...\n\n⬇️ Preparing download...",
                    edit: statusMsg.key
                });
            }
        } catch {
            // ignore resolution errors; use original url
            await sock.sendMessage(chatId, {
                text: "⚠️ *Using original URL*\n🔄 Direct resolution failed\n\n⬇️ Starting download...",
                edit: statusMsg.key
            });
        }

        // Helper to call API with retries and variants
        async function fetchFromApi(u) {
            const apiUrl = `https://api.princetechn.com/api/download/facebook?apikey=prince&url=${encodeURIComponent(u)}`;
            return axios.get(apiUrl, {
                timeout: 40000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                },
                maxRedirects: 5,
                validateStatus: s => s >= 200 && s < 500
            });
        }

        // Update status to downloading
        await sock.sendMessage(chatId, {
            text: "⬇️ *Downloading video...*\n\n⚡ *Server:* PrinceTech API\n🎯 *Checking available qualities...*",
            edit: statusMsg.key
        });

        // Try resolved URL, then fallback to original URL
        let response;
        try {
            response = await fetchFromApi(resolvedUrl);
            if (!response || response.status >= 400 || !response.data) throw new Error('bad');
        } catch {
            response = await fetchFromApi(url);
        }

        const data = response.data;

        if (!data || data.status !== 200 || !data.success || !data.result) {
            await sock.sendMessage(chatId, {
                text: "❌ *API ERROR* ❌\n\nThe API did not return a valid response.\n\nPossible reasons:\n• Private video\n• Invalid link\n• API limit reached",
                edit: statusMsg.key
            });
            return;
        }

        const fbvid = data.result.hd_video || data.result.sd_video;

        if (!fbvid) {
            await sock.sendMessage(chatId, {
                text: "❌ *NO VIDEO FOUND* ❌\n\nWrong Facebook data.\nPlease ensure:\n• Video exists\n• Video is public\n• Link is correct",
                edit: statusMsg.key
            });
            return;
        }

        // Update status to processing video
        const quality = data.result.hd_video ? "HD" : "SD";
        const title = data.result.title || "Facebook Video";
        const duration = data.result.duration || "Unknown";
        
        await sock.sendMessage(chatId, {
            text: `⚡ *Video found!*\n\n📽️ *Title:* ${title}\n🎯 *Quality:* ${quality}\n⏱ *Duration:* ${duration}\n\n📥 Downloading now...`,
            edit: statusMsg.key
        });

        // Create temp directory if it doesn't exist
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        // Generate temp file path
        const tempFile = path.join(tmpDir, `fb_${Date.now()}.mp4`);

        // Update status to downloading from source
        await sock.sendMessage(chatId, {
            text: "📥 *Downloading from source...*\n\n⚡ Fetching video stream...\n⏳ This may take a moment...",
            edit: statusMsg.key
        });

        // Download the video
        const videoResponse = await axios({
            method: 'GET',
            url: fbvid,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Range': 'bytes=0-',
                'Connection': 'keep-alive',
                'Referer': 'https://www.facebook.com/'
            }
        });

        const writer = fs.createWriteStream(tempFile);
        videoResponse.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Check if file was downloaded successfully
        if (!fs.existsSync(tempFile) || fs.statSync(tempFile).size === 0) {
            throw new Error('Failed to download video');
        }

        // Update status to sending
        await sock.sendMessage(chatId, {
            text: "📤 *Sending video...*\n\n🎬 Uploading to WhatsApp...\n⏳ Almost done...",
            edit: statusMsg.key
        });

        // Send the video with caption
        const caption = `📹 *ZENITSU-BOT FACEBOOK DOWNLOADER* 📹\n\n` +
                       `📽️ *Title:* ${title}\n` +
                       `🎯 *Quality:* ${quality}\n` +
                       `⏱ *Duration:* ${duration}\n` +
                       `📁 *Format:* MP4\n\n` +
                       `✅ *Downloaded successfully*\n\n` +
                       `⭐ *Powered by Zenitsu-BOT*`;

        await sock.sendMessage(chatId, {
            video: { url: tempFile },
            mimetype: "video/mp4",
            caption: caption
        }, { quoted: message });

        // Clean up temp file
        try {
            fs.unlinkSync(tempFile);
        } catch (err) {
            console.error('Error cleaning up temp file:', err);
        }

        // Final status update
        await sock.sendMessage(chatId, {
            text: `✅ *DOWNLOAD COMPLETE!* ✅\n\n` +
                  `📽️ *Title:* ${title}\n` +
                  `🎯 *Quality:* ${quality}\n` +
                  `⏱ *Duration:* ${duration}\n` +
                  `📁 *Format:* MP4\n\n` +
                  `🎬 *Video sent successfully!*\n\n` +
                  `⭐ *Zenitsu-Bot Task Complete* ⭐`,
            edit: statusMsg.key
        });

    } catch (error) {
        console.error('[BENZO-MD FB] Error:', error);
        
        await sock.sendMessage(chatId, { 
            text: "🚫 *SYSTEM ERROR* 🚫\n\nError: " + (error.message || 'Unknown error') + "\n\nPlease try again."
        }, { quoted: message });
    }
}

module.exports = facebookCommand;
