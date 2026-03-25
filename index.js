require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Add this function to log messages
function logMessage(message, direction = 'received') {
    try {
        const timestamp = new Date().toLocaleString();
        const chatId = message.key?.remoteJid || 'unknown';
        const isChannel = chatId.includes('@newsletter');
        
        // Get message content
        let content = '';
        if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage?.caption) {
            content = `[IMAGE] ${message.message.imageMessage.caption}`;
        } else if (message.message?.videoMessage?.caption) {
            content = `[VIDEO] ${message.message.videoMessage.caption}`;
        } else if (message.message?.stickerMessage) {
            content = '[STICKER]';
        } else if (message.message?.audioMessage) {
            content = '[AUDIO]';
        } else if (message.message?.documentMessage?.fileName) {
            content = `[DOCUMENT] ${message.message.documentMessage.fileName}`;
        } else if (message.message?.protocolMessage) {
            content = '[PROTOCOL MESSAGE]';
        } else {
            content = '[OTHER MEDIA]';
        }

        // Format the log
        const logEntry = `
════════════════════════════════════════
📅 ${timestamp}
📊 DIRECTION: ${direction === 'received' ? '📥 RECEIVED' : '📤 SENT'}
💬 CHAT ID: ${chatId}
${isChannel ? '📢 CHANNEL/NEWSLETTER DETECTED!' : ''}
${content ? `📝 CONTENT: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}` : '📝 [NO TEXT CONTENT]'}
════════════════════════════════════════
`;

        // Log to console with colors
        if (direction === 'received') {
            console.log('\x1b[36m%s\x1b[0m', logEntry); // Cyan for received
        } else {
            console.log('\x1b[32m%s\x1b[0m', logEntry); // Green for sent
        }

        // Also save to log file
        const logDir = './logs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const date = new Date();
        const dateStr = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        const logFile = path.join(logDir, `messages-${dateStr}.log`);
        
        fs.appendFileSync(logFile, logEntry + '\n', 'utf8');
        
    } catch (error) {
        console.error('Error logging message:', error);
    }
}

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Memory cleanup completed')
    }
}, 60_000) // every 1 minute

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ High memory usage detected, restarting...')
        process.exit(1) // Will auto-restart
    }
}, 30_000) // check every 30 seconds

let phoneNumber = "91xxx"
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "Dex bot"
global.themeemoji = "⚡"
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environment, use ownerNumber from settings
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}

