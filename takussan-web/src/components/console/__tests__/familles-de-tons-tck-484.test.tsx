/**
 * LE CONTRASTE DES TROIS FAMILLES CONSERVÉES, SUR LEURS PROPRES SURFACES — TCK-484 (AC2).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN TROISIÈME FICHIER DE CONTRASTE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `StatusBadge.contraste-tck-450.test.tsx` mesure UN ton sur les sept surfaces de la console.
 * `StatusBadge.tons-absorbes-tck-472.test.tsx` mesure les tons des trois doublons absorbés, sur les
 * surfaces de CES fichiers-là. Aucun des deux ne pouvait voir celles-ci : les trois familles
 * mesurées ici ne passent pas par `StatusBadge`, leurs pastilles vivent dans le calendrier,
 * l'inventaire et la maintenance, et **deux d'entre elles se posent sur `bg-muted` PLEIN**, la
 * pire surface du dépôt pour un aplat translucide.
 *
 * *Un aplat semi-transparent de la couleur de son propre texte a un contraste qui DÉPEND du fond.*
 * Trois familles hors du DS, c'est trois jeux de surfaces à relever au site de rendu — pas à
 * recopier depuis un fichier voisin.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MESURE A RENDU, LE 2026-08-30
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **33 couples (ton × surface × thème) sortaient sous 4,5:1 avant ce ticket. Il en reste 15, et
 * les 15 sont le MÊME défaut.**
 *
 *  · **18 ont été fermés par un alignement sur le DS**, pas par une invention : `/15` est l'alpha
 *    que TCK-450 avait écarté sur mesure dans la console (4,29:1) et qui n'avait jamais quitté ces
 *    trois fichiers. `bg-success/15` y rendait 4,30:1, `bg-warning/15` 4,33:1, `bg-info/15`
 *    4,44:1. *Sur un aplat de la couleur du texte, moins d'opacité = plus de contraste.*
 *  · **Un a été fermé en changeant de canal** : `endommagé` portait `bg-warning/30` — le « second
 *    cran d'avertissement par l'intensité » — et rendait 3,36 à 3,98:1 sur les quatre surfaces des
 *    deux thèmes. Le cran est passé sur une BORDURE pleine, qui ne porte pas de texte : seuil 3:1
 *    (WCAG 1.4.11), mesurée à 4,65:1 contre son propre aplat.
 *  · **Les 15 qui restent sont `text-primary`, et ils ne se corrigent pas ici.** `--primary`
 *    échoue AA sur ces surfaces **à tous les alphas d'aplat, `/0` compris** — 3,99:1 au mieux.
 *    C'est la signature d'un défaut de JETON : *aucun alpha d'aplat ne rattrape une encre trop
 *    claire* (TCK-480, mot pour mot, sur `--destructive`). Ticket à part.
 *
 * ⚠ **Le `--primary` n'est donc PAS toléré ici, il est CLIQUETÉ.** Le test exige que l'ensemble
 * des tons qui échouent soit **exactement** `TONS_SOUS_AA_DECLARES`. Un ton de plus est une
 * régression ; un ton de moins veut dire que le ticket `--primary` a abouti, et **le test rougit
 * aussi** — pour qu'on vienne retirer la déclaration au lieu de la laisser mentir. *Un cliquet à
 * un seul sens est une tolérance, pas une garde* (TCK-472).
 *
 * ⚠ Les chiffres de cet en-tête sont un RELEVÉ. Tout est recalculé ci-dessous depuis les
 * FONCTIONS DU SOURCE et depuis le badge RENDU ; si l'en-tête et le test divergent, c'est
 * l'en-tête qui est périmé.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusBadge, type StatusTone } from '@/components/console';
import { paletteEnAttente, paletteForType } from '@/components/calendar/event-colors';
import {
  inventoryElementStateBadgeClass,
  inventoryStatusTone,
  inventoryTypeBadgeClass,
} from '@/components/inventory/labels';
import { maintenanceStatusBadgeClass } from '@/components/maintenance/labels';
import {
  INVENTORY_ELEMENT_STATES,
  INVENTORY_STATUSES,
  INVENTORY_TYPES,
} from '@/types/inventory';
import type { MaintenancePriority, MaintenanceStatus } from '@/types/maintenance';
import type { CalendarEventType } from '@/types/calendar';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versHex,
  versRvb,
  type Rvb,
} from '@/test/contraste-wcag';

const THEMES = [
  { nom: 'clair', jetons: JETONS_CLAIR },
  { nom: 'sombre', jetons: JETONS_SOMBRE },
] as const;

interface Surface {
  readonly nom: string;
  /** Le fichier qui la pose — sans lui, la « surface réelle » est une supposition. */
  readonly site: string;
  readonly hex: (jetons: Readonly<Record<string, string>>) => string;
}

const sur = (jeton: string, alpha: number, sous: string) =>
  (jetons: Readonly<Record<string, string>>) =>
    versHex(
      composer(versRvb(resoudreCouleur(jeton, jetons)), versRvb(resoudreCouleur(sous, jetons)), alpha),
    );

