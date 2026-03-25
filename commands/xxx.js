const axios = require('axios');
const cheerio = require('cheerio');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'http://51.83.103.24:20035/'
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

async function searchContent(query) {
    const apiUrl = `http://51.83.103.24:20035/search?q=${encodeURIComponent(query)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    
    if (res?.data) {
        return parseSearchResults(res.data);
    }
    throw new Error('Search failed');
}

async function getContentByUrl(contentUrl) {
    const apiUrl = `http://51.83.103.24:20035/download?url=${encodeURIComponent(contentUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    
    if (res?.data) {
        return parseDownloadResults(res.data);
    }
    throw new Error('Download failed');
}

function parseSearchResults(html) {
    const $ = cheerio.load(html);
    const results = [];
    
    // Try multiple selectors for different site structures
    const selectors = [
        '.video-item', '.item', '.result-item', '.thumb', '.clip', 
        '.video', '.tile', '.preview', '.card', 'article'
    ];
    
    selectors.forEach(selector => {
        $(selector).each((index, element) => {
            try {
                // Try to get title from multiple possible locations
                let title = '';
                const titleSources = [
                    $(element).find('.title').text(),
                    $(element).find('h3').text(),
                    $(element).find('.name').text(),
                    $(element).find('a[title]').attr('title'),
                    $(element).find('img').attr('alt'),
                    $(element).attr('title')
                ];
                
                for (const source of titleSources) {
                    if (source && source.trim()) {
                        title = source.trim();
                        break;
                    }
                }
                
                // Get URL
                let url = $(element).find('a').attr('href') || 
                         $(element).attr('href') || 
                         $(element).find('a').attr('data-url');
                
                // Get thumbnail
                let thumbnail = $(element).find('img').attr('src') || 
                              $(element).find('img').attr('data-src');
                
                // Get duration
                let duration = $(element).find('.duration').text() || 
                             $(element).find('.time').text() || 
                             $(element).find('.length').text();
                
                if (title && url) {
                    // Clean up URL
                    if (!url.startsWith('http')) {
                        url = url.startsWith('/') ? 
                            `http://51.83.103.24:20035${url}` : 
                            `http://51.83.103.24:20035/${url}`;
                    }
                    
                    // Clean up thumbnail URL
                    if (thumbnail && !thumbnail.startsWith('http')) {
                        thumbnail = thumbnail.startsWith('/') ? 
                            `http://51.83.103.24:20035${thumbnail}` : 
                            `http://51.83.103.24:20035/${thumbnail}`;
                    }
                    
                    results.push({
                        title: title.substring(0, 200), // Limit title length
                        url: url,
                        thumbnail: thumbnail,
                        duration: duration.trim() || 'N/A'
                    });
                }
            } catch (err) {
                console.log('Error parsing element:', err.message);
            }
        });
    });
    
    // Remove duplicates
    const uniqueResults = [];
    const seenUrls = new Set();
    
    for (const result of results) {
        if (!seenUrls.has(result.url)) {
            seenUrls.add(result.url);
            uniqueResults.push(result);
        }
    }
    
    return uniqueResults.slice(0, 10); // Return max 10 results
}

