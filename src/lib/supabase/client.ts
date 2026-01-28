import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
  logger.error('NEXT_PUBLIC_SUPABASE_URL не установлен в переменных окружения!');
}
if (!supabaseServiceRoleKey) {
  logger.error('SUPABASE_SERVICE_ROLE_KEY не установлен в переменных окружения!');
}

// Создаем клиент с Service Role Key для серверной части
// Это дает полный доступ к БД, минуя Row Level Security (RLS)
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
