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
      },
      body: JSON.stringify({
        api_key: apiKey,
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
        'Ошибка поиска Tavily'
      );
      return [];
    }

    const data = await response.json();
    const results = (data.results || []) as SearchResult[];
    if (!results.length) {
      logger.info({ query: query.slice(0, 80) }, 'Tavily: пустой результат');
    }
    return results;
  } catch (error) {
    logger.error({ error, query: query.slice(0, 80) }, 'Ошибка при запросе к Tavily');
    return [];
  }
}

