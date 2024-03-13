require('dotenv').config(); // Load environment variables
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = process.env.MODEL_NAME || "gemini-1.0-pro";
const API_KEY = process.env.API_KEY;

const generationConfig = {
    temperature: 0.9, // Mengurangi temperatur untuk respons yang lebih konsisten
    topK: 1, // Meningkatkan topK untuk variasi yang lebih besar
    topP: 1, // Mengurangi topP untuk respons yang lebih konsisten
    maxOutputTokens: 2048 // Mengurangi maxOutputTokens untuk mengurangi waktu komputasi
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const history = [
    { role: "user", parts: [{ text: "Kamu adalah Veronisa dirancang oleh fazriansyah.my.id. Asisten yang sangat membantu, kreatif, pintar, dan ramah." }] },
    { role: "model", parts: [{ text: "Halo, aku Veronisa dirancang oleh fazriansyah.my.id. Asisten yang sangat membantu, kreatif, pintar, dan ramah." }] },
];

const existingConversation = {};

const client = new Client({ authStrategy: new LocalAuth(), puppeteer: { args: ['--no-sandbox'] } });

client.on('ready', () => console.log('Client is ready!'));
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('message_create', handleMessage);

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

async function handleMessage(message) {
    // Memeriksa apakah pesan merupakan pesan siaran, jika iya, kita abaikan
    if (message.isBroadcast) return;

    if (message.fromMe) return;

    try {
        if (message.body.toLowerCase() === '!new') {
            delete existingConversation[message.from];
            message.reply("_New conversations started_");
            return;
        }

        const userHistory = existingConversation[message.from] || [];
        const chat = model.startChat({
            generationConfig,
            safetySettings,
            history: [...history, ...userHistory]
        });

        const result = await chat.sendMessage(message.body);
        const modelResponse = result.response.text();

        //console.log(`User ${message.from}: ${message.body}`);
        //console.log("Model:", modelResponse);

        if (!existingConversation[message.from]) {
            existingConversation[message.from] = [];
        }
        existingConversation[message.from].push(
            { role: "user", parts: [{ text: message.body }] },
            { role: "model", parts: [{ text: modelResponse }] }
        );

        message.reply(modelResponse);
    } catch (error) {
        console.error(error);
        if (error.message.includes('503 Service Unavailable')) {
            console.log('503 Service Unavailable: The model is overloaded. Resending message to model...');
            handleMessage(message);
        } else if (error.message.includes('Text not available. Response was blocked due to SAFETY')) {
            message.reply("_Content not available. Response was blocked due to safety reasons. Please use a different query!_");
        } else {
            message.reply(`_*Error*:_\n_${error.message}_`);
        }
    }
}

client.initialize();
