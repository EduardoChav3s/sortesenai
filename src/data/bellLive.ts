// The bell (notes the database writes for each player, heard live) and the daily chest.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminChestPrize } from './api';
import { api, myUserId, supabase } from './client';
import { isLive } from './live';

export function useNotifications() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => api!.notifications(), enabled: isLive, refetchInterval: 60_000 });
  useEffect(() => {
    if (!isLive || !supabase) return;
    let ch: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let gone = false;
    void myUserId().then((uid) => {
      if (!uid || gone || !supabase) return;
      ch = supabase
        .channel(`sininho-${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
          // a note usually means coins, cards or offers changed too
          ['notifications', 'wallet', 'collection', 'chat', 'friends', 'trades', 'challenges', 'gifts'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        })
        .subscribe();
    });
    return () => {
      gone = true;
      if (ch) void supabase?.removeChannel(ch);
    };
  }, [qc]);
  return query;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (ids: number[] | null) => api!.markNotificationsRead(ids), onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
}

export const useChest = () => useQuery({ queryKey: ['chest'], queryFn: () => api!.chest(), enabled: isLive });

export function useOpenChest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api!.openChest(),
    // the screens refresh after the strip stops, so the prize is not spoiled early
    onSettled: () => window.setTimeout(() => ['chest', 'daily', 'wallet', 'fragments', 'shop', 'level', 'missions', 'attributes'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })), 4200),
  });
}

export const useAdminChestPrizes = () => useQuery({ queryKey: ['admin-chest'], queryFn: () => api!.adminChestPrizes(), enabled: isLive });

export function useChestAdmin() {
  const qc = useQueryClient();
  const done = () => ['admin-chest', 'chest'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    save: useMutation({ mutationFn: (p: Partial<AdminChestPrize>) => api!.adminUpsertChestPrize(p), onSettled: done }),
    remove: useMutation({ mutationFn: (id: string) => api!.adminDeleteChestPrize(id), onSettled: done }),
  };
}
