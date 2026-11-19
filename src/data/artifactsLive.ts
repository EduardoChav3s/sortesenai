// Artifacts, fragments and the three attributes, over the database. Every rule lives in the database.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, removeShopImage } from './client';
import { isLive } from './live';

const KEYS = ['attributes', 'fragments', 'spares', 'forge', 'my-artifacts', 'luck', 'collection', 'wallet', 'level'];

export const useAttributes = () => useQuery({ queryKey: ['attributes'], queryFn: () => api!.attributes(), enabled: isLive, refetchInterval: 30_000 });
export const useFragments = () => useQuery({ queryKey: ['fragments'], queryFn: () => api!.fragments(), enabled: isLive });
export const useSpareFragments = () => useQuery({ queryKey: ['spares'], queryFn: () => api!.spareFragments(), enabled: isLive });
export const useForge = () => useQuery({ queryKey: ['forge'], queryFn: () => api!.forge(), enabled: isLive });
export const useMyArtifacts = () => useQuery({ queryKey: ['my-artifacts'], queryFn: () => api!.myArtifacts(), enabled: isLive });

export function useArtifactActions() {
  const qc = useQueryClient();
  const done = () => KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    convert: useMutation({ mutationFn: (v: { cardId: string; quantity: number }) => api!.convertDuplicates(v.cardId, v.quantity), onSettled: done }),
    convertAll: useMutation({ mutationFn: () => api!.convertAllDuplicates(), onSettled: done }),
    // one request id per click: the database forges once even if the request arrives twice
    craft: useMutation({ mutationFn: (artifactId: string) => api!.craftArtifact(artifactId, crypto.randomUUID()), onSettled: done }),
    toggle: useMutation({ mutationFn: (v: { id: number; active: boolean }) => api!.setArtifactActive(v.id, v.active), onSettled: done }),
  };
}

export const useArtifactConfig = () => useQuery({ queryKey: ['artifact-config'], queryFn: () => api!.adminArtifactConfig(), enabled: isLive, refetchInterval: 30_000 });

export function useArtifactAdmin() {
  const qc = useQueryClient();
  const done = () => ['artifact-config', ...KEYS].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    save: useMutation({ mutationFn: (p: object) => api!.adminUpsertArtifact(p), onSettled: done }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const r = await api!.adminDeleteArtifact(id);
        if (r.image_path) void removeShopImage(r.image_path, 'artifacts');
        return r;
      },
      onSettled: done,
    }),
    saveType: useMutation({ mutationFn: (p: { id?: string; name: string; color: string; active: boolean }) => api!.adminUpsertFragmentType(p), onSettled: done }),
    saveRule: useMutation({ mutationFn: (v: { tier: string; fragmentType: string | null; amount: number }) => api!.adminSetFragmentRule(v.tier, v.fragmentType, v.amount), onSettled: done }),
    cardFragments: useMutation({ mutationFn: (v: { cardId: string; allowed: boolean }) => api!.adminSetCardFragments(v.cardId, v.allowed), onSettled: done }),
    slots: useMutation({ mutationFn: (n: number) => api!.adminSetArtifactSlots(n), onSettled: done }),
  };
}
