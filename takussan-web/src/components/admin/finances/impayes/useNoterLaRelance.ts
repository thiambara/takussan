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
 *
 * TCK-2682 — la file guidée le dit ELLE-MÊME (`toast: false`), dans son panneau et en nommant le
 * locataire : un toast posé en bas à droite tombait sur « Ouvrir WhatsApp » de l'échéance suivante,
 * et, survolé, ne s'en allait plus (vérification du 2026-11-12, m1).
 */
export function useNoterLaRelance({ toast: avecToast = true }: { readonly toast?: boolean } = {}) {
  const t = useTranslations('admin.finances.impayes.relancer');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  return useNoterUneRelance({
    onError: (erreur) => {
      if (avecToast) toast.add({ title: messageErreur(erreur, t('noteEchec')), type: 'error' });
    },
  });
}
