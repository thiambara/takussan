'use client';

import { useTranslations } from 'next-intl';

import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useNoterUneRelance } from '@/lib/queries/relances';

/**
 * TCK-2660 — noter une relance (ADR-0105 § 3) depuis n'importe quel geste de l'écran : « Ouvrir
 * WhatsApp », « Appeler » d'une carte, d'une rangée ou du dossier. Le geste est déjà parti (wa.me ou
 * tel: s'est ouvert) quand la note échoue : l'écran le DIT (P228.06), par un toast, parce que la
 * feuille ou la carte qui l'a lancé n'est souvent plus là pour le montrer — d'où un `onError` posé
 * sur la mutation elle-même, que le démontage du geste n'emporte pas.
 */
export function useNoterLaRelance() {
  const t = useTranslations('admin.finances.impayes.relancer');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  return useNoterUneRelance({
    onError: (erreur) => toast.add({ title: messageErreur(erreur, t('noteEchec')), type: 'error' }),
  });
}
