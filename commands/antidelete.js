const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');

const messageStore = new Map();
const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');

// Ensure tmp dir exists
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Function to get folder size in MB
const getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }

        return totalSize / (1024 * 1024); // Convert bytes to MB
    } catch (err) {
        console.error('Error getting folder size:', err);
        return 0;
    }
};

// Function to clean temp folder if size exceeds 200MB
const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
        
        if (sizeMB > 200) {
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                const filePath = path.join(TEMP_MEDIA_DIR, file);
                fs.unlinkSync(filePath);
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
};

// Start periodic cleanup check every 1 minute
setInterval(cleanTempFolderIfLarge, 60 * 1000);

// Load config
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
        return JSON.parse(fs.readFileSync(CONFIG_PATH));
    } catch {
        return { enabled: false };
    }
}

// Save config
function saveAntideleteConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Config save error:', err);
    }
}

// Command Handler
async function handleAntideleteCommand(sock, chatId, message, match) {
    if (!message.key.fromMe) {
        return sock.sendMessage(chatId, { 
            text: '🚫 *UNAUTHORIZED* 🚫\n\nOnly the bot owner can use this command.' 
        }, { quoted: message });
    }

    const config = loadAntideleteConfig();

    // Send initial status message
    if (!match) {
        const statusMsg = await sock.sendMessage(chatId, {
            text: '🛡️ *DEX-BOT ANTIDELETE SYSTEM* 🛡️\n\n🔍 *Checking current status...*'
        }, { quoted: message });

        await sock.sendMessage(chatId, {
            text: `🛡️ *DEX-BOT ANTIDELETE SYSTEM* 🛡️\n\n` +
                  `📊 *Current Status:* ${config.enabled ? '✅ ENABLED' : '❌ DISABLED'}\n\n` +
                  `⚡ *Storage Stats:*\n` +
                  `• Messages stored: ${messageStore.size}\n` +
                  `• Temp folder size: ${getFolderSizeInMB(TEMP_MEDIA_DIR).toFixed(2)} MB\n\n` +
                  `🔧 *COMMANDS:*\n` +
                  `• *.antidelete on* - Enable protection\n` +
                  `• *.antidelete off* - Disable protection\n\n` +
                  `📋 *FEATURES:*\n` +
                  `• Captures deleted messages\n` +
                  `• Captures deleted media\n` +
                  `• Anti-view-once protection\n` +
                  `• Group & Private chats\n\n` +
                  `⭐ *Powered by DEX-BOT*`,
            edit: statusMsg.key
        });
        return;
    }

    const statusMsg = await sock.sendMessage(chatId, {
        text: `⚙️ *Processing command...*\n\n🔄 ${match === 'on' ? 'Enabling' : 'Disabling'} antidelete...`
    }, { quoted: message });

    if (match === 'on') {
        config.enabled = true;
        saveAntideleteConfig(config);
        
        await sock.sendMessage(chatId, {
            text: `✅ *ANTIDELETE ENABLED* ✅\n\n` +
                  `🛡️ *Protection Status:* ACTIVE\n` +
                  `📊 *Storage Mode:* READY\n` +
                  `⚡ *Real-time Monitoring:* ON\n\n` +
                  `🔔 *Now monitoring:*\n` +
                  `• Deleted messages\n` +
                  `• Deleted media\n` +
                  `• View-once messages\n` +
                  `• Photos & Videos\n` +
                  `• Audio & Documents\n\n` +
                  `📤 *Deleted content will be forwarded to owner*\n\n` +
                  `⭐ *DEX-BOT Protection Active* ⭐`,
            edit: statusMsg.key
        });
    } else if (match === 'off') {
        config.enabled = false;
        saveAntideleteConfig(config);
        
        // Clear message store
        for (const [id, data] of messageStore.entries()) {
            if (data.mediaPath && fs.existsSync(data.mediaPath)) {
                try { fs.unlinkSync(data.mediaPath); } catch {}
            }
        }
        messageStore.clear();
        
        await sock.sendMessage(chatId, {
            text: `❌ *ANTIDELETE DISABLED* ❌\n\n` +
                  `🛡️ *Protection Status:* INACTIVE\n` +
                  `📊 *Storage Cleared:* ${messageStore.size} messages\n` +
                  `🗑️ *Temp Files:* Cleaned up\n\n` +
                  `🔕 *Monitoring stopped:*\n` +
                  `• Message storage cleared\n` +
                  `• Media cache cleared\n` +
                  `• Real-time monitoring OFF\n\n` +
                  `💡 *Use .antidelete on to re-enable*\n\n` +
                  `⭐ *DEX-BOT Protection Disabled* ⭐`,
            edit: statusMsg.key
        });
    } else {
        await sock.sendMessage(chatId, {
            text: `❌ *INVALID COMMAND* ❌\n\n` +
                  `🛡️ *DEX-BOT ANTIDELETE SYSTEM*\n\n` +
                  `📝 *Usage:*\n` +
                  `• .antidelete on - Enable\n` +
                  `• .antidelete off - Disable\n\n` +
                  `💡 *Type .antidelete for status*`,
            edit: statusMsg.key
        });
    }
}

