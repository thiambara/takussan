'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Inbox } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PastilleATraiter } from '@/lib/navigation/a-traiter';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './styles-de-la-barre';

interface BandeATraiterProps {
  readonly visibles: readonly PastilleATraiter[];
  readonly autres: readonly PastilleATraiter[];
  readonly onNavigate?: () => void;
  /**
   * TCK-2480 (A11) — la barre peut se réduire aux icônes (`auto` ou `icones`) : la variante compacte
   * est rendue, et le CSS (`icones:`) choisit laquelle se voit. `false` (défaut : mode `complet`,
   * tiroir) : rien que la bande, aucun doublon dans l'arbre d'accessibilité.
   */
  readonly reductible?: boolean;
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
 *
 * TCK-2480 (A11) — barre réduite : une icône qui porte le total et ouvre les MÊMES pastilles dans un
 * `Popover`.
 */
export function BandeATraiter({ visibles, autres, onNavigate, reductible = false }: BandeATraiterProps) {
  const t = useTranslations('nav.sidebar.aTraiter');
  const idAutres = useId();
  const [ouvert, setOuvert] = useState(false);
  const [ouvertReduite, setOuvertReduite] = useState(false);
  if (visibles.length === 0) return null;
  const toutes = [...visibles, ...autres];
  const total = toutes.reduce((somme, p) => somme + p.nombre, 0);

  const pastille = (p: PastilleATraiter, surNavigation: (() => void) | undefined = onNavigate) => (
    <li key={p.cle}>
      <Link
        href={p.href}
        onClick={surNavigation}
        aria-label={t(`noms.${p.cle}`, { count: p.nombre })}
        className={cn(STYLE_PASTILLE, FOCUS_RING)}
      >
        {t(`pastilles.${p.cle}`, { count: p.nombre })}
      </Link>
    </li>
  );

  return (
    <section aria-label={t('titre')} data-slot="a-traiter" className="px-3 pb-3">
      <ul className="flex flex-wrap gap-1.5 icones:hidden">
        {visibles.map((p) => pastille(p))}
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
        <ul id={idAutres} hidden={!ouvert} className="mt-1.5 flex flex-wrap gap-1.5 icones:hidden">
          {autres.map((p) => pastille(p))}
        </ul>
      ) : null}
      {/* TCK-2480 (A11) — barre réduite : une icône qui porte le total et ouvre les MÊMES pastilles.
          Rendue seulement si la barre peut se réduire : en `complet`, aucun doublon à lire. */}
      {reductible ? (
        <Popover open={ouvertReduite} onOpenChange={setOuvertReduite}>
          <PopoverTrigger
            aria-label={t('compact', { count: total })}
            className={cn(
              'relative hidden size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted icones:flex',
              FOCUS_RING,
            )}
          >
            <Inbox className="size-4" aria-hidden />
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-muted-foreground px-1 text-[10px] font-semibold leading-4 tabular-nums text-background"
            >
              {t('totalCourt', { count: Math.min(total, 100) })}
            </span>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-64 p-3">
            <ul className="flex flex-wrap gap-1.5">
              {toutes.map((p) =>
                pastille(p, () => {
                  setOuvertReduite(false);
                  onNavigate?.();
                }),
              )}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </section>
  );
}
