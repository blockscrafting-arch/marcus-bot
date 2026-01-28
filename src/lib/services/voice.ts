import { File } from 'node:buffer';
import { openRouter } from '@/lib/ai/client';

/**
 * Преобразует голосовое сообщение в текст.
 */
export async function transcribeVoice(telegramFileUrl: string): Promise<string> {
  const response = await fetch(telegramFileUrl);
  if (!response.ok) {
    throw new Error('Не удалось скачать голосовое сообщение');
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const file = new File([buffer], 'voice.ogg', { type: 'audio/ogg' });
  const transcription = await openRouter.audio.transcriptions.create({
    model: 'whisper-1',
    file,
  });
  return transcription.text || '';
}