async function startDexBot() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()

        const DexBot = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Save credentials when they update
        DexBot.ev.on('creds.update', saveCreds)

    store.bind(DexBot.ev)

    // Message handling
    DexBot.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            
            // Log received message
            if (chatUpdate.type === 'notify' || chatUpdate.type === 'append') {
                logMessage(mek, 'received');
            }
            
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(DexBot, chatUpdate);
                return;
            }
            // In private mode, only block non-group messages (allow groups for moderation)
            if (!DexBot.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return // Block DMs in private mode, but allow group messages
            }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            // Clear message retry cache to prevent memory bloat
            if (DexBot?.msgRetryCounterCache) {
                DexBot.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(DexBot, chatUpdate, true)
            } catch (err) {
                console.error("[DexBot] Message handler error:", err)
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await DexBot.sendMessage(mek.key.remoteJid, {
                        text: '🚫 *DexBot SYSTEM ERROR* 🚫\n\nAn error occurred while processing your request.\nPlease try again.',
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363406449026172@newsletter',
                                newsletterName: 'Dex Shyam Tech',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("[DexBot] Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    DexBot.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    DexBot.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = DexBot.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    DexBot.getName = (jid, withoutContact = false) => {
        id = DexBot.decodeJid(jid)
        withoutContact = DexBot.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = DexBot.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === DexBot.decodeJid(DexBot.user.id) ?
            DexBot.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    DexBot.public = true

    DexBot.serializeM = (m) => smsg(DexBot, m, store)

    // Handle pairing code
    if (pairingCode && !DexBot.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`\n⚡ *DexBot SETUP* ⚡\n\n📱 Enter your WhatsApp number:\nFormat: 234xxx (without + or spaces)\n\n👉 Input: `)))
        }

        // Clean the phone number - remove any non-digit characters
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        // Validate the phone number using awesome-phonenumber
        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('❌ Invalid phone number. Please enter your full international number (e.g., 243xxx for ur country) without + or spaces.'));
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                let code = await DexBot.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                
                console.log(chalk.green('\n' + '═'.repeat(50)))
                console.log(chalk.white.bold('         ⚡ DexBot AUTHENTICATION ⚡'))
                console.log(chalk.green('═'.repeat(50)))
                console.log(chalk.yellow(`\n📱 Pairing Code:`))
                console.log(chalk.white.bgBlue(`    ${code}    `))
                console.log(chalk.green('═'.repeat(50)))
                console.log(chalk.cyan(`\n📲 Setup Instructions:\n`))
                console.log(chalk.white(`1. Open WhatsApp on your phone`))
                console.log(chalk.white(`2. Go to Settings → Linked Devices`))
                console.log(chalk.white(`3. Tap "Link a Device"`))
                console.log(chalk.white(`4. Enter the code above`))
                console.log(chalk.green('═'.repeat(50) + '\n'))
            } catch (error) {
                console.error('❌ Error requesting pairing code:', error)
                console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
            }
        }, 3000)
    }

    // Connection handling
    DexBot.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        
        if (qr) {
            console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
        }
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
        }
        
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`✅ Connected as: ` + JSON.stringify(DexBot.user.id, null, 2)))

            try {
                const botNumber = DexBot.user.id.split(':')[0] + '@s.whatsapp.net';
                await DexBot.sendMessage(botNumber, {
                    text: `⚡ *DexBot SYSTEM ONLINE* ⚡\n\n` +
                          `✅ *Status:* Connected Successfully\n` +
                          `⏰ *Time:* ${new Date().toLocaleString()}\n` +
                          `📊 *Version:* ${settings.version || '1.0.0'}\n\n` +
                          `🚀 *System Ready*\n` +
                          `📥 *Commands:* Active\n` +
                          `🛡️ *Protection:* Enabled\n\n` +
                          `⭐ *DexBot is now online!*`,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363406449026172@newsletter',
                            newsletterName: 'Dex Shyam Tech',
                            serverMessageId: -1
                        }
                    }
                });
            } catch (error) {
                console.error('Error sending connection message:', error.message)
            }

            await delay(1999)
            
            console.log(chalk.green('\n' + '═'.repeat(50)))
            console.log(chalk.white.bold('           ⚡ DexBot ONLINE ⚡'))
            console.log(chalk.green('═'.repeat(50)))
            console.log(chalk.cyan(`🌐 *Bot Name:* ${global.botname}`))
            console.log(chalk.cyan(`📊 *Version:* ${settings.version || '1.0.0'}`))
            console.log(chalk.cyan(`⏰ *Start Time:* ${new Date().toLocaleString()}`))
            console.log(chalk.cyan(`📈 *Memory Usage:* ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`))
            console.log(chalk.green('═'.repeat(50)))
            console.log(chalk.white(`🚀 System Initialized Successfully!`))
            console.log(chalk.white(`📥 All Commands Loaded`))
            console.log(chalk.white(`🛡️ Security Systems Active`))
            console.log(chalk.white(`⚡ Ready to receive commands`))
            console.log(chalk.green('═'.repeat(50) + '\n'))
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            const statusCode = lastDisconnect?.error?.output?.statusCode
            
            console.log(chalk.red(`⚠️ Connection closed: ${lastDisconnect?.error?.message || 'Unknown error'}`))
            console.log(chalk.yellow(`🔄 Reconnecting: ${shouldReconnect ? 'YES' : 'NO'}`))
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try {
                    rmSync('./session', { recursive: true, force: true })
                    console.log(chalk.yellow('🗑️ Session folder deleted. Please re-authenticate.'))
                } catch (error) {
                    console.error('Error deleting session:', error)
                }
                console.log(chalk.red('🔒 Session logged out. Please scan QR code again.'))
            }
            
            if (shouldReconnect) {
                console.log(chalk.yellow('🔄 Reconnecting in 5 seconds...'))
                await delay(5000)
                startDexBot()
            }
        }
    })

    // Track recently-notified callers to avoid spamming messages
    const antiCallNotified = new Set();

    // Anticall handler: block callers when enabled
    DexBot.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // First: attempt to reject the call if supported
                    try {
                        if (typeof DexBot.rejectCall === 'function' && call.id) {
                            await DexBot.rejectCall(call.id, callerJid);
                        } else if (typeof DexBot.sendCallOfferAck === 'function' && call.id) {
                            await DexBot.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Notify the caller only once within a short window
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await DexBot.sendMessage(callerJid, { 
                            text: '📵 *DexBot ANTICALL* 📵\n\nAnticall protection is enabled.\nYour call has been rejected and blocked.' 
                        });
                    }
                } catch {}
                // Then: block after a short delay to ensure rejection and message are processed
                setTimeout(async () => {
                    try { await DexBot.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // ignore
        }
    });

    DexBot.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(DexBot, update);
    });

    DexBot.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(DexBot, m);
        }
    });

    DexBot.ev.on('status.update', async (status) => {
        await handleStatus(DexBot, status);
    });

    DexBot.ev.on('messages.reaction', async (status) => {
        await handleStatus(DexBot, status);
    });

    return DexBot
    } catch (error) {
        console.error('❌ Error in startDexBot:', error)
        await delay(5000)
        startDexBot()
    }
}

// Start the bot with error handling
startDexBot().catch(error => {
    console.error('🚫 Fatal error:', error)
    process.exit(1)
})

process.on('uncaughtException', (err) => {
    console.error('🚫 Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('🚫 Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.green(`🔄 Updated ${__filename}`))
    delete require.cache[file]
    require(file)
})
