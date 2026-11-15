'use client';

import React, { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/**
 * TCK-2509 — « Partager » la comparaison, à la place de « Copier le lien ».
 *
 * Au téléphone, la feuille de partage du système (`navigator.share`), où WhatsApp vient en tête :
 * c'est là que la comparaison se discute en famille. Sans feuille de partage (la plupart des
 * navigateurs de bureau), le lien `?ids=` est copié et un toast le DIT — un bouton qui ne fait rien
 * de visible laisse croire qu'il n'a pas marché.
 *
 * L'abandon de la feuille par le visiteur (`AbortError`) n'est pas un échec : rien n'est copié,
 * rien n'est annoncé. Tout autre échec de la feuille retombe sur la copie.
 */
export interface PartagerLaComparaisonProps {
  /** Le chemin de la comparaison, `?ids=` compris ; l'origine est lue au clic. */
  readonly chemin: string;
  /** Le nombre de biens comparés, pour le texte du partage. */
  readonly count: number;
  readonly className?: string;
  readonly variante?: 'primaire' | 'contour';
}

export function PartagerLaComparaison({ chemin, count, className, variante = 'primaire' }: PartagerLaComparaisonProps) {
  const t = useTranslations('compare.share');
  const toast = useToast();
  const [occupe, setOccupe] = useState(false);

  const partager = async () => {
    if (occupe) return;
    setOccupe(true);
    try {
      const url = new URL(chemin, window.location.origin).toString();
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav && typeof nav.share === 'function') {
        try {
          await nav.share({ title: t('title'), text: t('text', { count }), url });
          return;
        } catch (erreur) {
          if (erreur instanceof Error && erreur.name === 'AbortError') return;
        }
      }
      try {
        if (!nav?.clipboard) throw new Error('clipboard');
        await nav.clipboard.writeText(url);
        toast.add({ title: t('copied'), description: t('copiedBody'), type: 'success' });
      } catch {
        toast.add({ title: t('copyFailed'), description: url, type: 'error' });
      }
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Button
      type="button"
      size="lg"
      variant={variante === 'primaire' ? 'default' : 'outline'}
      onClick={() => void partager()}
      disabled={occupe}
      className={cn('h-12 gap-2 md:h-11', className)}
    >
      <Share2 className="size-4" aria-hidden="true" />
      {t('action')}
    </Button>
  );
}
