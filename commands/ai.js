const axios = require("axios");

async function aiCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: '🤖 *Dex 𝙗𝙤𝙩AI*\n\nPlease provide a question.\n\nExamples:\n• .gpt write a story\n• .deepseek explain quantum computing\n• .gemini what is AI?'
            }, { quoted: message });
        }

        // Get the command and query
        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, { 
                text: '🤖 *Dex 𝙗𝙤𝙩AI*\n\nPlease provide a question.'
            }, { quoted: message });
        }

        // React while processing
        await sock.sendMessage(chatId, {
            react: { text: "🤖", key: message.key }
        });

        let apiUrl = '';
        let modelName = '';
        
        if (command === '.gpt') {
            apiUrl = `https://all-in-1-ais.officialhectormanuel.workers.dev/?query=${encodeURIComponent(query)}&model=gpt-4.5`;
            modelName = 'GPT-4.5';
        } else if (command === '.deepseek') {
            apiUrl = `https://all-in-1-ais.officialhectormanuel.workers.dev/?query=${encodeURIComponent(query)}&model=deepseek`;
            modelName = 'DeepSeek';
        } else if (command === '.gemini') {
            apiUrl = `https://all-in-1-ais.officialhectormanuel.workers.dev/?query=${encodeURIComponent(query)}&model=gemini`;
            modelName = 'Gemini';
        } else {
            await sock.sendMessage(chatId, { 
                text: '🤖 *Dex 𝙗𝙤𝙩AI*\n\n❌ Invalid command.\n\nAvailable commands:\n• .gpt - ChatGPT 4.5\n• .deepseek - DeepSeek AI\n• .gemini - Google Gemini\n\n> ρσωєяє∂ ву Dex Shyam Chaudhari'
            }, { quoted: message });
            return;
        }

        // Call the all-in-one API
        const response = await axios.get(apiUrl, { timeout: 30000 });

        if (response.data && response.data.success && response.data.message?.content) {
            const answer = response.data.message.content;
            
            // Format with Dex 𝙗𝙤𝙩styling
            const formattedResponse = `🤖 *Dex 𝙗𝙤𝙩${modelName.toUpperCase()}*\n\n` +
                                    `📝 *Question:* ${query}\n\n` +
                                    `💡 *Answer:*\n${answer}\n\n` +
                                    `⭐ *Powered by DEX-BOT*\n` +
                                    `> ρσωєяє∂ ву Dex Shyam Chaudhari`;
            
            await sock.sendMessage(chatId, { text: formattedResponse }, { quoted: message });
            
            // Success reaction
            await sock.sendMessage(chatId, {
                react: { text: "✅", key: message.key }
            });
            
        } else {
            throw new Error(`Invalid ${modelName} response`);
        }
    } catch (error) {
        console.error('[Dex 𝙗𝙤𝙩AI] Error:', error.message);
        
        await sock.sendMessage(chatId, { 
            text: `🤖 *Dex 𝙗𝙤𝙩AI*\n\n❌ ${error.message || 'AI service failed'}\n\n💡 Please try again later.\n\n> ρσωєяє∂ ву Dex Shyam Chaudhari`
        }, { quoted: message });
        
        await sock.sendMessage(chatId, {
            react: { text: "❌", key: message.key }
        });
    }
}

module.exports = aiCommand;