function parseDownloadResults(html) {
    const $ = cheerio.load(html);
    const downloadLinks = [];
    
    // Multiple selectors for download links
    const linkSelectors = [
        'a[href*=".mp4"]', 'a[href*=".mkv"]', 'a[href*=".avi"]', 
        'a[href*=".wmv"]', 'a[href*=".flv"]', 'a[href*="download"]',
        '.download-btn', '.dl-link', '.download-link', '[href*="video"]',
        'source[src*=".mp4"]', 'source[src*=".mkv"]'
    ];
    
    linkSelectors.forEach(selector => {
        $(selector).each((index, element) => {
            try {
                let url = $(element).attr('href') || 
                         $(element).attr('src') || 
                         $(element).attr('data-url') ||
                         $(element).attr('data-src');
                
                if (url) {
                    const text = $(element).text().trim() || $(element).attr('title') || '';
                    const qualityMatch = text.match(/(\d+p|HD|FHD|UHD|4K|720p|1080p|1440p|2160p)/i);
                    
                    // Check if it's a video file
                    const isVideoFile = url.match(/\.(mp4|mkv|avi|wmv|flv|webm)$/i) || 
                                       url.includes('video') || 
                                       url.includes('stream');
                    
                    if (isVideoFile) {
                        // Clean URL
                        if (!url.startsWith('http')) {
                            url = url.startsWith('/') ? 
                                `http://51.83.103.24:20035${url}` : 
                                `http://51.83.103.24:20035/${url}`;
                        }
                        
                        const quality = qualityMatch ? qualityMatch[0].toUpperCase() : 'HD';
                        downloadLinks.push({
                            url: url,
                            quality: quality,
                            size: $(element).attr('data-size') || $(element).text().match(/(\d+\.?\d*\s*(MB|GB))/i)?.[0] || 'N/A'
                        });
                    }
                }
            } catch (err) {
                console.log('Error parsing download link:', err.message);
            }
        });
    });
    
    // Also check video tags
    $('video').each((index, element) => {
        try {
            let src = $(element).attr('src') || 
                     $(element).attr('data-src') || 
                     $(element).find('source').attr('src');
            
            if (src && (src.includes('.mp4') || src.includes('video'))) {
                if (!src.startsWith('http')) {
                    src = src.startsWith('/') ? 
                        `http://51.83.103.24:20035${src}` : 
                        `http://51.83.103.24:20035/${src}`;
                }
                
                downloadLinks.push({
                    url: src,
                    quality: 'HD',
                    size: 'N/A'
                });
            }
        } catch (err) {
            console.log('Error parsing video tag:', err.message);
        }
    });
    
    // Remove duplicates
    const uniqueLinks = [];
    const seenLinks = new Set();
    
    for (const link of downloadLinks) {
        if (!seenLinks.has(link.url)) {
            seenLinks.add(link.url);
            uniqueLinks.push(link);
        }
    }
    
    // Sort by quality (higher first)
    const qualityOrder = { 
        '2160P': 5, '4K': 5, 'UHD': 5, 
        '1440P': 4, 'FHD': 3, '1080P': 3, 
        'HD': 2, '720P': 2, 'SD': 1 
    };
    
    uniqueLinks.sort((a, b) => {
        const aScore = qualityOrder[a.quality.toUpperCase()] || 0;
        const bScore = qualityOrder[b.quality.toUpperCase()] || 0;
        return bScore - aScore;
    });
    
    return uniqueLinks;
}

