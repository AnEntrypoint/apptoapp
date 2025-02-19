const dotenv = require('dotenv');
const Together = require('together-ai');

// Load environment variables from .env file
dotenv.config();

const together = new Together(process.env.TOGETHER_API_KEY); // Use API key from dotenv

async function fetchResponse() {
    try {
        const response = await together.chat.completions.create({
            messages: [
                {
                    "role": "user",
                    "content": "test"
                }
            ],
            model: process.env.TOGETHER_MODEL || "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free", // Use model from dotenv or fallback
            max_tokens: null,
            temperature: 0.1,
            top_p: 0.7,
            top_k: 50,
            repetition_penalty: 1,
            stop: ["<｜end▁of▁sentence｜>"],
            stream: true
        });

        for await (const token of response) {
            console.log(token.choices[0]?.delta?.content);
        }
    } catch (error) {
        console.error('Error fetching response:', error);
    }
}

fetchResponse();