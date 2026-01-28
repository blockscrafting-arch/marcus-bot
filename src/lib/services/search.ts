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
      logger.error({ status: response.status }, 'Ошибка поиска Tavily');
      return [];
    }

    const data = await response.json();
    return (data.results || []) as SearchResult[];
  } catch (error) {
    logger.error({ error }, 'Ошибка при запросе к Tavily');
    return [];
  }
}

