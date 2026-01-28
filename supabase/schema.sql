-- Схема базы данных для Telegram-бота Маркус
-- Выполните этот SQL в SQL Editor вашего Supabase Studio

CREATE EXTENSION IF NOT EXISTS vector;

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS marcus_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'Europe/Moscow',
  preferences JSONB DEFAULT '{}'::jsonb,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица сообщений (история переписки)
CREATE TABLE IF NOT EXISTS marcus_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Долгосрочная память
CREATE TABLE IF NOT EXISTS marcus_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  memory_type TEXT,
  importance FLOAT DEFAULT 0.5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Задачи
CREATE TABLE IF NOT EXISTS marcus_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Напоминания
CREATE TABLE IF NOT EXISTS marcus_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  trigger_at TIMESTAMP WITH TIME ZONE NOT NULL,
  repeat_pattern TEXT,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_marcus_messages_user_id ON marcus_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_marcus_messages_created_at ON marcus_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marcus_messages_user_created ON marcus_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marcus_memories_user_id ON marcus_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_marcus_tasks_user_id ON marcus_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_marcus_reminders_user_id ON marcus_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_marcus_reminders_trigger_at ON marcus_reminders(trigger_at);

-- Поиск в памяти
CREATE OR REPLACE FUNCTION match_marcus_memories(
  p_user_id BIGINT,
  p_embedding vector(1536),
  p_match_count INT DEFAULT 5,
  p_similarity_threshold FLOAT DEFAULT 0.75
)
RETURNS TABLE(content TEXT, similarity FLOAT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT m.content, 1 - (m.embedding <=> p_embedding) AS similarity
  FROM marcus_memories m
  WHERE m.user_id = p_user_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> p_embedding) >= p_similarity_threshold
  ORDER BY m.embedding <=> p_embedding
  LIMIT p_match_count;
END;
$$;

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
DROP TRIGGER IF EXISTS update_marcus_users_updated_at ON marcus_users;
CREATE TRIGGER update_marcus_users_updated_at
  BEFORE UPDATE ON marcus_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
-- Схема базы данных для Telegram-бота Маркус
-- Выполните этот SQL в SQL Editor вашего Supabase Studio

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS marcus_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица сообщений (история переписки)
CREATE TABLE IF NOT EXISTS marcus_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_marcus_messages_user_id ON marcus_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_marcus_messages_created_at ON marcus_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marcus_messages_user_created ON marcus_messages(user_id, created_at DESC);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_marcus_users_updated_at
  BEFORE UPDATE ON marcus_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
