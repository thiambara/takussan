'use client';

import { useId, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { clePagesRecentes, lirePagesRecentes } from '@/lib/navigation/pages-recentes';
import { resolveurDesRecents } from '@/lib/navigation/palette';
import { cn } from '@/lib/utils';
import type { EntreeRendue, GroupeRendu } from './useMenuDeLEspace';
import { FOCUS_RING_RENTRANT, STYLE_TITRE } from './styles-de-la-barre';

/** ADR-0090 §5 — quatre au plus. */
export const RECENTS_DE_LA_BARRE = 4;

interface RecentsDeLaBarreProps {
  readonly compte: number;
  /** Les groupes RENDUS (épingles comprises) : la résolution est celle de la palette. */
  readonly groupes: readonly GroupeRendu[];
  readonly pathname: string | null;
  readonly libelle: (entree: EntreeRendue) => string;
  readonly lien: (entree: EntreeRendue) => string;
  readonly onNavigate?: () => void;
}

/**
 * Les récents, résolus sur le menu du jour : l'entrée qui couvre chaque chemin retenu, sans doublon, ni
 * la page courante, quatre au plus. Même résolution que la palette (`resolveurDesRecents`) : un chemin
 * que le menu ne couvre plus disparaît de lui-même.
 */
export function recentsDeLaBarre(
  chemins: readonly string[],
  groupes: readonly GroupeRendu[],
  pathname: string | null,
): EntreeRendue[] {
  const entreeDe = resolveurDesRecents(groupes);
  const parHref = new Map<string, EntreeRendue>();
  for (const g of groupes) for (const e of g.entrees) if (!e.locked && !parHref.has(e.href)) parHref.set(e.href, e);
  const courant = entreeDe(pathname);
  const rendus: EntreeRendue[] = [];
  for (const chemin of chemins) {
    if (rendus.length === RECENTS_DE_LA_BARRE) break;
    const href = entreeDe(chemin);
    const entree = href === null ? undefined : parHref.get(href);
    if (!entree || href === courant || rendus.includes(entree)) continue;
    rendus.push(entree);
  }
  return rendus;
}

/** Les écritures de l'onglet ne déclenchent pas `storage` : la barre relit à chaque rendu (navigation). */
function abonnerAuStockage(rappel: () => void): () => void {
  window.addEventListener('storage', rappel);
  return () => window.removeEventListener('storage', rappel);
}

function lireBrut(compte: number): string | null {
  try {
    return window.localStorage.getItem(clePagesRecentes(compte));
  } catch {
    return null;
  }
}

/**
 * TCK-2619 — les chemins récents de l'appareil, lus APRÈS l'hydratation (instantané serveur : aucun) : la
 * même lecture que « Récents » de la colonne, pour la page introuvable.
 */
export function useCheminsRecents(compte: number): readonly string[] {
  const brut = useSyncExternalStore(abonnerAuStockage, () => lireBrut(compte), () => null);
  return brut === null ? [] : lirePagesRecentes(compte);
}

/**
 * TCK-2490 (ADR-0090 §5) — « Récents », en fin de colonne : les pages ouvertes sur CET appareil
 * (`RetenirLaPageRecente`, TCK-2482), quatre au plus, sans icône, en texte discret.
 *
 * Lu sur `localStorage` APRÈS l'hydratation (`useSyncExternalStore`, instantané serveur `null`) : le
 * serveur ne connaît pas l'appareil, et rien ne bouge au premier octet. La valeur brute (une chaîne)
 * est l'instantané : stable tant que le stockage ne change pas. Rien sans récent ; caché dans le rail.
 */
export function RecentsDeLaBarre({ compte, groupes, pathname, libelle, lien, onNavigate }: RecentsDeLaBarreProps) {
  const t = useTranslations('nav.sidebar');
  const idTitre = useId();
  const brut = useSyncExternalStore(abonnerAuStockage, () => lireBrut(compte), () => null);
  const entrees = brut === null ? [] : recentsDeLaBarre(lirePagesRecentes(compte), groupes, pathname);
  if (entrees.length === 0) return null;

  return (
    <section aria-labelledby={idTitre} data-slot="recents" className="mt-5 icones:hidden">
      <p id={idTitre} className={cn('mb-0.5 flex h-7 items-center px-2', STYLE_TITRE)}>
        {t('recents')}
      </p>
      <ul className="space-y-px">
        {entrees.map((entree) => (
          <li key={entree.href}>
            <Link
              href={lien(entree)}
              onClick={onNavigate}
              className={cn(
                'flex h-8 items-center rounded-lg px-2 text-[0.84375rem] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground max-md:h-10',
                FOCUS_RING_RENTRANT,
              )}
            >
              <span className="truncate">{libelle(entree)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
