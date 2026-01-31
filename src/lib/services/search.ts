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

const BRAVE_WEB_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';/**
 * Выполняет web поиск через Brave Search API.
 * Используется как fallback при пустом/ошибочном ответе Tavily.
 */
export async function braveSearch(query: string): Promise<SearchResult[]> {
  const apiKey = (process.env.BRAVE_API_KEY || '').trim();
  if (!apiKey) {
    logger.warn({ query: query.slice(0, 80) }, 'Brave: BRAVE_API_KEY не задан');
    return [];
  }  try {
    const url = `${BRAVE_WEB_SEARCH_URL}?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Subscription-Token': apiKey,
      },
    });    if (!response.ok) {
      const bodyText = await response.text();
      logger.error(
        { status: response.status, body: bodyText.slice(0, 500), query: query.slice(0, 80) },
        'Brave: ошибка поиска (status, body)'
      );
      return [];
    }

    const data = (await response.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
    const raw = data.web?.results ?? [];
    const results: SearchResult[] = raw.map((item) => ({
      title: item.title ?? '',
      url: item.url ?? '',
      content: item.description ?? '',
    }));
    return results;
  } catch (error) {
    logger.error({ error, query: query.slice(0, 80) }, 'Brave: ошибка при запросе');
    return [];
  }
}
