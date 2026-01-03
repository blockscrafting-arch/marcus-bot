import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('OPENAI_API_KEY не установлен в переменных окружения!');
}

const openai = new OpenAI({
  apiKey: apiKey,
});

export default openai;