async function xxxCommand(sock, chatId, message) {
    try {
        // Get message text from different possible locations
        let text = '';
        
        if (message.message?.conversation) {
            text = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            text = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage?.caption) {
            text = message.message.imageMessage.caption;
        } else if (message.message?.videoMessage?.caption) {
            text = message.message.videoMessage.caption;
        }
        
        // Log for debugging
        console.log(`[DEX-BOT XXX] Received message: "${text}" in chat: ${chatId}`);
        
        // Check if message starts with .xxx command
        if (!text.startsWith('.xxx')) {
            console.log(`[DEX-BOT XXX] Message doesn't start with .xxx, ignoring`);
            return;
        }
        
        const args = text.split(' ');
        const searchQuery = args.slice(1).join(' ').trim();

        // Help message if no query
        if (!searchQuery) {
            const helpText = `╔═══════════════════════╗
║    🔞 DEX-BOT XXX BOT 🔞   ║
╚═══════════════════════╝

🎬 *PREMIUM ADULT CONTENT DOWNLOADER*

🔍 *HOW TO USE:*
• \`.xxx search terms\` - Search content
• \`.xxx https://example.com\` - Direct link

📌 *EXAMPLES:*
• \`.xxx step mom\`
• \`.xxx https://xxx.com/video123\`

⚡ *FEATURES:*
• HD/4K Quality
• Fast Downloads
• Works in Groups & Private
• Unlimited Access

⚠️ *18+ ADULTS ONLY*
• Private Use Recommended
• Use Responsibly

╔═══════════════════════╗
║  🚀 POWERED BY DEX-BOT 🚀  ║
╚═══════════════════════╝`;
            
            await sock.sendMessage(chatId, { 
                text: helpText 
            }, { quoted: message });
            return;
        }

        console.log(`[DEX-BOT XXX] Processing query: "${searchQuery}"`);

        // Send initial message
        let statusMsg;
        try {
            statusMsg = await sock.sendMessage(chatId, { 
                text: `🔍 *DEX-BOT XXX BOT*\n\n*Searching:* "${searchQuery}"\n\n⏳ *Please wait while we process your request...*` 
            }, { quoted: message });
        } catch (statusError) {
            console.log(`[DEX-BOT XXX] Could not send quoted message, sending regular`);
            statusMsg = await sock.sendMessage(chatId, { 
                text: `🔍 *DEX-BOT XXX BOT*\n\n*Searching:* "${searchQuery}"\n\n⏳ *Please wait while we process your request...*` 
            });
        }

        let contentUrl = '';
        let contentTitle = '';
        let isDirectUrl = false;

        // Check if it's a direct URL
        if (searchQuery.match(/^https?:\/\//i)) {
            contentUrl = searchQuery;
            isDirectUrl = true;
            console.log(`[DEX-BOT XXX] Direct URL detected: ${contentUrl}`);
            
            try {
                await sock.sendMessage(chatId, {
                    text: `✅ *ZENITSU-MD XXX BOT*\n\n🔗 *Link Detected*\n📥 Processing premium content...\n\n⚡ *Getting download information...*`,
                    edit: statusMsg.key
                });
            } catch (editError) {
                console.log(`[DEX-BOT XXX] Could not edit message, sending new`);
                await sock.sendMessage(chatId, {
                    text: `✅ *DEX-BOT XXX BOT*\n\n🔗 *Link Detected*\n📥 Processing premium content...\n\n⚡ *Getting download information...*`
                });
            }
        } else {
            // Search for content
            console.log(`[ZENITSU-MD XXX] Searching for: "${searchQuery}"`);
            
            try {
                await sock.sendMessage(chatId, {
                    text: `🔎 *DEX-BOT XXX BOT*\n\n*Searching Database:* "${searchQuery}"\n\n📊 *Scanning available content...*`,
                    edit: statusMsg.key
                });
            } catch (editError) {
                await sock.sendMessage(chatId, {
                    text: `🔎 *DEX-BOT XXX BOT*\n\n*Searching Database:* "${searchQuery}"\n\n📊 *Scanning available content...*`
                });
            }

            let searchResults;
            try {
                searchResults = await searchContent(searchQuery);
                console.log(`[DEX-BOT XXX] Found ${searchResults.length} results`);
            } catch (error) {
                console.error(`[DEX-BOT XXX] Search error:`, error);
                
                try {
                    await sock.sendMessage(chatId, {
                        text: `❌ *DEX-BOT XXX BOT*\n\n🚫 *Search Failed!*\n\n*Error:* ${error.message}\n\n🔧 *Try different keywords*`,
                        edit: statusMsg.key
                    });
                } catch (editError) {
                    await sock.sendMessage(chatId, {
                        text: `❌ *DEX-BOT XXX BOT*\n\n🚫 *Search Failed!*\n\n*Error:* ${error.message}\n\n🔧 *Try different keywords*`
                    });
                }
                return;
            }

            if (!searchResults || searchResults.length === 0) {
                console.log(`[DEX-BOT XXX] No results found for: "${searchQuery}"`);
                
                try {
                    await sock.sendMessage(chatId, {
                        text: `❌ *DEX-BOT XXX BOT*\n\n🔍 *No Results Found!*\n\n*Try different keywords or be more specific*\n\n💡 *Tip:* Use relevant search terms`,
                        edit: statusMsg.key
                    });
                } catch (editError) {
                    await sock.sendMessage(chatId, {
                        text: `❌ *DEX-BOT XXX BOT*\n\n🔍 *No Results Found!*\n\n*Try different keywords or be more specific*\n\n💡 *Tip:* Use relevant search terms`
                    });
                }
                return;
            }
            
            // Use first result
            const content = searchResults[0];
            contentUrl = content.url;
            contentTitle = content.title;
            
            console.log(`[DEX-BOT XXX] Selected content: ${contentTitle} (${contentUrl})`);
            
            try {
                await sock.sendMessage(chatId, {
                    text: `✅ *DEX-BOT XXX BOT*\n\n🎬 *Content Found!*\n\n📛 *Title:* ${contentTitle}\n⏱️ *Duration:* ${content.duration}\n\n⏬ *Starting premium download...*`,
                    edit: statusMsg.key
                });
            } catch (editError) {
                await sock.sendMessage(chatId, {
                    text: `✅ *DEX-BOT XXX BOT*\n\n🎬 *Content Found!*\n\n📛 *Title:* ${contentTitle}\n⏱️ *Duration:* ${content.duration}\n\n⏬ *Starting premium download...*`
                });
            }
        }

        // Update message for downloading
        try {
            await sock.sendMessage(chatId, {
                text: `⬇️ *DEX-BOT XXX BOT*\n\n*Downloading Premium Content...*\n\n🎯 *Quality:* Highest Available\n⚡ *Status:* Processing Request\n\n⏳ *This may take a moment...*`,
                edit: statusMsg.key
            });
        } catch (editError) {
            await sock.sendMessage(chatId, {
                text: `⬇️ *DEX-BOT XXX BOT*\n\n*Downloading Premium Content...*\n\n🎯 *Quality:* Highest Available\n⚡ *Status:* Processing Request\n\n⏳ *This may take a moment...*`
            });
        }

        let downloadLinks;
        try {
            downloadLinks = await getContentByUrl(contentUrl);
            console.log(`[DEX-BOT XXX] Found ${downloadLinks.length} download links`);
        } catch (error) {
            console.error(`[DEX-BOT XXX] Download error:`, error);
            
            try {
                await sock.sendMessage(chatId, {
                    text: `❌ *DEX-BOT XXX BOT*\n\n🚫 *Download Failed!*\n\n*Error:* ${error.message}\n\n🔧 *Try again or use different link*`,
                    edit: statusMsg.key
                });
            } catch (editError) {
                await sock.sendMessage(chatId, {
                    text: `❌ *DEX-BOT XXX BOT*\n\n🚫 *Download Failed!*\n\n*Error:* ${error.message}\n\n🔧 *Try again or use different link*`
                });
            }
            return;
        }

        if (!downloadLinks || downloadLinks.length === 0) {
            console.log(`[DEX-BOT XXX] No download links found for: ${contentUrl}`);
            
            try {
                await sock.sendMessage(chatId, {
                    text: `❌ *DEX-BOT XXX BOT*\n\n🚫 *No Download Links Found!*\n\n*Possible reasons:*\n• Link restricted\n• Content removed\n• Server issue\n\n🔧 *Try a different link*`,
                    edit: statusMsg.key
                });
            } catch (editError) {
                await sock.sendMessage(chatId, {
                    text: `❌ *DEX-BOT XXX BOT*\n\n🚫 *No Download Links Found!*\n\n*Possible reasons:*\n• Link restricted\n• Content removed\n• Server issue\n\n🔧 *Try a different link*`
                });
            }
            return;
        }

        // Use best quality download link
        const bestQuality = downloadLinks[0];
        console.log(`[DEX-BOT XXX] Selected download: ${bestQuality.url} (${bestQuality.quality})`);
        
        // Update message to show download complete
        const finalTitle = isDirectUrl ? 'Premium Adult Content' : (contentTitle || 'Unknown Title');
        
        try {
            await sock.sendMessage(chatId, {
                text: `✅ *DEX-BOT XXX BOT*\n\n*Download Complete!*\n\n🎬 *Title:* ${finalTitle}\n⚡ *Quality:* ${bestQuality.quality}\n📁 *Format:* MP4\n💾 *Size:* ${bestQuality.size}\n\n📤 *Sending content to you...*`,
                edit: statusMsg.key
            });
        } catch (editError) {
            await sock.sendMessage(chatId, {
                text: `✅ *DEX-BOT XXX BOT*\n\n*Download Complete!*\n\n🎬 *Title:* ${finalTitle}\n⚡ *Quality:* ${bestQuality.quality}\n📁 *Format:* MP4\n💾 *Size:* ${bestQuality.size}\n\n📤 *Sending content to you...*`
            });
        }

        // Send video with premium caption
        const caption = `╔═══════════════════════╗
║    🔞 DEX-BOT XXX BOT 🔞   ║
╚═══════════════════════╝

🎬 *TITLE:* ${finalTitle}
⚡ *QUALITY:* ${bestQuality.quality}
📁 *FORMAT:* MP4
💾 *SIZE:* ${bestQuality.size}

✅ *STATUS:* Premium Download Complete

📌 *FEATURES:*
• High Definition
• Fast Streaming
• Direct Access

⚠️ *18+ ADULTS ONLY*
• Private Use Recommended
• Use Responsibly

╔═══════════════════════╗
║  🚀 POWERED BY DEX-BOT 🚀  ║
╚═══════════════════════╝`;

        try {
            await sock.sendMessage(chatId, {
                video: { url: bestQuality.url },
                mimetype: 'video/mp4',
                fileName: `DEX-BOT_${finalTitle.substring(0, 30).replace(/[^a-z0-9]/gi, '_')}.mp4`,
                caption: caption
            });
        } catch (sendError) {
            console.error(`[DEX-BOT XXX] Error sending video:`, sendError);
            
            // If video fails to send, send the direct link
            await sock.sendMessage(chatId, {
                text: `⚠️ *DEX-BOT XXX BOT*\n\n*Could not send video directly*\n\n🔗 *Direct Download Link:*\n${bestQuality.url}\n\n📁 *Use this link to download*`
            });
        }

        // Final edit to show completion status
        try {
            await sock.sendMessage(chatId, {
                text: `✅ *DEX-BOT XXX BOT*\n\n*Task Completed Successfully!*\n\n🎬 *Title:* ${finalTitle}\n⚡ *Quality:* ${bestQuality.quality}\n📁 *Format:* MP4\n\n⭐ *Thank you for using DEX-BOT Premium Services!* ⭐`,
                edit: statusMsg.key
            });
        } catch (editError) {
            // If we can't edit, just send a new message
            await sock.sendMessage(chatId, {
                text: `✅ *DEX-BOT XXX BOT*\n\n*Task Completed Successfully!*\n\n🎬 *Title:* ${finalTitle}\n⚡ *Quality:* ${bestQuality.quality}\n📁 *Format:* MP4\n\n⭐ *Thank you for using BENZO-MD Premium Services!* ⭐`
            });
        }

        console.log(`[DEX-BOT XXX] Command completed successfully for: "${searchQuery}"`);

    } catch (error) {
        console.error('[DEX-BOT XXX BOT] Error:', error);
        
        // Send error message
        try {
            await sock.sendMessage(chatId, { 
                text: `╔═══════════════════════╗
║    🚨 DEX-BOT ERROR 🚨    ║
╚═══════════════════════╝

❌ *SYSTEM ERROR*

🔧 *Details:* ${error.message}

💡 *Solutions:*
• Check your internet
• Try different keywords
• Wait a few minutes

╔═══════════════════════╗
║  🚀 POWERED BY DEX-BOT 🚀  ║
╚═══════════════════════╝` 
            });
        } catch (sendError) {
            console.error(`[DEX-BOT XXX] Could not send error message:`, sendError);
        }
    }
}

// Export the function
module.exports = {
    xxxCommand: xxxCommand,
    // Also export for compatibility
    default: xxxCommand
};
