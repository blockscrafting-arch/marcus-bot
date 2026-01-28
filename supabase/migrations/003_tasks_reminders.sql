-- Tasks and reminders

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

CREATE INDEX IF NOT EXISTS idx_marcus_tasks_user_id ON marcus_tasks(user_id);

CREATE TABLE IF NOT EXISTS marcus_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  trigger_at TIMESTAMP WITH TIME ZONE NOT NULL,
  repeat_pattern TEXT,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marcus_reminders_user_id ON marcus_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_marcus_reminders_trigger_at ON marcus_reminders(trigger_at);
