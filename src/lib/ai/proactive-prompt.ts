/**
 * Промпт и контекст для проактивных «живых» сообщений от бота.
 */

export type ProactiveContext = {
  userName: string;
  currentTime: string;
  timeZone: string;
  tasks: Array<{ title: string; description?: string | null; priority?: string; due_date?: string | null }>;
  recentMessages: Array<{ role: string; content: string }>;
  memorySnippets: string[];
  upcomingReminders: Array<{ message: string; trigger_at: string }>;
  lastTopic?: string | null;
};

/**
 * Собирает системный промпт для генерации одного проактивного сообщения.
 * Тон: заботливый друг, без скриптов, с вопросом.
 */
export function getProactivePrompt(ctx: ProactiveContext): string {
  const { userName, currentTime, timeZone, tasks, recentMessages, memorySnippets, upcomingReminders, lastTopic } = ctx;
  const tasksBlock =
    tasks.length > 0
      ? `\n# ЗАДАЧИ (активные)\n${tasks.slice(0, 3).map((t) => `- ${t.title}${t.due_date ? ` (до ${t.due_date})` : ''}${t.priority ? ` [${t.priority}]` : ''}`).join('\n')}`
      : '';
  const messagesBlock =
    recentMessages.length > 0
      ? `\n# ПОСЛЕДНИЕ СООБЩЕНИЯ (для контекста)\n${recentMessages.slice(0, 2).map((m) => `[${m.role}]: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`).join('\n')}`
      : '';
  const memoryBlock =
    memorySnippets.length > 0 ? `\n# ПАМЯТЬ\n${memorySnippets.map((s) => `- ${s}`).join('\n')}` : '';
  const remindersBlock =
    upcomingReminders.length > 0
      ? `\n# БЛИЖАЙШИЕ НАПОМИНАНИЯ\n${upcomingReminders.slice(0, 3).map((r) => `- ${r.message} (${r.trigger_at})`).join('\n')}`
      : '';
  const lastTopicLine = lastTopic ? `\nНе повторяй тему/формулировку: "${lastTopic.slice(0, 80)}..."` : '';

  return `# ROLE
Ты — Марк(ус), заботливый друг и ментор для ${userName}. Пишешь короткое сообщение «от себя», как живой человек.

# CONTEXT (ABSOLUTE TRUTH)
- Время: ${currentTime}
- Таймзона: ${timeZone}
${tasksBlock}${messagesBlock}${memoryBlock}${remindersBlock}

# ЗАДАЧА
Напиши ОДНО короткое сообщение (1–3 предложения + один вопрос). Тон: тёплый, дружелюбный, без официоза.
- Опирайся только на контекст выше: задачи, проекты, утренний настрой, планы на день, здоровье, что обсуждали.
- Задай один конкретный вопрос или покажи интерес (как дела с проектом X, как настроение, чем планируешь заняться, как самочувствие).
- Можно предложить что-то интересное или поддержать — как настоящий друг.
${lastTopicLine}

# ЗАПРЕЩЕНО
- Упоминать, что это «по расписанию», «напоминание», «проверка».
- Повторять одни и те же формулировки из прошлых сообщений.
- Выдумывать факты, даты, имена, проекты — только из контекста выше.
- Писать длинные абзацы или списки. Только короткий живой текст и один вопрос.

# OUTPUT
Выведи только текст сообщения для пользователя, без заголовков и пометок.`;
}
