'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

import { COMPARE_MAX_IDS, type ComparePreview } from '@/lib/compare';
import { useCompare } from '@/context/CompareContext';
import { useToast } from '@/components/ui/toast';

/**
 * La logique de bascule du comparateur, partagée par ses DEUX points d'entrée.
 *
 * Il y en a deux depuis que la fiche d'un bien sait ajouter au comparateur : la pastille
 * posée sur la photo d'une carte (`CompareToggleButton`) et l'action libellée de l'en-tête
 * de fiche (`CompareToggleAction`). Elles ne partagent aucun pixel et doivent partager tout
 * le reste — le plafond, le retour de rejet, le libellé annoncé, l'aperçu transmis.
 *
 * *Deux boutons qui appellent le même store mais décident chacun de leur message finissent
 * par ne plus dire la même chose du même état* — c'est ce que ce hook interdit.
 */
export function useCompareToggle(propertyId: number, preview?: ComparePreview) {
  const t = useTranslations('compare.button');
  const { has, toggle, ids } = useCompare();
  const toast = useToast();

  const isSelected = has(propertyId);

  const onToggle = useCallback(() => {
    const result = toggle(propertyId, preview);

    if (result.status === 'rejected') {
      toast.add({
        title: t('maxTitle', { max: COMPARE_MAX_IDS }),
        description: t('full'),
        type: 'warning',
      });
      return result;
    }

    if (result.status === 'added') {
      toast.add({
        title: t('added'),
        description: t('addedBody', { count: ids.length + 1, max: COMPARE_MAX_IDS }),
        type: 'info',
      });
    }

    return result;
  }, [toggle, propertyId, preview, toast, ids.length, t]);

  return {
    isSelected,
    onToggle,
    /** Le libellé de l'action, qui est aussi son nom accessible. */
    label: t(isSelected ? 'remove' : 'add'),
  };
}
