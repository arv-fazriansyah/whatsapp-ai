require('dotenv').config(); // Load environment variables
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// Load environment variables or use default values
const MODEL_NAME = process.env.MODEL_NAME || "gemini-1.0-pro";
const API_KEY = process.env.API_KEY;

// Configuration for message generation
const generationConfig = {
    temperature: 0.9,
    topK: 1,
    topP: 1,
    maxOutputTokens: 2048
};

// Safety settings for model response
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// History for the model response
const history = [
    { role: "user", parts: [{ text: "Kamu adalah Veronisa dirancang oleh fazriansyah.my.id. Asisten yang sangat membantu, kreatif, pintar, dan ramah." }] },
    { role: "model", parts: [{ text: "Halo, aku Veronisa dirancang oleh fazriansyah.my.id. Asisten yang sangat membantu, kreatif, pintar, dan ramah." }] },
];

const client = new Client({ 
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox'] // Tambahkan opsi --no-sandbox di sini
    }
});

client.on('ready', () => console.log('Client is ready!'));

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('message_create', handleMessage);

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

async function handleMessage(message) {
    if (message.fromMe) return;

    try {
        const chat = model.startChat({
            generationConfig,
            safetySettings,
            history,
        });

        const result = await chat.sendMessage(message.body);
        const modelResponse = result.response.text();

        console.log(`User ${message.from}: ${message.body}`); // ID pengguna dan pesan yang diterima dari pengguna
        console.log("Model:", modelResponse); // Jawaban yang dihasilkan oleh model

        message.reply(modelResponse);
    } catch (error) {
        console.error(error);
        if (error.message.includes('503 Service Unavailable')) {
            console.log('503 Service Unavailable: The model is overloaded. Resending message to model...');
            handleMessage(message); // Memanggil kembali handleMessage untuk mengirim ulang pesan ke model
        } else if (error.message.includes('Text not available. Response was blocked due to SAFETY')) {
            message.reply("_Konten tidak tersedia. Respon diblokir karena alasan keamanan. Mohon gunakan pertanyaan lain!_");
        } else {
            message.reply(`_*Error*:_\n_${error.message}_`);
        }
    }
}

client.initialize();
