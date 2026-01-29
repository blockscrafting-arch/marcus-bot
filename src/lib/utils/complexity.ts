/**
 * Детектор сложности запроса для принудительного grounding.
 * Предотвращает "лень" LLM — форсирует вызов search_web или deep_research.
 */

/**
 * Определяет, нужен ли инструмент текущего времени (get_current_time).
 * Для таких вопросов не вызывать search_web/deep_research.
 */
export function needsCurrentTime(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const patterns = [
    /который\s+час|сколько\s+времени|по\s+какому\s+времени|по\s+какой\s+времени/i,
    /текущее\s+время|сейчас\s+время|время\s+сейчас/i,
    /таймзон|часовой\s+пояс|работаешь\s+по\s+времени|работаешь\s+в\s+каком\s+времени/i,
    /какое\s+время|время\s+у\s+тебя|время\s+у\s+вас/i,
  ];
  return patterns.some((p) => p.test(normalized));
}

/**
 * Определяет, нужен ли deep_research вместо обычного поиска.
 * Вызывается перед отправкой в LLM для принудительного выбора инструмента.
 */
export function needsDeepResearch(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const patterns = [
    /сравни|vs\.?|versus|или лучше|что лучше/i,
    /анализ|исследуй|изучи глубже/i,
    /рынок|конкурент|конкуренци/i,
    /как выбрать|что выбрать/i,
    /подробно|детально|глубоко|исследовани/i,
    /медицин|здоровь|лечен|диагност/i,
    /юридич|закон|право|судеб/i,
    /финанс|инвестиц|акци|бирж/i,
    /due diligence|due diligence/i,
    /отчёт|отчет|report/i,
  ];
  return patterns.some((p) => p.test(normalized));
}

/**
 * Определяет, нужен ли хотя бы обычный поиск (search_web).
 * Широкие паттерны, чтобы реже уходить в auto без поиска.
 */
export function needsSearch(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const patterns = [
    /\?$/,
    /^что\s|^кто\s|^как\s|^когда\s|^где\s|^почему\s|^зачем\s/i,
    /что такое|кто такой|когда|где/i,
    /сколько стоит|цена|цену|стоимость/i,
    /как сделать|как настроить|как установить/i,
    /версия|релиз|обновлени|changelog/i,
    /новост|событи|сегодня|вчера/i,
    /\d{4}\s*год|\d{4}\s*г\./i,
    /актуальн|свежий|последн/i,
    /документаци|api|документ/i,
  ];
  return patterns.some((p) => p.test(normalized));
}
