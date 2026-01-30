-- Состояние проактивных сообщений (когда писать, сколько сегодня, последняя тема)

CREATE TABLE IF NOT EXISTS marcus_proactive_state (
  user_id BIGINT PRIMARY KEY REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  daily_count INT DEFAULT 0,
  daily_date DATE,
  next_scheduled_at TIMESTAMP WITH TIME ZONE,
  last_topic TEXT,
  last_message_hash TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marcus_proactive_state_next_scheduled
  ON marcus_proactive_state(next_scheduled_at)
  WHERE next_scheduled_at IS NOT NULL;
