import type { FriendStatus } from '@/data/types';

export type FriendAct = 'send' | 'accept' | 'remove';

/** The one button a player sees next to someone, by how the two are linked. */
export function friendAction(status: FriendStatus | undefined): { label: string; act: FriendAct; primary: boolean } | null {
  switch (status) {
    case 'none':
      return { label: 'Adicionar', act: 'send', primary: true };
    case 'incoming':
      return { label: 'Aceitar pedido', act: 'accept', primary: true };
    case 'outgoing':
      return { label: 'Cancelar pedido', act: 'remove', primary: false };
    case 'friends':
      return { label: 'Desfazer amizade', act: 'remove', primary: false };
    default:
      return null;
  }
}