/** Les cinq surfaces du calendrier, relevées case par case. */
const SURFACES_CALENDRIER: readonly Surface[] = [
  { nom: '--card', site: 'calendar/MonthView.tsx:61 — la grille, et les quatre vues', hex: (j) => resoudreCouleur('card', j) },
  { nom: 'bg-muted/60 sur --card', site: 'calendar/MonthView.tsx:89 — case hors du mois affiché', hex: sur('muted', 0.6, 'card') },
  { nom: 'bg-warning/10 sur --card', site: 'calendar/MonthView.tsx:90 — case du jour sélectionné', hex: sur('warning', 0.1, 'card') },
  { nom: 'bg-muted/50 sur --card', site: 'calendar/WeekView.tsx:41, DayView.tsx:39, ListView.tsx:75', hex: sur('muted', 0.5, 'card') },
  { nom: 'bg-muted PLEIN', site: 'calendar/EventDetailSheet.tsx:67 — `hover:bg-muted`', hex: (j) => resoudreCouleur('muted', j) },
];

/**
 * ⚠ `bg-muted` PLEIN n'est pas un survol exotique ici : `InventoryDetail.tsx:190` le pose sur
 * CHAQUE élément de chaque pièce, au repos. C'est la surface nominale de la pastille d'état.
 */
const SURFACES_INVENTAIRE: readonly Surface[] = [
  { nom: '--card', site: 'inventory/InventoryList.tsx:146, InventoryDetail.tsx:51', hex: (j) => resoudreCouleur('card', j) },
  { nom: 'bg-muted PLEIN', site: 'inventory/InventoryList.tsx:146 (survol), InventoryDetail.tsx:190 (au repos)', hex: (j) => resoudreCouleur('muted', j) },
];

const SURFACES_MAINTENANCE: readonly Surface[] = [
  { nom: '--card', site: 'maintenance/MaintenanceList.tsx:140, MaintenanceDetail.tsx:56, MaintenanceHistoryByProperty.tsx:48', hex: (j) => resoudreCouleur('card', j) },
  { nom: 'bg-muted PLEIN', site: 'maintenance/MaintenanceList.tsx:140 — `hover:bg-muted`', hex: (j) => resoudreCouleur('muted', j) },
];

/**
 * Les tons dont on SAIT qu'ils échouent, et pourquoi — cliquet à deux sens, cf. l'en-tête.
 *
 * Ils échouent tous les trois par `text-primary`, et tous les trois pour la même raison : le jeton
 * n'est pas une encre. Les recopier ici n'est pas une exemption — c'est ce qui fait rougir le jour
 * où l'un d'eux cesse d'échouer sans que la déclaration bouge.
 */
const TONS_SOUS_AA_DECLARES: ReadonlyMap<string, string> = new Map([
  ['bg-primary/12 text-primary',
    '`--primary` n’est pas une encre : échoue AA à TOUS les alphas, `/0` compris (3,99:1 au mieux). '
    + 'Défaut de jeton, partagé par la visite du calendrier, `move_out` et `quote_*`. Ticket à part.'],
]);

/** Extrait le couple (aplat, encre) INCONDITIONNEL d'une chaîne de classes. */
function couleurs(classes: string): { aplat: string; encre: string } {
  const liste = classes.split(/\s+/).filter(Boolean);
  const retenir = (prefixe: 'bg' | 'text') =>
    liste.filter((c) => {
      const u = litUtilitaireDeCouleur(c, prefixe);
      return u !== null && u.variante === '';
    });
  const aplats = retenir('bg');
  const encres = retenir('text');
  expect(aplats, `« ${classes} » : un seul aplat inconditionnel`).toHaveLength(1);
  expect(encres, `« ${classes} » : une seule encre inconditionnelle`).toHaveLength(1);
  return { aplat: aplats[0]!, encre: encres[0]! };
}

function ratio(
  { aplat, encre }: { aplat: string; encre: string },
  surfaceHex: string,
  jetons: Readonly<Record<string, string>>,
): number {
  const u = litUtilitaireDeCouleur(aplat, 'bg')!;
  const e = litUtilitaireDeCouleur(encre, 'text')!;
  const fond = versRvb(surfaceHex);
  const plaque: Rvb = composer(versRvb(resoudreCouleur(u.jeton, jetons)), fond, u.alpha);
  const texte: Rvb =
    e.alpha === 1
      ? versRvb(resoudreCouleur(e.jeton, jetons))
      : composer(versRvb(resoudreCouleur(e.jeton, jetons)), plaque, e.alpha);
  return contraste(texte, plaque);
}

/** Le couple normalisé « aplat + encre », la clé sous laquelle un ton se déclare. */
const cle = ({ aplat, encre }: { aplat: string; encre: string }) => `${aplat} ${encre}`;

const echecs = new Map<string, string[]>();

