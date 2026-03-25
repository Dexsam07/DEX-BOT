const { igdl } = require("ruhend-scraper");

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

// Function to extract unique media URLs with simple deduplication
function extractUniqueMedia(mediaData) {
    const uniqueMedia = [];
    const seenUrls = new Set();
    
    for (const media of mediaData) {
        if (!media.url) continue;
        
        // Only check for exact URL duplicates
        if (!seenUrls.has(media.url)) {
            seenUrls.add(media.url);
            uniqueMedia.push(media);
        }
    }
    
    return uniqueMedia;
}

// Function to validate media URL
function isValidMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // Accept any URL that looks like media
    return url.includes('cdninstagram.com') || 
           url.includes('instagram') || 
           url.includes('http');
}

async function instagramCommand(sock, chatId, message) {
    try {
        // Check if message has already been processed
        if (processedMessages.has(message.key.id)) {
            return;
        }
        
        // Add message ID to processed set
        processedMessages.add(message.key.id);
        
        // Clean up old message IDs after 5 minutes
        setTimeout(() => {
            processedMessages.delete(message.key.id);
        }, 5 * 60 * 1000);

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        if (!text) {
            const helpText = `📸 *ZENITSU-BOT INSTAGRAM DOWNLOADER* 📸

🔍 *USAGE:*
• Send Instagram Post URL
• Send Instagram Reel URL
• Send Instagram TV URL

📌 *EXAMPLES:*
\`\`\`.ig https://instagram.com/p/...\`\`\`
\`\`\`.ig https://instagram.com/reel/...\`\`\`
\`\`\`.ig https://instagram.com/tv/...\`\`\`

⚡ *Features:* Photos • Videos • Reels`;
            
            return await sock.sendMessage(chatId, { 
                text: helpText 
            });
        }

        const url = text.split(' ').slice(1).join(' ').trim();
        
        if (!url) {
            const helpText = `📸 *ZENITSU-BOT INSTAGRAM DOWNLOADER* 📸

🔍 *USAGE:*
• Send Instagram Post URL
• Send Instagram Reel URL
• Send Instagram TV URL

📌 *EXAMPLES:*
\`\`\`.ig https://instagram.com/p/...\`\`\`
\`\`\`.ig https://instagram.com/reel/...\`\`\`
\`\`\`.ig https://instagram.com/tv/...\`\`\`

⚡ *Features:* Photos • Videos • Reels`;
            
            return await sock.sendMessage(chatId, { 
                text: helpText 
            });
        }

        // Check for various Instagram URL formats
        const instagramPatterns = [
            /https?:\/\/(?:www\.)?instagram\.com\//,
            /https?:\/\/(?:www\.)?instagr\.am\//,
            /https?:\/\/(?:www\.)?instagram\.com\/p\//,
            /https?:\/\/(?:www\.)?instagram\.com\/reel\//,
            /https?:\/\/(?:www\.)?instagram\.com\/tv\//
        ];

        const isValidUrl = instagramPatterns.some(pattern => pattern.test(url));
        
        if (!isValidUrl) {
            return await sock.sendMessage(chatId, { 
                text: "❌ *INVALID LINK* ❌\n\nThat is not a valid Instagram link.\nPlease provide a valid Instagram post, reel, or video link."
            });
        }

        // Send initial status message
        let statusMsg = await sock.sendMessage(chatId, {
            text: "🔍 *Processing Instagram link...*\n\n⏳ Please wait..."
        }, { quoted: message });

        // Update status to validating
        await sock.sendMessage(chatId, {
            text: "✅ *Link validated*\n🔗 Extracting media data...\n\n⚡ *ZENITSU-BOT* is working...",
            edit: statusMsg.key
        });

        await sock.sendMessage(chatId, {
            react: { text: '🔄', key: message.key }
        });

        // Update status to downloading
        await sock.sendMessage(chatId, {
            text: "⬇️ *Downloading media...*\n\n⚡ Connecting to Instagram...\n⏳ Please wait...",
            edit: statusMsg.key
        });

        const downloadData = await igdl(url);
        
        if (!downloadData || !downloadData.data || downloadData.data.length === 0) {
            await sock.sendMessage(chatId, {
                text: "❌ *NO MEDIA FOUND* ❌\n\nThe post might be:\n• Private\n• Removed\n• Invalid link\n• Require login",
                edit: statusMsg.key
            });
            return;
        }

        // Update status to processing
        await sock.sendMessage(chatId, {
            text: "⚡ *Processing media...*\n\n📊 Found media files\n🎨 Preparing content...",
            edit: statusMsg.key
        });

        const mediaData = downloadData.data;
        
        // Simple deduplication - just remove exact URL duplicates
        const uniqueMedia = extractUniqueMedia(mediaData);
        
        // Limit to maximum 20 unique media items
        const mediaToDownload = uniqueMedia.slice(0, 20);
        
        if (mediaToDownload.length === 0) {
            await sock.sendMessage(chatId, {
                text: "❌ *NO VALID MEDIA* ❌\n\nNo valid media found to download.",
                edit: statusMsg.key
            });
            return;
        }

        // Update status with media count
        const mediaCount = mediaToDownload.length;
        const mediaType = mediaCount === 1 ? 'file' : 'files';
        
        await sock.sendMessage(chatId, {
            text: `✅ *Found ${mediaCount} ${mediaType}*\n\n📤 Sending media now...\n⏳ Please wait...`,
            edit: statusMsg.key
        });

        let sentCount = 0;
        let hasVideo = false;
        let hasPhoto = false;

        // Download all media
        for (let i = 0; i < mediaToDownload.length; i++) {
            try {
                const media = mediaToDownload[i];
                const mediaUrl = media.url;

                // Check if URL ends with common video extensions
                const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || 
                              media.type === 'video' || 
                              url.includes('/reel/') || 
                              url.includes('/tv/');

                const caption = `📸 *ZENITSU-BOT INSTAGRAM DOWNLOADER* 📸\n\n` +
                              `📊 *File:* ${i + 1}/${mediaCount}\n` +
                              (isVideo ? `🎬 *Type:* Video\n` : `🖼️ *Type:* Photo\n`) +
                              `✅ *Status:* Downloaded successfully\n\n` +
                              `⭐ *Powered by Zenitsu-MD*`;

                if (isVideo) {
                    hasVideo = true;
                    await sock.sendMessage(chatId, {
                        video: { url: mediaUrl },
                        mimetype: "video/mp4",
                        caption: caption
                    });
                } else {
                    hasPhoto = true;
                    await sock.sendMessage(chatId, {
                        image: { url: mediaUrl },
                        caption: caption
                    });
                }
                
                sentCount++;
                
                // Update progress status
                if (sentCount < mediaCount) {
                    await sock.sendMessage(chatId, {
                        text: `📤 *Sending ${sentCount}/${mediaCount}...*\n\n⏳ Sending next file...`,
                        edit: statusMsg.key
                    });
                }
                
                // Add small delay between downloads to prevent rate limiting
                if (i < mediaToDownload.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (mediaError) {
                console.error(`Error downloading media ${i + 1}:`, mediaError);
                // Continue with next media if one fails
            }
        }

        // Final status update
        const typeInfo = [];
        if (hasVideo && hasPhoto) typeInfo.push("Videos & Photos");
        else if (hasVideo) typeInfo.push("Videos");
        else if (hasPhoto) typeInfo.push("Photos");
        
        await sock.sendMessage(chatId, {
            text: `✅ *DOWNLOAD COMPLETE!* ✅\n\n` +
                  `📊 *Total Files:* ${sentCount} sent\n` +
                  (typeInfo.length ? `🎨 *Content:* ${typeInfo.join(", ")}\n` : '') +
                  `🔗 *Source:* Instagram\n\n` +
                  `✅ *All media sent successfully*\n\n` +
                  `⭐ *Zenitsu-BOT Task Complete* ⭐`,
            edit: statusMsg.key
        });

    } catch (error) {
        console.error('[ZENITSU-BOT IG] Error:', error);
        
        await sock.sendMessage(chatId, { 
            text: "🚫 *SYSTEM ERROR* 🚫\n\nError: " + (error.message || 'Unknown error') + "\n\nPlease try again."
        });
    }
}

module.exports = instagramCommand;