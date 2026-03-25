const fetch = require('node-fetch');

async function goodnightCommand(sock, chatId, message) {
    try {
        // Original API endpoint
        const shizokeys = 'shizo';
        const res = await fetch(`https://shizokeys.onrender.com/api/texts/lovenight?apikey=${shizokeys}`);
        
        if (!res.ok) {
            // If original API fails, use fallback English messages
            throw new Error('API failed');
        }
        
        const json = await res.json();
        
        // Check if message is likely in English, otherwise use fallback
        let goodnightMessage;
        
        // Try to detect if message contains non-Latin characters
        const originalMessage = json.result || json.message || '';
        const hasNonLatin = /[^\x00-\x7F]/.test(originalMessage);
        
        if (hasNonLatin) {
            // If message has non-Latin characters, use our English fallback
            goodnightMessage = getEnglishGoodnightMessage();
        } else {
            // If it looks like English, use the API response
            goodnightMessage = originalMessage;
        }

        // Send the styled goodnight message
        const styledMessage = `✨ *GOODNIGHT WISHES* ✨\n━━━━━━━━━━━━━━━━━━━━\n${goodnightMessage}\n━━━━━━━━━━━━━━━━━━━━\n🌙 Sleep Well • Sweet Dreams 🌙`;
        
        await sock.sendMessage(chatId, { text: styledMessage }, { quoted: message });
        
    } catch (error) {
        console.error('Error in goodnight command:', error);
        
        // Use fallback English messages
        const fallbackMessage = getEnglishGoodnightMessage();
        const styledFallback = `✨ *GOODNIGHT WISHES* ✨\n━━━━━━━━━━━━━━━━━━━━\n${fallbackMessage}\n━━━━━━━━━━━━━━━━━━━━\n🌙 Sleep Well • Sweet Dreams 🌙`;
        
        await sock.sendMessage(chatId, { text: styledFallback }, { quoted: message });
    }
}

// Collection of English goodnight messages
function getEnglishGoodnightMessage() {
    const messages = [
        "As the stars begin to shine, I wish you a peaceful night. May your dreams be filled with happiness and your sleep be deep and restful. Goodnight! 🌙",
        
        "The moon is high, the world is quiet. Close your eyes and let the day fade away. Tomorrow is a new beginning. Sleep tight, my friend. 💫",
        
        "May the night bring you peace, the stars bring you dreams, and the moon light your way to a beautiful tomorrow. Goodnight and sweet dreams! ✨",
        
        "As you lay down to rest, remember that today's worries are gone. Tomorrow holds new opportunities. Sleep well and recharge for the amazing day ahead. 🌠",
        
        "The night sky is a blanket of dreams. Wrap yourself in its comfort and drift into a world of peace. Goodnight, sleep tight, don't let the bed bugs bite! 🌌",
        
        "Stars are shining just for you, the moon is smiling too. Close your eyes and dream away, tomorrow's a brand new day. Goodnight! 🌟",
        
        "May your pillow be soft, your dreams be sweet, and your sleep be deep. Tomorrow awaits with new adventures. Goodnight and pleasant dreams! 🛌",
        
        "The night whispers peace, the stars twinkle magic. Let go of the day's stress and embrace the calm. Sweet dreams and goodnight! 💤",
        
        "As the clock ticks towards midnight, I send you wishes for a night filled with peaceful dreams and a heart full of contentment. Sleep well! ⏰",
        
        "The world is sleeping, dreams are weaving. May yours be beautiful and your rest be complete. Goodnight, my dear friend! 🌙✨"
    ];
    
    // Return a random message
    return messages[Math.floor(Math.random() * messages.length)];
}

module.exports = { goodnightCommand };
