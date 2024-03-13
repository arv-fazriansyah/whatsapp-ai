const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://data-base-14ae0-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

require('dotenv').config(); // Load environment variables
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = process.env.MODEL_NAME || "gemini-1.0-pro";
const API_KEY = process.env.API_KEY;

const generationConfig = {
    temperature: 0.9,
    topK: 1,
    topP: 1,
    maxOutputTokens: 2048
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

const client = new Client({ authStrategy: new LocalAuth(), puppeteer: { args: ['--no-sandbox'] } });

client.on('ready', () => console.log('Client is ready!'));
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('message_create', handleMessage);

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

async function handleMessage(message, retry = false) {
    if (message.isBroadcast) return; // No response for status_broadcast messages
    if (message.fromMe) return;

    try {
        if (message.body.toLowerCase() === '!new') {
            // Remove conversation from Firebase
            const sanitizedPhoneNumber = message.from.replace(/[@.\-+cu]|us|s$/g, '');
            await db.ref('history/' + sanitizedPhoneNumber).remove();

            message.reply("_New conversation started_");
            return;
        }

        const sanitizedPhoneNumber = message.from.replace(/[@.\-+cu]|us|s$/g, '');
        let userHistory = [];

        // Check if conversation history exists in Firebase
        const userHistorySnapshot = await db.ref('history/' + sanitizedPhoneNumber).once('value');
        if (userHistorySnapshot.exists()) {
            userHistory = userHistorySnapshot.val();
        }

        const chat = model.startChat({
            generationConfig,
            safetySettings,
            history: [...history, ...userHistory] // Merged with existing history
        });

        const result = await chat.sendMessage(message.body);
        const modelResponse = result.response.text();

        // Push new message to existing conversation
        userHistory.push(
            { role: "user", parts: [{ text: message.body }] },
            { role: "model", parts: [{ text: modelResponse }] }
        );

        // Store the updated chat history to Firebase
        await db.ref('history/' + sanitizedPhoneNumber).set(userHistory);

        message.reply(modelResponse);
    } catch (error) {
        console.error(error);
        if (error.message.includes('503 Service Unavailable')) {
            console.log('503 Service Unavailable: The model is overloaded. Resending message to model...');

            if (!retry) {
                // If not already retrying, try resending the message with previous history
                handleMessage(message, true);
            }
        } else if (error.message.includes('Text not available. Response was blocked due to SAFETY')) {
            message.reply("_Content not available. Response was blocked due to safety reasons. Please use a different query!_");
        } else {
            message.reply(`_*Error*:_\n_${error.message}_`);
        }
    }
}

client.initialize();
