'use client';

import { useId, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  EVENEMENT_PAGES_RECENTES,
  clePagesRecentes,
  lirePagesRecentes,
  type PageRecente,
} from '@/lib/navigation/pages-recentes';
import { recentsResolus, type RecentResolu } from '@/lib/navigation/palette';
import { cn } from '@/lib/utils';
import type { EntreeRendue, GroupeRendu } from './useMenuDeLEspace';
import { FOCUS_RING_RENTRANT, STYLE_TITRE } from './styles-de-la-barre';

/** ADR-0090 §5 — quatre au plus. */
export const RECENTS_DE_LA_BARRE = 4;

interface RecentsDeLaBarreProps {
  readonly compte: number;
  /** TCK-2846 — l'espace actif : les récents sont rangés par espace. */
  readonly espace: string | null | undefined;
  /** Les groupes RENDUS (épingles comprises) : la résolution est celle de la palette. */
  readonly groupes: readonly GroupeRendu[];
  readonly pathname: string | null;
  readonly libelle: (entree: EntreeRendue) => string;
  readonly lien: (entree: EntreeRendue) => string;
  readonly onNavigate?: () => void;
}

/**
 * Les récents de la colonne : LA lecture de la palette (`recentsResolus`, TCK-2846), quatre au plus,
 * sans la page courante. Une fiche par son nom, une page du menu par son entrée.
 */
export function recentsDeLaBarre(
  recents: readonly PageRecente[],
  groupes: readonly GroupeRendu[],
  pathname: string | null,
): RecentResolu[] {
  return recentsResolus(recents, groupes, pathname, RECENTS_DE_LA_BARRE);
}

/**
 * Les écritures de l'onglet ne déclenchent pas `storage` : elles émettent `EVENEMENT_PAGES_RECENTES`
 * (TCK-2846), et la barre relit aussi à chaque rendu (navigation).
 */
function abonnerAuStockage(rappel: () => void): () => void {
  window.addEventListener('storage', rappel);
  window.addEventListener(EVENEMENT_PAGES_RECENTES, rappel);
  return () => {
    window.removeEventListener('storage', rappel);
    window.removeEventListener(EVENEMENT_PAGES_RECENTES, rappel);
  };
}

function lireBrut(compte: number): string | null {
  try {
    return window.localStorage.getItem(clePagesRecentes(compte));
  } catch {
    return null;
  }
}

/**
 * TCK-2619 — les récents de l'appareil, lus APRÈS l'hydratation (instantané serveur : aucun) : la même
 * lecture que « Récents » de la colonne, pour la page introuvable. TCK-2846 — ceux de l'espace actif.
 */
export function usePagesRecentes(compte: number, espace: string | null | undefined): readonly PageRecente[] {
  const brut = useSyncExternalStore(abonnerAuStockage, () => lireBrut(compte), () => null);
  return brut === null ? [] : lirePagesRecentes(compte, espace);
}

/**
 * TCK-2490 (ADR-0090 §5) — « Récents », en fin de colonne : les pages ouvertes sur CET appareil
 * (`RetenirLaPageRecente`, TCK-2482), quatre au plus, sans icône, en texte discret. TCK-2846 — une fiche
 * par son nom (« Villa 4 chambres à Ngor », « Moussa Diallo » : maquette `app-coque` e3, sans type).
 *
 * Lu sur `localStorage` APRÈS l'hydratation (`useSyncExternalStore`, instantané serveur `null`) : le
 * serveur ne connaît pas l'appareil, et rien ne bouge au premier octet. La valeur brute (une chaîne)
 * est l'instantané : stable tant que le stockage ne change pas. Rien sans récent ; caché dans le rail.
 */
export function RecentsDeLaBarre({ compte, espace, groupes, pathname, libelle, lien, onNavigate }: RecentsDeLaBarreProps) {
  const t = useTranslations('nav.sidebar');
  const idTitre = useId();
  const recents = recentsDeLaBarre(usePagesRecentes(compte, espace), groupes, pathname);
  if (recents.length === 0) return null;

  return (
    <section aria-labelledby={idTitre} data-slot="recents" className="mt-5 icones:hidden">
      <p id={idTitre} className={cn('mb-0.5 flex h-7 items-center px-2', STYLE_TITRE)}>
        {t('recents')}
      </p>
      <ul className="space-y-px">
        {recents.map((r) => (
          <li key={r.cle}>
            <Link
              href={r.entree ? lien(r.entree) : r.href}
              onClick={onNavigate}
              className={cn(
                'flex h-8 items-center rounded-lg px-2 text-[0.84375rem] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground max-md:h-10',
                FOCUS_RING_RENTRANT,
              )}
            >
              <span className="truncate">{r.entree ? libelle(r.entree) : r.titre}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
