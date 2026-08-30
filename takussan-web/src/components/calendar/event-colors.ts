/**
 * TCK-072 — Code couleur des événements calendrier.
 *
 * Réservations confirmées : `--info`.
 * Visites confirmées : `--primary` (terracotta).
 * Baux / périodes longues : `--success`.
 * Statuts en attente (`pending` / `scheduled` / `pending_signature`) : `--muted` — pour distinguer
 * visuellement les demandes non traitées.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE `console/StatusBadge` NE SAIT PAS FAIRE POUR CE MODULE — TCK-484
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Ici la couleur EST le libellé.** Dans la grille du mois, la bulle d'un événement fait une
 * ligne de 1,5 px de padding dans une case de 24 px de haut : elle tronque son titre, et elle en
 * porte souvent trois. Le TYPE d'événement n'y est lisible que par la teinte — c'est le seul
 * canal d'information disponible. `StatusBadge` publie **cinq tons sémantiques** qui disent ce
 * qu'un statut VEUT DIRE (`neutral`, `success`, `attention`, `danger`, `info`) ; il n'en publie
 * aucun qui dise « réservation » plutôt que « visite ». Lui demander de les distinguer, ce serait
 * lui demander de connaître un vocabulaire de TYPES — exactement ce que son docblock refuse, et à
 * raison : le premier type ajouté ailleurs y manquerait en silence.
 *
 * ⚠ **TCK-381 — QUATRE jetons DISTINCTS, et c'est une contrainte, pas une préférence.** Ce module
 * portait bleu / violet / vert / gris ; le barème de substitution ramenait bleu ET violet sur
 * `--info`, ce qui rendait une réservation et une visite indiscernables **dans la grille du
 * mois**. La visite prend donc `--primary`. C'est le cas, rare, où collapser sur les tons
 * sémantiques retire du sens plutôt que d'en aligner.
 *
 * ⚠⚠ **`--primary` N'EST PAS UNE ENCRE, et ce module en est le premier porteur.** Mesuré le
 * 2026-08-30 (TCK-484, AC2) : `text-primary` échoue AA sur les surfaces de ce module **à tous les
 * alphas d'aplat, `/0` compris** — 3,99:1 au mieux, sur `bg-muted` en thème sombre. C'est la
 * signature d'un défaut de JETON, pas d'écran : *aucun alpha d'aplat ne rattrape une encre trop
 * claire* (TCK-480, mot pour mot). La correction est au niveau de `--primary` et touche aussi
 * `inventory/labels.ts` et `maintenance/labels.ts` ; elle a son ticket. **Ne pas la tenter ici en
 * changeant l'alpha : le relevé ci-dessus dit qu'aucun ne marche.**
 *
 * ⚠ **Les aplats sont à `/10`, plus à `/15`, depuis TCK-484.** `/15` est l'alpha que TCK-450 a
 * écarté sur mesure dans la console (4,29:1) et qui n'avait jamais quitté ce fichier : il rendait
 * 4,30:1 pour `--success` et 4,44:1 pour `--info` sur les surfaces réelles du calendrier.
 * *Sur un aplat de la couleur du texte, moins d'opacité = plus de contraste* — l'intuition
 * inverse est le piège. Les bordures, elles, gardent leur `/30` : elles ne portent pas de texte,
 * leur seuil est 3:1 (WCAG 1.4.11).
 */

import type { CalendarEvent, CalendarEventType } from '@/types/calendar';

export type EventPalette = {
  /** Utilisé sur la bulle événement dans la grille mois/semaine. */
  pill: string;
  /** Utilisé sur le bandeau latéral du slide-over. */
  accent: string;
  /**
   * Clé i18n du texte affiché sur fond coloré (contraste WCAG AA), relative au namespace
   * `calendar`. TCK-292 : ce module n'est pas un composant, il ne peut pas appeler
   * `useTranslations` — la donnée porte la CLÉ, le rendu la résout.
   */
  labelKey: string;
};

/**
 * La palette d'un TYPE d'événement — la table de référence, et le seul endroit où la couleur d'un
 * événement de calendrier est décidée.
 *
 * ⚠ **`CalendarPage.tsx` RECOPIAIT ces trois valeurs** dans sa légende jusqu'à TCK-484, et la
 * copie avait déjà divergé : elle peignait `visit` en `--info`, donc de la couleur d'une
 * réservation, **quand la grille juste en dessous la peignait en `--primary`**. Une légende qui
 * ment sur la grille qu'elle légende est pire que pas de légende. Elle dérive désormais d'ici par
 * `paletteForType()` : la divergence n'est plus possible, elle n'a plus d'endroit où naître.
 */
const PALETTE_PAR_TYPE: Record<CalendarEventType, EventPalette> = {
  booking: {
    pill: 'bg-info/10 text-info border-info/30',
    accent: 'bg-info',
    labelKey: 'eventStatus.confirmed',
  },
  visit: {
    pill: 'bg-primary/12 text-primary border-primary/30',
    accent: 'bg-primary',
    labelKey: 'eventStatus.confirmed',
  },
  lease: {
    pill: 'bg-success/10 text-success border-success/30',
    accent: 'bg-success',
    labelKey: 'eventStatus.lease',
  },
};

/** L'événement non traité — un ÉTAT, celui-là, et il écrase le type. */
const PALETTE_EN_ATTENTE: EventPalette = {
  pill: 'bg-muted text-muted-foreground border-border',
  accent: 'bg-muted-foreground',
  labelKey: 'eventStatus.pending',
};

/** La palette d'un type, sans passer par un événement — c'est ce dont la légende a besoin. */
export function paletteForType(type: CalendarEventType): EventPalette {
  return PALETTE_PAR_TYPE[type] ?? PALETTE_PAR_TYPE.visit;
}

/** La palette de l'événement EN ATTENTE, celle que la note de bas de légende décrit. */
export function paletteEnAttente(): EventPalette {
  return PALETTE_EN_ATTENTE;
}

export function paletteFor(event: Pick<CalendarEvent, 'type' | 'status'>): EventPalette {
  const pending =
    event.status === 'pending' || event.status === 'scheduled' || event.status === 'pending_signature';
  return pending ? PALETTE_EN_ATTENTE : paletteForType(event.type);
}

/** Clé i18n du type d'événement, relative au namespace `calendar` (cf. `labelKey`). */
export function typeLabelKey(type: CalendarEvent['type']): string {
  if (type === 'booking') return 'eventType.booking';
  if (type === 'lease') return 'eventType.lease';
  return 'eventType.visit';
}
