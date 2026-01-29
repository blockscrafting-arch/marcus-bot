import { supabase } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

export type MediaGroupRecord = {
  media_group_id: string;
  user_id: number;
  caption?: string | null;
  file_ids: string[];
  updated_at?: string;
  processed_at?: string | null;
};

/**
 * Добавляет файл в группу или создаёт новую запись.
 */
export async function upsertMediaGroup(
  mediaGroupId: string,
  userId: number,
  fileId: string,
  caption?: string
): Promise<MediaGroupRecord | null> {
  const { data: existing, error } = await supabase
    .from('marcus_media_groups')
    .select('*')
    .eq('media_group_id', mediaGroupId)
    .maybeSingle();
  if (error) {
    logger.error({ error, mediaGroupId, userId }, 'Ошибка при загрузке media_group');
    return null;
  }

  if (!existing) {
    const payload = {
      media_group_id: mediaGroupId,
      user_id: userId,
      caption: caption?.trim() || null,
      file_ids: [fileId],
      updated_at: new Date().toISOString(),
    };
    const { error: insertError } = await supabase.from('marcus_media_groups').insert(payload);
    if (insertError) {
      logger.error({ insertError, mediaGroupId, userId }, 'Ошибка при создании media_group');
      return null;
    }
    return {
      media_group_id: mediaGroupId,
      user_id: userId,
      caption: payload.caption || undefined,
      file_ids: [fileId],
      processed_at: null,
      updated_at: payload.updated_at,
    };
  }

  if (existing.processed_at) {
    return existing as MediaGroupRecord;
  }

  const current = Array.isArray(existing.file_ids) ? existing.file_ids : [];
  const nextFileIds = current.includes(fileId) ? current : [...current, fileId];
  const nextCaption = caption?.trim() || existing.caption || null;
  const updatedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('marcus_media_groups')
    .update({ file_ids: nextFileIds, caption: nextCaption, updated_at: updatedAt })
    .eq('media_group_id', mediaGroupId);
  if (updateError) {
    logger.error({ updateError, mediaGroupId, userId }, 'Ошибка при обновлении media_group');
    return null;
  }
  return {
    media_group_id: mediaGroupId,
    user_id: userId,
    caption: nextCaption || undefined,
    file_ids: nextFileIds,
    processed_at: existing.processed_at || null,
    updated_at: updatedAt,
  };
}

/**
 * Загружает группу по media_group_id.
 */
export async function getMediaGroup(mediaGroupId: string): Promise<MediaGroupRecord | null> {
  const { data, error } = await supabase
    .from('marcus_media_groups')
    .select('*')
    .eq('media_group_id', mediaGroupId)
    .maybeSingle();
  if (error) {
    logger.error({ error, mediaGroupId }, 'Ошибка при загрузке media_group');
    return null;
  }
  return (data as MediaGroupRecord | null) || null;
}

/**
 * Помечает группу обработанной. Возвращает true, если удалось захватить обработку.
 */
export async function markMediaGroupProcessed(mediaGroupId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('marcus_media_groups')
    .update({ processed_at: new Date().toISOString() })
    .eq('media_group_id', mediaGroupId)
    .is('processed_at', null)
    .select('media_group_id');
  if (error) {
    logger.error({ error, mediaGroupId }, 'Ошибка при пометке media_group обработанной');
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Чистит обработанные группы старше указанного времени.
 */
export async function cleanupMediaGroups(olderThanHours = 6): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('marcus_media_groups').delete().lt('processed_at', cutoff);
  if (error) {
    logger.error({ error, cutoff }, 'Ошибка при чистке media_groups');
  }
}
