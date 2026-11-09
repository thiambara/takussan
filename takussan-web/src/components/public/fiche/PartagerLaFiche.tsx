'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Share2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface PartagerLaFicheProps {
  /** Le nom de l'agence ou de la personne : le titre du partage. */
  readonly nom: string;
  /** Rond, sur fond de carte : posé sur la couverture (même forme que le retour). */
  readonly surPhoto?: boolean;
  readonly className?: string;
}

/**
 * TCK-2522 / TCK-2523 — « Partager » une fiche, à droite de son en-tête (maquettes `CouvertureAgence`
 * et `EnTete`). Le lien partagé est l'URL COURANTE, filtres compris : il rouvre la même sélection.
 *
 * Feuille de partage du système quand elle existe (WhatsApp en tête au téléphone) ; sinon le lien est
 * copié, et le bouton le DIT — l'icône devient une coche et l'annonce est lue (`aria-live`) : un bouton
 * qui ne fait rien de visible laisse croire qu'il n'a pas marché. L'abandon de la feuille n'est pas un
 * échec : rien n'est copié.
 *
 * Ni feuille ni presse-papiers (contexte non sécurisé, permission refusée) : l'échec est dit lui aussi,
 * dans une bulle sous le bouton et à la lecture, avec ce qu'il reste à faire (revue du 2026-11-09).
 */
export function PartagerLaFiche({ nom, surPhoto = false, className }: PartagerLaFicheProps) {
  const t = useTranslations('publicProfile.partager');
  const [issue, setIssue] = useState<'copie' | 'echec' | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (minuterie.current) clearTimeout(minuterie.current);
  }, []);

  function dire(quoi: 'copie' | 'echec') {
    setIssue(quoi);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setIssue(null), quoi === 'echec' ? 4000 : 2000);
  }

  async function partager() {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: nom, url });
        return;
      } catch (erreur) {
        if (erreur instanceof Error && erreur.name === 'AbortError') return;
      }
    }
    try {
      // `navigator.clipboard` n'existe pas hors contexte sécurisé : l'accès lève, et c'est l'échec.
      await navigator.clipboard.writeText(url);
      dire('copie');
    } catch {
      dire('echec');
    }
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => void partager()}
        aria-label={t('libelle', { nom })}
        data-partager-fiche
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-[background-color,scale] hover:bg-muted active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          surPhoto && 'bg-card shadow-[0_2px_8px_-2px_color-mix(in_oklab,var(--shadow-color)_35%,transparent)] hover:bg-card md:bg-transparent md:shadow-none',
          className,
        )}
      >
        {issue === 'copie' ? <Check className="size-[18px] text-success" aria-hidden /> : <Share2 className="size-[18px]" aria-hidden />}
      </button>
      <span
        aria-live="polite"
        className={cn(
          issue === 'echec'
            ? 'absolute right-0 top-full z-40 mt-2 w-max max-w-[min(16rem,calc(100vw-2rem))] rounded-xl bg-card px-3 py-2 text-left text-[13px] leading-snug text-foreground shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--shadow-color)_45%,transparent)] ring-1 ring-border'
            : 'sr-only',
        )}
      >
        {issue === 'copie' ? t('copie') : issue === 'echec' ? t('echec') : ''}
      </span>
    </span>
  );
}
