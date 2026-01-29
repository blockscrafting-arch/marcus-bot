import { logger } from '@/lib/utils/logger';

type SearchResult = {
  title: string;
  url: string;
  content: string;
};

/**
 * Выполняет web поиск через Tavily.
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY || '';
  if (!apiKey) {
    logger.warn({ query: query.slice(0, 80) }, 'Tavily: TAVILY_API_KEY не задан');
    return [];
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      logger.error(
        { status: response.status, body: bodyText.slice(0, 500), query: query.slice(0, 80) },
        'Tavily: ошибка поиска (status, body)'
      );
      return [];
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results = (data.results || []) as SearchResult[];
    if (!results.length) {
      const responseKeys = Object.keys(data).filter((k) => k !== 'results');
      logger.info(
        { query: query.slice(0, 80), responseKeys, hasAnswer: !!data.answer },
        'Tavily: пустой результат (диагностика)'
      );
    }
    return results;
  } catch (error) {
    logger.error({ error, query: query.slice(0, 80) }, 'Tavily: ошибка при запросе');
    return [];
  }
}

