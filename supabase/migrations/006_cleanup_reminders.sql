-- Чистка дубликатов ежедневного напоминания заботы
WITH ranked AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM marcus_reminders
  WHERE message = 'Как ты себя чувствуешь? Как прошел день и сколько энергии по шкале 1-10?'
)
DELETE FROM marcus_reminders r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- Привести напоминание заботы к следующему 20:00 (MSK) и сбросить sent
WITH local_now AS (
  SELECT (NOW() AT TIME ZONE 'Europe/Moscow') AS value
),
target AS (
  SELECT CASE
    WHEN value >= date_trunc('day', value) + TIME '20:00'
    THEN date_trunc('day', value) + TIME '20:00' + INTERVAL '1 day'
    ELSE date_trunc('day', value) + TIME '20:00'
  END AS local_target
  FROM local_now
)
UPDATE marcus_reminders
SET trigger_at = (SELECT local_target AT TIME ZONE 'Europe/Moscow' FROM target),
    repeat_pattern = 'daily',
    sent = FALSE
WHERE message = 'Как ты себя чувствуешь? Как прошел день и сколько энергии по шкале 1-10?';

-- Сбросить sent для будущих напоминаний
UPDATE marcus_reminders
SET sent = FALSE
WHERE sent = TRUE
  AND trigger_at > NOW();
