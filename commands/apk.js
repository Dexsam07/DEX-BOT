const axios = require('axios');

async function apkCommand(sock, chatId, message) {
  let statusMsg; // Declare statusMsg here so it's accessible in catch block
  
  try {
    const userMessage = message.message.conversation || message.message.extendedTextMessage?.text || '';
    const appName = userMessage.split(' ').slice(1).join(' ');

    if (!appName) {
      await sock.sendMessage(chatId, {
        text: '⚡ *ZANITSU-BOT APK*\n\n⚠️ Please provide an app name.\n\nExample: `.apk whatsapp`'
      }, { quoted: message });
      return;
    }

    // Send initial status message
    statusMsg = await sock.sendMessage(chatId, {
      text: '⚡ *ZANITSU-BOT APK*\n\n🔍 *Searching for app...*\n⏳ Please wait...'
    }, { quoted: message });

    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

    // Update status to fetching
    await sock.sendMessage(chatId, {
      text: `⚡ *ZANITSU-BOT APK*\n\n🔍 *Searching:* "${appName}"\n⚡ Fetching APK details...`,
      edit: statusMsg.key
    });

    // API call to NexOracle
    const apiUrl = 'https://api.nexoracle.com/downloader/apk';
    const params = { apikey: 'free_key@maher_apis', q: appName };

    const response = await axios.get(apiUrl, { params });

    if (!response.data || response.data.status !== 200 || !response.data.result) {
      await sock.sendMessage(chatId, { delete: statusMsg.key });
      await sock.sendMessage(chatId, {
        text: '❌ *ZANITSU-BOT APK*\n\nUnable to find the APK.\n\n> ρσωєяє∂ ву chrisGaaju'
      }, { quoted: message });
      return;
    }

    const { name, lastup, package: packageName, size, icon, dllink } = response.data.result;

    // Send thumbnail preview
    await sock.sendMessage(chatId, {
      image: { url: icon },
      caption: `⚡ *ZANITSU-BOT APK*\n\n📦 Downloading *${name}*...\n⏳ Please wait...`
    }, { quoted: message });

    // Update status to downloading
    await sock.sendMessage(chatId, {
      text: `⚡ *ZANITSU-BOT APK*\n\n📦 *Found:* ${name}\n⬇️ Downloading APK file...`,
      edit: statusMsg.key
    });

    // Download APK file
    const apkResponse = await axios.get(dllink, { responseType: 'arraybuffer' });
    if (!apkResponse.data) {
      await sock.sendMessage(chatId, { delete: statusMsg.key });
      await sock.sendMessage(chatId, {
        text: '❌ *ZANITSU-BOT APK*\n\nFailed to download the APK.\n\n> ρσωєяє∂ ву chrisGaaju'
      }, { quoted: message });
      return;
    }

    const apkBuffer = Buffer.from(apkResponse.data, 'binary');

    // Delete the status message
    await sock.sendMessage(chatId, { delete: statusMsg.key });

    // Format message with Zenitsu-BOT styling
    const details = `╔══════════════════════════╗
⚡ *ZANITSU-BOT APK* ⚡
╚══════════════════════════╝

📦 *APP DETAILS*
[ ] [ ${name.toUpperCase()} ]
► 📛 Name: ${name}
► 📅 Last Update: ${lastup}
► 📦 Package: ${packageName}
► ⚖️ Size: ${size}

✅ *Download Complete*
⚡ File is ready to install.

⭐ *Powered by Zenitsu-BOT*
> ρσωєяє∂ ву chrisGaaju`;

    // Send APK as document
    await sock.sendMessage(chatId, {
      document: apkBuffer,
      mimetype: 'application/vnd.android.package-archive',
      fileName: `${name.replace(/[^a-z0-9]/gi, '_')}.apk`,
      caption: details
    }, { quoted: message });

    // Success reaction
    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

  } catch (error) {
    console.error('[ZANITSU-BOT APK] Error:', error);

    // Try to delete status message on error
    try {
      if (statusMsg) {
        await sock.sendMessage(chatId, { delete: statusMsg.key });
      }
    } catch (e) {
      // Ignore delete errors
    }

    await sock.sendMessage(chatId, {
      text: '❌ *ZANITSU-BOT APK*\n\nUnable to fetch APK details.\n\n> ρσωєяє∂ ву chrisGaaju'
    }, { quoted: message });

    await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
  }
}

module.exports = apkCommand;
