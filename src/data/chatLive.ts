// The live chat: messages from the database (refreshed the moment something changes),
// plus who is online and who is typing (live connection only, never saved).
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { api, removeImage, supabase, uploadImage } from './client';
import { isLive } from './live';
import { onlineFrom, TYPING_MS, typingNow, type OnlinePlayer } from '@/lib/chatRoom';

export type LiveState = 'connecting' | 'live' | 'off';

/** The latest messages; a change in the chat tables refetches them (and the wallet and album, since trades move both). */
export function useChat() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['chat'], queryFn: () => api!.getChat(), enabled: isLive, refetchInterval: 60_000 });
  const [status, setStatus] = useState<LiveState>('connecting');
  useEffect(() => {
    if (!isLive || !supabase) return setStatus('off');
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['chat'] });
        void qc.invalidateQueries({ queryKey: ['wallet'] });
        void qc.invalidateQueries({ queryKey: ['collection'] });
      }, 120);
    };
    const ch = supabase
      .channel('chat-mensagens')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_bids' }, refresh)
      .subscribe((s) => setStatus(s === 'SUBSCRIBED' ? 'live' : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED' ? 'off' : 'connecting'));
    return () => {
      window.clearTimeout(timer);
      void supabase?.removeChannel(ch);
    };
  }, [qc]);
  return { ...query, status };
}

/** Who has the chat open, and who is typing. */
export function useChatRoom(me: OnlinePlayer | null) {
  const [online, setOnline] = useState<OnlinePlayer[]>([]);
  const [seen, setSeen] = useState<Record<string, { nickname: string; at: number }>>({});
  const [, tick] = useState(0);
  const channel = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);
  const meKey = me ? `${me.id}|${me.nickname}|${me.avatar_url ?? ''}|${me.level}` : '';
  useEffect(() => {
    if (!isLive || !supabase || !me) return;
    const ch = supabase.channel('chat-sala', { config: { presence: { key: me.id } } });
    ch.on('presence', { event: 'sync' }, () => setOnline(onlineFrom(ch.presenceState() as unknown as Record<string, OnlinePlayer[]>, me.id)))
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { id?: string; nickname?: string };
        if (p.id && p.nickname) setSeen((s) => ({ ...s, [p.id!]: { nickname: p.nickname!, at: Date.now() } }));
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') void ch.track(me);
      });
    channel.current = ch;
    return () => {
      channel.current = null;
      void supabase?.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);
  // the "typing" line fades on its own
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  /** Call while the player types; sends at most one signal every 1.5 s. */
  function typing() {
    const now = Date.now();
    if (!me || !channel.current || now - lastSent.current < TYPING_MS / 2) return;
    lastSent.current = now;
    void channel.current.send({ type: 'broadcast', event: 'typing', payload: { id: me.id, nickname: me.nickname } });
  }
  return { online, typingNames: typingNow(seen, Date.now(), me?.id), typing };
}

export function useChatActions() {
  const qc = useQueryClient();
  const done = () => ['chat', 'wallet', 'collection'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    send: useMutation({
      mutationFn: async ({ text, file }: { text: string; file?: File | null }) => {
        const path = file ? await uploadImage('chat', file) : null;
        try {
          return await api!.chatSend(text.trim() || null, path);
        } catch (e) {
          if (path) void removeImage('chat', path); // the message was refused: the file goes too
          throw e;
        }
      },
      onSettled: done,
    }),
    coins: useMutation({ mutationFn: (v: { to: string; amount: number; note: string }) => api!.chatSendCoins(v.to, v.amount, v.note.trim() || null), onSettled: done }),
    offer: useMutation({ mutationFn: (v: { cardId: string; price: number | null; note: string }) => api!.chatOffer(v.cardId, v.price, v.note.trim() || null), onSettled: done }),
    buy: useMutation({ mutationFn: (offer: number) => api!.chatBuy(offer), onSettled: done }),
    bid: useMutation({ mutationFn: (v: { offer: number; cardId: string | null; coins: number }) => api!.chatBid(v.offer, v.cardId, v.coins), onSettled: done }),
    accept: useMutation({ mutationFn: (bid: number) => api!.chatAcceptBid(bid), onSettled: done }),
    cancel: useMutation({ mutationFn: (offer: number) => api!.chatCancelOffer(offer), onSettled: done }),
    remove: useMutation({
      mutationFn: async (id: number) => {
        const r = await api!.adminDeleteChatMessage(id);
        if (r.image_path) void removeImage('chat', r.image_path);
        return r;
      },
      onSettled: done,
    }),
  };
}
