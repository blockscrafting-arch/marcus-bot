import { logger } from '@/lib/utils/logger';

const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';
const DEEP_RESEARCH_MODEL = 'sonar-deep-research';
const RESEARCH_TIMEOUT_MS = 180_000; // 3 минуты для глубокого исследования

type PerplexityMessage = { role: 'user' | 'system' | 'assistant'; content: string };

/**
 * Выполняет глубокое исследование через Perplexity Sonar Deep Research.
 * Модель исследует сотни источников и генерирует детальный отчёт.
 */
export async function deepResearch(query: string): Promise<{ content: string; citations?: string[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    logger.error('PERPLEXITY_API_KEY не задан');
    return { content: 'Сервис глубокого исследования не настроен. Добавь PERPLEXITY_API_KEY.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEP_RESEARCH_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Ты исследователь. Отвечай ТОЛЬКО на русском языке. Будь кратким: выделяй главное, избегай воды и повторов. Структурируй ответ (списки, подзаголовки), без длинных абзацев. Итог — 1–3 предложения в конце.',
          },
          { role: 'user', content: query },
        ] as PerplexityMessage[],
        max_tokens: 4096,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      logger.error(
        { status: response.status, body: errText, query: query.slice(0, 100) },
        'Ошибка Perplexity Deep Research API'
      );
      return {
        content: 'Не удалось выполнить глубокое исследование. Попробуй позже или упрости вопрос.',
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    const citations = data.citations;

    if (!content) {
      logger.warn({ query: query.slice(0, 100) }, 'Perplexity вернул пустой ответ');
      return { content: 'Ответ пуст. Попробуй переформулировать вопрос.', citations };
    }

    const citationBlock =
      citations?.length && citations.length > 0
        ? `\n\nИсточники:\n${citations.map((url, i) => `${i + 1}. ${url}`).join('\n')}`
        : '';
    return { content: content + citationBlock, citations };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        logger.error({ query: query.slice(0, 100) }, 'Таймаут Perplexity Deep Research');
        return {
          content: 'Исследование заняло слишком много времени. Попробуй сузить вопрос или разбить на части.',
        };
      }
      logger.error({ err, query: query.slice(0, 100) }, 'Ошибка при вызове Perplexity');
    }
    return {
      content: 'Произошла ошибка при глубоком исследовании. Попробуй позже.',
    };
  }
}