// Store incoming messages (also handles anti-view-once by forwarding immediately)
async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return; // Don't store if antidelete is disabled

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';
        let isViewOnce = false;

        const sender = message.key.participant || message.key.remoteJid;

        // Detect content (including view-once wrappers)
        const viewOnceContainer = message.message?.viewOnceMessageV2?.message || message.message?.viewOnceMessage?.message;
        if (viewOnceContainer) {
            // unwrap view-once content
            if (viewOnceContainer.imageMessage) {
                mediaType = 'image';
                content = viewOnceContainer.imageMessage.caption || '';
                const buffer = await downloadContentFromMessage(viewOnceContainer.imageMessage, 'image');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            } else if (viewOnceContainer.videoMessage) {
                mediaType = 'video';
                content = viewOnceContainer.videoMessage.caption || '';
                const buffer = await downloadContentFromMessage(viewOnceContainer.videoMessage, 'video');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            }
        } else if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            const buffer = await downloadContentFromMessage(message.message.imageMessage, 'image');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
            const buffer = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            const buffer = await downloadContentFromMessage(message.message.videoMessage, 'video');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.audioMessage) {
            mediaType = 'audio';
            const mime = message.message.audioMessage.mimetype || '';
            const ext = mime.includes('mpeg') ? 'mp3' : (mime.includes('ogg') ? 'ogg' : 'mp3');
            const buffer = await downloadContentFromMessage(message.message.audioMessage, 'audio');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
            await writeFile(mediaPath, buffer);
        }

        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });

        // Anti-ViewOnce: forward immediately to owner if captured
        if (isViewOnce && mediaType && fs.existsSync(mediaPath)) {
            try {
                const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const senderName = sender.split('@')[0];
                const mediaOptions = {
                    caption: `🕵️ *DEX-BOT VIEW-ONCE CAPTURED*\n\n` +
                            `👤 *Sender:* @${senderName}\n` +
                            `📱 *Number:* ${sender}\n` +
                            `📁 *Type:* ${mediaType.toUpperCase()}\n` +
                            `🔒 *Status:* View-Once Message\n\n` +
                            `🛡️ *Captured by DEX-BOT Anti-Delete*\n` +
                            `⭐ *Forwarded to Owner*`,
                    mentions: [sender]
                };
                if (mediaType === 'image') {
                    await sock.sendMessage(ownerNumber, { image: { url: mediaPath }, ...mediaOptions });
                } else if (mediaType === 'video') {
                    await sock.sendMessage(ownerNumber, { video: { url: mediaPath }, ...mediaOptions });
                }
                // Cleanup immediately for view-once forward
                try { fs.unlinkSync(mediaPath); } catch {}
            } catch (e) {
                // ignore
            }
        }

    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

// Handle message deletion
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        const messageId = revocationMessage.message.protocolMessage.key.id;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || revocationMessage.key.remoteJid;
        const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        if (deletedBy.includes(sock.user.id) || deletedBy === ownerNumber) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        const groupName = original.group ? (await sock.groupMetadata(original.group)).subject : '';

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        // Send notification to owner
        const statusMsg = await sock.sendMessage(ownerNumber, {
            text: `🛡️ *DEX-BOT ANTIDELETE ALERT* 🛡️\n\n` +
                  `🔍 *Detecting deleted content...*\n` +
                  `⏳ *Processing data...*`
        });

        await sock.sendMessage(ownerNumber, {
            text: `🛡️ *DEX-BOT ANTIDELETE ALERT* 🛡️\n\n` +
                  `🚨 *MESSAGE DELETED!* 🚨\n\n` +
                  `🗑️ *Deleted By:* @${deletedBy.split('@')[0]}\n` +
                  `👤 *Original Sender:* @${senderName}\n` +
                  `📱 *Sender Number:* ${sender}\n` +
                  `🕒 *Time Deleted:* ${time}\n` +
                  (groupName ? `👥 *Group:* ${groupName}\n` : `📱 *Chat Type:* Private\n`) +
                  (original.content ? `\n📝 *Deleted Message:*\n${original.content}` : '') +
                  `\n\n📁 *Content Type:* ${original.mediaType ? original.mediaType.toUpperCase() : 'TEXT'}` +
                  `\n\n⚡ *Captured by DEX-BOT Anti-Delete*`,
            edit: statusMsg.key,
            mentions: [deletedBy, sender]
        });

        // Media sending
        if (original.mediaType && fs.existsSync(original.mediaPath)) {
            const mediaOptions = {
                caption: `🛡️ *DEX-BOT RECOVERED MEDIA* 🛡️\n\n` +
                        `📁 *Type:* ${original.mediaType.toUpperCase()}\n` +
                        `👤 *From:* @${senderName}\n` +
                        `📱 *Number:* ${sender}\n` +
                        `🗑️ *Deleted By:* @${deletedBy.split('@')[0]}\n` +
                        `🕒 *Time:* ${time}\n\n` +
                        `⚡ *Recovered by DEX-BOT Anti-Delete*`,
                mentions: [deletedBy, sender]
            };

            try {
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(ownerNumber, {
                            image: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(ownerNumber, {
                            sticker: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(ownerNumber, {
                            video: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'audio':
                        await sock.sendMessage(ownerNumber, {
                            audio: { url: original.mediaPath },
                            mimetype: 'audio/mpeg',
                            ptt: false,
                            ...mediaOptions
                        });
                        break;
                }
            } catch (err) {
                await sock.sendMessage(ownerNumber, {
                    text: `❌ *MEDIA RECOVERY FAILED* ❌\n\nError: ${err.message}\n\nFile may be corrupted.`
                });
            }

            // Cleanup
            try {
                fs.unlinkSync(original.mediaPath);
            } catch (err) {
                console.error('Media cleanup error:', err);
            }
        }

        messageStore.delete(messageId);

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

module.exports = {
    handleAntideleteCommand,
    handleMessageRevocation,
    storeMessage
};