function mesurer(famille: string, quoi: string, classes: string, surfaces: readonly Surface[]) {
  const c = couleurs(classes);
  for (const { nom: theme, jetons } of THEMES) {
    for (const s of surfaces) {
      const r = ratio(c, s.hex(jetons), jetons);
      if (r < SEUIL_AA_TEXTE) {
        const liste = echecs.get(cle(c)) ?? echecs.set(cle(c), []).get(cle(c))!;
        liste.push(`${famille} · ${quoi} · ${theme} · ${s.nom} (${s.site}) = ${fmt(r)}`);
      }
    }
  }
}

/**
 * Le couple rendu par `StatusBadge` pour un ton — pour les DEUX familles absorbées.
 *
 * ⚠ **Mémoïsé, et ce n'est pas une optimisation.** `render()` s'accumule dans le même `it` :
 * quatre priorités dont deux partagent un ton, plus quatre statuts d'inventaire, et
 * `getByTestId` trouve deux nœuds pour le même identifiant — le test rougirait alors sur son
 * propre harnais au lieu de mesurer quoi que ce soit. Le fichier sœur de TCK-472 porte le même
 * avertissement, payé de la même façon.
 */
const CACHE_DU_BADGE = new Map<StatusTone, { aplat: string; encre: string }>();

function couleursDuBadge(tone: StatusTone): { aplat: string; encre: string } {
  const deja = CACHE_DU_BADGE.get(tone);
  if (deja) return deja;
  const id = `tck484-${tone}`;
  render(<StatusBadge tone={tone} label="X" data-testid={id} />);
  const c = couleurs(Array.from(screen.getByTestId(id).classList).join(' '));
  CACHE_DU_BADGE.set(tone, c);
  return c;
}

describe('TCK-484 — les tons des familles hors DS, sur leurs propres surfaces', () => {
  it('mesure les trois familles CONSERVÉES et les deux ABSORBÉES, dans les deux thèmes', () => {
    // ── 1. Calendrier — une couleur par TYPE, plus l'état « en attente » qui écrase le type.
    for (const type of ['booking', 'visit', 'lease'] as CalendarEventType[]) {
      mesurer('calendar/event-colors.ts', type, paletteForType(type).pill, SURFACES_CALENDRIER);
    }
    mesurer('calendar/event-colors.ts', 'en attente', paletteEnAttente().pill, SURFACES_CALENDRIER);

    // ── 2. Inventaire — types et états d'élément (les STATUTS sont partis chez StatusBadge).
    for (const type of INVENTORY_TYPES) {
      mesurer('inventory/labels.ts', type, inventoryTypeBadgeClass(type), SURFACES_INVENTAIRE);
    }
    for (const etat of INVENTORY_ELEMENT_STATES) {
      mesurer('inventory/labels.ts', etat, inventoryElementStateBadgeClass(etat), SURFACES_INVENTAIRE);
    }

    // ── 3. Maintenance — les onze statuts, un par un.
    const STATUTS: readonly MaintenanceStatus[] = [
      'open', 'acknowledged', 'quote_requested', 'quote_submitted', 'approved', 'rejected',
      'assigned', 'in_progress', 'completed', 'closed', 'cancelled',
    ];
    for (const statut of STATUTS) {
      mesurer('maintenance/labels.ts', statut, maintenanceStatusBadgeClass(statut), SURFACES_MAINTENANCE);
    }

    // ── 4. Les DEUX familles absorbées, mesurées à travers le badge RENDU — sur les surfaces des
    //      écrans qu'elles habitent, pas sur celles de la console.
    for (const statut of INVENTORY_STATUSES) {
      const c = couleursDuBadge(inventoryStatusTone(statut));
      mesurer('inventory (ABSORBÉ)', statut, `${c.aplat} ${c.encre}`, SURFACES_INVENTAIRE);
    }
    const TON_PRIORITE: Record<MaintenancePriority, StatusTone> = {
      urgent: 'danger', high: 'attention', normal: 'neutral', low: 'info',
    };
    for (const priorite of ['urgent', 'high', 'normal', 'low'] as MaintenancePriority[]) {
      const c = couleursDuBadge(TON_PRIORITE[priorite]);
      mesurer('MaintenancePriorityBadge (ABSORBÉ)', priorite, `${c.aplat} ${c.encre}`, SURFACES_MAINTENANCE);
    }

    // ── Le cliquet, à DEUX sens.
    const inattendus = [...echecs.keys()].filter((k) => !TONS_SOUS_AA_DECLARES.has(k));
    expect(
      inattendus.map((k) => `${k}\n      ${echecs.get(k)!.join('\n      ')}`).join('\n\n'),
      'un ton NON DÉCLARÉ passe sous 4,5:1',
    ).toBe('');

    const perimes = [...TONS_SOUS_AA_DECLARES.keys()].filter((k) => !echecs.has(k));
    expect(
      perimes,
      'DÉCLARATION PÉRIMÉE — ce ton ne tombe plus sous AA (bonne nouvelle) : retirer son entrée '
      + 'de `TONS_SOUS_AA_DECLARES`, sinon la liste ment dans le sens qui rassure',
    ).toEqual([]);
  });
});
