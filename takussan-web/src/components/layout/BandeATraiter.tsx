'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { PastilleATraiter } from '@/lib/navigation/a-traiter';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './styles-de-la-barre';

interface BandeATraiterProps {
  readonly visibles: readonly PastilleATraiter[];
  readonly autres: readonly PastilleATraiter[];
  readonly onNavigate?: () => void;
}

/**
 * Une pastille : calme, lisible, pas une alerte — ni couleur primaire (elle reste à l'action
 * principale), ni rouge. `max-md:` = le tiroir : une cible plus haute au doigt.
 */
const STYLE_PASTILLE =
  'inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted max-md:py-1.5';

/**
 * TCK-2479 (ADR-0089 §5) — la bande « À traiter », entre l'action principale et le menu.
 *
 * Elle est HORS du `<nav>` : le menu ne bouge jamais selon un compteur, et la bande n'en est pas une
 * entrée. Sans pastille, elle ne rend RIEN (pas même un conteneur vide). Chaque pastille porte un nom
 * complet qui commence par son texte visible (« 3 messages » → « 3 messages non lus », WCAG 2.5.3).
 * Au-delà de quatre, « +N » est une divulgation sur place, pas un lien : il n'a pas de destination
 * unique.
 */
export function BandeATraiter({ visibles, autres, onNavigate }: BandeATraiterProps) {
  const t = useTranslations('nav.sidebar.aTraiter');
  const idAutres = useId();
  const [ouvert, setOuvert] = useState(false);
  if (visibles.length === 0) return null;

  const pastille = (p: PastilleATraiter) => (
    <li key={p.cle}>
      <Link
        href={p.href}
        onClick={onNavigate}
        aria-label={t(`noms.${p.cle}`, { count: p.nombre })}
        className={cn(STYLE_PASTILLE, FOCUS_RING)}
      >
        {t(`pastilles.${p.cle}`, { count: p.nombre })}
      </Link>
    </li>
  );

  return (
    <section aria-label={t('titre')} data-slot="a-traiter" className="px-3 pb-3">
      <ul className="flex flex-wrap gap-1.5">
        {visibles.map(pastille)}
        {autres.length > 0 ? (
          <li>
            <button
              type="button"
              aria-expanded={ouvert}
              aria-controls={idAutres}
              aria-label={t('autres', { count: autres.length })}
              onClick={() => setOuvert((v) => !v)}
              className={cn(STYLE_PASTILLE, FOCUS_RING, 'text-muted-foreground')}
            >
              {t('plusCourt', { count: autres.length })}
            </button>
          </li>
        ) : null}
      </ul>
      {autres.length > 0 ? (
        <ul id={idAutres} hidden={!ouvert} className="mt-1.5 flex flex-wrap gap-1.5">
          {autres.map(pastille)}
        </ul>
      ) : null}
    </section>
  );
}
