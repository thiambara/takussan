/**
 * LE CONTRASTE DE TOUTE LA SURFACE PUBLIQUE, SUR UN PÉRIMÈTRE DÉRIVÉ — TCK-458.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER CORRIGE, ET QUI N'EST PAS UN COUPLE DE COULEURS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-440 a livré une mesure de contraste JUSTE — `chrome-publique.contraste.test.tsx`, qui calcule
 * le ratio WCAG sur le fond réel remonté du DOM, dans les deux thèmes, sur `--card` comme sur
 * `--background`. Elle couvrait **deux composants** : la navbar et le pied de page.
 *
 * Pendant ce temps, la pastille de type de contrat rendait du texte à **4,22:1** sur TOUTES les
 * cartes de bien du site public. *Une mesure juste sur un périmètre étroit produit une fausse
 * assurance : on croit avoir mesuré « le contraste », on a mesuré deux fichiers.*
 *
 * Le défaut n'est donc pas dans la mesure, il est dans le **périmètre énuméré à la main**. Celui
 * de ce fichier est DÉRIVÉ : les pages de `app/[locale]/(public)` sont lues sur le système de
 * fichiers, et leur CLÔTURE D'IMPORT donne la surface. **Un composant neuf y entre sans que
 * personne l'y déclare**, du jour où une page publique l'importe — c'est l'AC2, et c'est le point
 * du ticket.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE THÈME CLAIR SEUL EST UNE GARDE, ET LE SOMBRE UN RELEVÉ
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Aucun composant de la surface publique n'est sous une portée `.dark` : la classe existe, elle
 * est posée en toutes lettres, mais seulement dans la console super-admin (TCK-459). Les mesures
 * « en sombre » ci-dessous gardent donc la COHÉRENCE des jetons, pas la lisibilité d'un écran
 * existant — la distinction est celle de `contraste-wcag.ts`, et elle est reprise ici plutôt que
 * supposée.
 *
 * ⚠ **La tolérance est CONDITIONNELLE et GARDÉE, pas affirmée** : `portees-sombres.test.ts`
 * échoue le jour où un composant de cette surface se retrouve sous une portée `.dark`. C'est ce
 * qui distingue « on sait que c'est inatteignable » de « on l'espère ».
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES TROIS ENSEMBLES QUE CE FICHIER TIENT, ET POURQUOI AUCUN N'EST UNE LISTE DE COMPOSANTS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *  · {@link DETTES} — les couples SOUS LE SEUIL qui existaient avant ce ticket, chacun avec son
 *    ratio mesuré et son motif. Ce n'est pas un périmètre, c'est une ARDOISE : la garde échoue si
 *    un couple neuf apparaît (il n'y est pas), ET si un couple consigné disparaît ou change de
 *    valeur (il faut alors le retirer, pas le laisser couvrir autre chose).
 *  · {@link FICHIERS_HORS_JETONS} — le compte des fichiers de la surface qui portent encore une
 *    échelle Tailwind brute (`text-stone-600`…). Aucune valeur du design system ne leur
 *    correspond : les mesurer demanderait de recopier ici une seconde palette. Leur conversion est
 *    le sujet de la famille TCK-440. Le compte est un CLIQUET À DEUX SENS.
 *  · les encres inverses sans fond déclaré, comptées par {@link ENCRES_INVERSES} — le trou est
 *    décrit dans `couples-de-contraste.ts`.
 */
import { readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC, clotureDImport } from '../analyse-statique';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  contraste,
  fmt,
  pireFondSurMedia,
  versRvb,
} from '../contraste-wcag';
import { type CoupleMesure, cleDuCouple, couplesDesFichiers, couplesDuFichier } from '../couples-de-contraste';

/** Les fichiers que Next monte pour une route — la racine de la dérivation. */
const FICHIERS_DE_ROUTE = /^(page|layout|template|default|error|loading|not-found)\.tsx$/;

function pointsDEntree(racine: string): string[] {
  const out: string[] = [];
  const descendre = (dir: string) => {
    for (const entree of readdirSync(dir)) {
      const chemin = join(dir, entree);
      if (statSync(chemin).isDirectory()) descendre(chemin);
      else if (FICHIERS_DE_ROUTE.test(entree)) out.push(chemin);
    }
  };
  descendre(racine);
  return out.sort();
}

const ENTREES = pointsDEntree(join(RACINE_SRC, 'app', '[locale]', '(public)'));
const SURFACE = clotureDImport(ENTREES).filter((f) => f.endsWith('.tsx'));

/**
 * L'ARDOISE — les couples sous le seuil ANTÉRIEURS à TCK-458, mesurés le 2026-08-29.
 *
 * Chaque entrée porte sa clé exacte (`fichier · encre sur fond`), son ratio et son motif. Ce sont
 * des dettes CONSIGNÉES, pas des exemptions : elles sont mesurées à chaque exécution, et la garde
 * échoue si l'une bouge — dans un sens comme dans l'autre.
 *
 * ⚠ Elles se répartissent en quatre familles, et il faut les distinguer avant d'en corriger une :
 *
 *  1. **Sous-jacent inconnu** (`pire` = vrai) — une plaque translucide dont le fichier ne dit pas
 *     sur quoi elle se pose. La mesure est le PIRE CAS des 256 gris, donc pessimiste par
 *     construction : le lightbox pose son texte blanc sur un `bg-scrim/90` que le lecteur statique
 *     ne voit pas (c'est un FRÈRE de portail, pas un ancêtre). Ne pas « corriger » ces couples
 *     sans avoir regardé où le composant est réellement posé.
 *  2. **Boutons primaires au survol** — `hover:bg-primary/80` sous `text-primary-foreground`
 *     tombe à 3,45:1 : l'alpha du survol mange la marge. Défaut réel, hors de ce ticket.
 *  3. **`text-border` en séparateur ou en étoile vide** — 1,20 à 1,26:1, au seuil non textuel de
 *     3:1. Défaut réel et de faible gravité.
 *  4. **Aplats de `--primary` sous de l'encre `--primary`** — le même motif que TCK-444 relève sur
 *     `ProfileBadge` : du texte sur un aplat de sa propre couleur. Défaut réel.
 */
const DETTES: readonly (readonly [string, number, string])[] = [
  // ── 1. Sous-jacent inconnu ────────────────────────────────────────────────────────────────────
  ['app/[locale]/(public)/properties/[slug]/components/PropertyLightbox.tsx · text-white sur bg-white/10 sur un sous-jacent inconnu (pire pixel 255)', 1.00, 'le fond réel est le `bg-scrim/90` du Backdrop, frère de portail — invisible au lecteur statique'],
  ['app/[locale]/(public)/properties/[slug]/components/PropertyLightbox.tsx · text-white sur hover:bg-white/20 sur un sous-jacent inconnu (pire pixel 255)', 1.00, 'idem, état survolé'],
  ['components/search/SearchAutocomplete.tsx · text-primary-foreground/80 sur bg-card/10 sur un sous-jacent inconnu (pire pixel 249)', 1.00, 'variante `navbar`, posée sur la barre `bg-foreground` de `AppTopbar` — un ancêtre d’un autre fichier'],
  ['components/search/SearchAutocomplete.tsx · text-primary-foreground/80 sur hover:bg-card/20 sur un sous-jacent inconnu (pire pixel 248)', 1.00, 'idem, état survolé'],
  ['components/compare/CompareToggleButton.tsx · text-primary-foreground sur bg-card/20 sur un sous-jacent inconnu (pire pixel 248)', 1.00, 'bouton posé SUR la photo du bien : risque réel sur une photo claire'],
  ['components/favorites/FavoriteButton.tsx · text-primary-foreground sur bg-card/20 sur un sous-jacent inconnu (pire pixel 248)', 1.00, 'idem — même motif que la pastille que ce ticket corrige, sur un autre composant'],
  ['app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx · text-muted-foreground sur group-hover:bg-foreground/10 sur un sous-jacent inconnu (pire pixel 111)', 1.00, 'voile de survol à 10 % sur un fond que le fichier ne pose pas'],
  ['components/property/PropertyCard.tsx · text-white sur bg-scrim/50 sur un sous-jacent inconnu (pire pixel 255)', 3.98, 'voile à 50 % sur la photo : sur un pixel blanc, le blanc du texte ne tient pas'],
  // ── 2. Boutons primaires au survol ────────────────────────────────────────────────────────────
  ['app/[locale]/(public)/properties/[slug]/components/PropertyReportButton.tsx · text-primary-foreground sur hover:bg-primary/80 sur un sous-jacent inconnu (pire pixel 255)', 3.45, 'l’alpha du survol mange la marge du bouton primaire'],
  ['app/[locale]/(public)/properties/[slug]/components/PropertyReservationDialog.tsx · text-primary-foreground sur hover:bg-primary/80 sur un sous-jacent inconnu (pire pixel 255)', 3.45, 'idem'],
  ['app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx · text-primary-foreground sur hover:bg-primary/80 sur un sous-jacent inconnu (pire pixel 255)', 3.45, 'idem'],
  ['app/[locale]/(public)/properties/[slug]/not-found.tsx · text-primary-foreground sur hover:bg-primary/90 sur un sous-jacent inconnu (pire pixel 255)', 4.18, 'idem, alpha 90 %'],
  ['components/compare/CompareFloatingBar.tsx · text-primary-foreground sur hover:bg-primary/90 sur #ffffff', 4.18, 'idem, sur un ancêtre `--card` connu'],
  ['components/compare/CompareFloatingBar.tsx · text-primary-foreground sur hover:bg-primary/90 sur #fffffe', 4.18, 'idem, sur `--background` (l’ancêtre `bg-card/95` compose à un octet près)'],
  ['app/[locale]/(public)/agencies/[slug]/not-found.tsx · text-primary-foreground sur hover:bg-primary/90 sur #fcf9f3', 4.21, 'idem'],
  ['app/[locale]/(public)/agents/[slug]/not-found.tsx · text-primary-foreground sur hover:bg-primary/90 sur #fcf9f3', 4.21, 'idem'],
  // ── 3. `text-border` non textuel ──────────────────────────────────────────────────────────────
  ['components/property/cards/PropertyCardCompact.tsx · text-border sur --card', 1.26, 'séparateur « • » ; seuil non textuel 3:1'],
  ['components/property/cards/PropertyCardCompact.tsx · text-border sur --background', 1.20, 'idem'],
  ['components/property/cards/PropertyCardStandard.tsx · text-border sur --card', 1.26, 'idem'],
  ['components/property/cards/PropertyCardStandard.tsx · text-border sur --background', 1.20, 'idem'],
  ['components/property/cards/PropertyCardListing.tsx · text-border sur #ffffff (ancêtre) sur --card', 1.26, 'idem'],
  ['components/property/cards/PropertyCardListing.tsx · text-border sur #ffffff (ancêtre) sur --background', 1.26, 'idem'],
  ['components/public/profile/ReviewsSection.tsx · text-border sur #ffffff (ancêtre) sur --card', 1.26, 'étoile VIDE d’une note ; seuil non textuel 3:1'],
  ['components/public/profile/ReviewsSection.tsx · text-border sur #ffffff (ancêtre) sur --background', 1.26, 'idem'],
  // ── 4. Aplats de --primary sous encre --primary ───────────────────────────────────────────────
  ['components/search/SearchToolbar.tsx · text-primary sur bg-primary/8 sur un sous-jacent inconnu (pire pixel 108)', 1.00, 'texte sur un aplat de sa propre couleur — motif de TCK-444'],
  ['components/search/SearchAutocomplete.tsx · text-primary sur bg-primary/15 sur un sous-jacent inconnu (pire pixel 108)', 1.01, 'idem, le `<mark>` de la surbrillance'],
  ['components/search/FilterSidebar.tsx · text-primary sur bg-primary/5 sur un sous-jacent inconnu (pire pixel 108)', 1.01, 'idem'],
  ['components/forms/FormSuccess.tsx · text-success sur bg-success/5 sur un sous-jacent inconnu (pire pixel 97)', 1.00, 'idem, avec `--success` : le motif n’est pas propre à `--primary`'],
  /*
   * ⚠ LES QUATRE SUIVANTES SONT APPARUES LE 2026-08-30 SANS QU'AUCUN DE CES FICHIERS NE CHANGE.
   *
   * Elles ne sont pas une régression : `--destructive` était déclaré en `oklch(…)` et donc
   * IRRÉSOLVABLE pour ce harnais, qui le rangeait en `horsJetons` — compté, jamais mesuré.
   * TCK-480 l'a converti en hexadécimal à la source ; les couples qui l'emploient sont devenus
   * mesurables, et le pire cas des 256 gris leur donne 1,00:1 comme à toute la famille 4.
   *
   * *Un jeton irrésolvable ne produit pas un rouge, il produit un silence* — et c'est ce
   * silence-là qui a laissé le ton `danger` sous AA pendant des mois (TCK-471, TCK-472).
   *
   * Le fond RÉEL de ces quatre-là est `--card` ou `--background`, jamais un gris arbitraire :
   * `scripts/check-destructive-contrast.mjs` les mesure sur les trois surfaces réelles et rend
   * 4,93:1 au pire en clair. Ne pas les « corriger » ici : il n'y a rien à corriger, il y a un
   * sous-jacent que le lecteur statique ne voit pas.
   */
  ['components/forms/FormError.tsx · text-destructive sur bg-destructive/5 sur un sous-jacent inconnu (pire pixel 92)', 1.00, 'aplat de sa propre couleur, sous-jacent invisible au lecteur statique — mesuré 6,05:1 sur `--background` réel'],
  ['app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx · text-destructive sur bg-destructive/10 sur un sous-jacent inconnu (pire pixel 95)', 1.01, 'idem — 5,48:1 sur `--background` réel'],
  ['components/search/SearchToolbar.tsx · hover:text-destructive sur hover:bg-destructive/10 sur un sous-jacent inconnu (pire pixel 95)', 1.01, 'idem, état survolé'],
  ['components/ui/destructive-banner.tsx · text-destructive sur bg-destructive/10 sur un sous-jacent inconnu (pire pixel 95)', 1.01, 'idem'],
];

/**
 * Le nombre de fichiers de la surface publique dont un couple n'a PAS PU être résolu.
 *
 * ⚠ **Cliquet à DEUX sens.** Il descend quand la famille TCK-440 convertit un fichier : c'est le
 * geste attendu, et corriger ce chiffre en fait partie. Il ne doit jamais monter. *Un cliquet à
 * sens unique est une tolérance, pas une garde.*
 *
 * ⚠⚠ **54 → 43 le 2026-08-30, et PAS par une conversion de fichier.** Ce compte s'appelait « les
 * fichiers qui portent une échelle Tailwind brute », et c'était une description trop étroite de
 * ce qu'il mesure : il compte les couples IRRÉSOLVABLES, quelle qu'en soit la cause. Onze
 * fichiers y figuraient parce que `--destructive` était déclaré en `oklch(…)`, forme que ce
 * harnais ne lit pas. TCK-480 l'a converti en hexadécimal — les onze en sont sortis d'un coup,
 * sans qu'une ligne n'y soit touchée.
 *
 * *Un cliquet dit « ce chiffre a bougé » ; il ne dit jamais POURQUOI, et le nom qu'on lui donne
 * oriente la réponse.* Celui-ci a failli faire chercher onze conversions qui n'ont pas eu lieu.
 *
 * ⚠ **43 → 42 le 2026-08-30, et CETTE fois par une conversion de fichier** — la seule cause que
 * le nom du compteur laissait attendre, et la première à se produire depuis qu'il existe.
 * `components/compare/CompareFloatingBar.tsx` a été redessiné : il portait `bg-white/95`,
 * `border-stone-200`, `text-stone-900`, `text-stone-500` et `bg-stone-100` — cinq couples
 * qu'aucune valeur du design system ne décrivait, donc irrésolvables. Il n'écrit plus que des
 * jetons (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-muted`),
 * et ses couples sont désormais MESURÉS au lieu d'être comptés.
 */
const FICHIERS_HORS_JETONS = 42;

/**
 * Idem pour les encres inverses laissées de côté (cf. `couples-de-contraste.ts`).
 *
 * **150 → 151 le 2026-08-30 (TCK-491).** Cause : le rappel sous le filtre « Statut foncier » de
 * `FilterSidebar.tsx`, `text-[11px] text-muted-foreground` — les MÊMES classes que les onze autres
 * rappels du même fichier, déjà comptés ici. Le groupe ne déclare pas de fond parce qu'aucun de
 * ces rappels ne le fait : le fond est celui du panneau, posé par un ancêtre.
 *
 * *Écrire ce couple autrement pour ne pas faire monter le compteur aurait rendu ce rappel
 * différent de ses onze voisins* — le cliquet dirait vrai, et l'écran serait moins cohérent.
 *
 * **151 → 154 le 2026-08-30**, et les trois viennent du même fichier : `CompareFloatingBar.tsx`
 * redessiné, qui écrit désormais `text-muted-foreground` là où il écrivait `text-stone-500`.
 * Le compteur monte donc parce qu'un fichier est PASSÉ AUX JETONS — c'est le même geste qui fait
 * descendre {@link FICHIERS_HORS_JETONS} de 43 à 42, vu par l'autre trou.
 *
 * *Les deux compteurs bougent en sens opposés sur un seul changement, et aucun des deux n'est
 * une régression* : une encre en échelle brute était comptée comme irrésolvable ; la même encre
 * en jeton inverse est comptée comme non mesurée faute de fond DÉCLARÉ. Le fond réel est celui
 * du panneau (`bg-card/95`, posé par l'ancêtre), et `--muted-foreground` #6e655a y tient
 * largement AA — mais le déclarer sur chacun des trois éléments serait écrire un fond pour
 * satisfaire un compteur, sur des enfants qui n'en ont aucun besoin à l'écran.
 */
const ENCRES_INVERSES = 154;

function sousLeSeuil(couples: readonly CoupleMesure[]): CoupleMesure[] {
  return couples.filter((c) => c.ratio < c.seuil);
}

function decrire(c: CoupleMesure): string {
  return `${cleDuCouple(c)} = ${fmt(c.ratio)} (seuil ${c.seuil}, ${c.texte ? 'texte' : 'non textuel'}) — ${c.fichier}:${c.ligne} <${c.balise}>`;
}

describe('surface publique — contraste sur un périmètre dérivé (TCK-458)', () => {
  it('AC2 — le périmètre est DÉRIVÉ des pages publiques, pas énuméré', () => {
    // Les points d'entrée viennent du système de fichiers : une page ajoutée y entre seule.
    expect(ENTREES.length).toBeGreaterThan(10);
    expect(SURFACE.length).toBeGreaterThan(100);

    // Il couvre ce que la garde de TCK-440 couvrait…
    expect(SURFACE.map((f) => f.replace(/.*\/src\//, ''))).toContain('components/home/Navbar.tsx');
    expect(SURFACE.map((f) => f.replace(/.*\/src\//, ''))).toContain('components/home/Footer.tsx');
    // …ET le composant qu'elle ne couvrait pas, celui qui portait le défaut de ce ticket.
    expect(SURFACE.map((f) => f.replace(/.*\/src\//, '')))
      .toContain('components/property/cards/ContractTypeChip.tsx');

    // Une garde de périmètre doit aussi savoir s'ARRÊTER : la console super-admin n'est pas la
    // surface publique, et un périmètre qui avale tout ne mesure plus rien de précis.
    expect(SURFACE.filter((f) => f.includes('/super-admin/'))).toEqual([]);
  });

  it('AC1/AC5 — thème clair : aucun couple sous son seuil, hors dettes consignées', () => {
    const { couples } = couplesDesFichiers(SURFACE, JETONS_CLAIR, false);
    // Une garde qui n'a plus rien à mesurer rend le même vert qu'une garde satisfaite.
    expect(couples.length).toBeGreaterThan(150);

    const consignees = new Set(DETTES.map(([cle]) => cle));
    const neufs = sousLeSeuil(couples).filter((c) => !consignees.has(cleDuCouple(c)));
    expect(neufs.map(decrire), 'couple(s) NEUFS sous le seuil sur la surface publique').toEqual([]);
  });

  it('AC1 — la pastille de contrat tient sur son PIRE fond, dans les deux thèmes', () => {
    const chip = SURFACE.find((f) => f.endsWith('cards/ContractTypeChip.tsx'))!;
    for (const [nom, jetons, sombre] of [
      ['clair', JETONS_CLAIR, false],
      ['sombre', JETONS_SOMBRE, true],
    ] as const) {
      const { couples } = couplesDuFichier(chip, jetons, sombre);
      expect(couples.length, `${nom} — aucun couple relevé sur la pastille`).toBeGreaterThan(1);
      expect(
        sousLeSeuil(couples).map(decrire),
        `pastille de contrat, thème ${nom}`,
      ).toEqual([]);
      // Et la valeur elle-même est consignée, pas seulement le verdict.
      const location = couples.find((c) => c.fond === 'bg-accent');
      expect(location, `${nom} — la variante location n'est plus mesurée`).toBeDefined();
      expect(location!.ratio).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    }
  });

  it("l'ardoise correspond couple pour couple à la réalité (deux sens)", () => {
    const { couples } = couplesDesFichiers(SURFACE, JETONS_CLAIR, false);
    const parCle = new Map(couples.map((c) => [cleDuCouple(c), c]));
    const mortes: string[] = [];
    for (const [cle, ratio, motif] of DETTES) {
      const couple = parCle.get(cle);
      if (!couple) {
        mortes.push(`« ${cle} » n'existe plus — RETIRER l'entrée (${motif})`);
        continue;
      }
      if (Math.abs(couple.ratio - ratio) > 0.01) {
        mortes.push(`« ${cle} » vaut ${fmt(couple.ratio)} et non ${fmt(ratio)} — re-consigner`);
      }
      if (couple.ratio >= couple.seuil) {
        mortes.push(`« ${cle} » est passé au-dessus du seuil (${fmt(couple.ratio)}) — RETIRER`);
      }
    }
    expect(mortes, "entrée(s) d'ardoise qui ne correspondent plus à rien").toEqual([]);
  });

  it('AC4 — le pire fond sur média se DÉRIVE par balayage, jamais par une extrémité', () => {
    // Le contre-exemple qui interdit la règle « blanc si l'encre est claire, noir sinon ».
    const gris: [number, number, number] = [128, 128, 128];
    const balaye = pireFondSurMedia(gris, gris, 0.9);
    expect(balaye.pixel, 'le minimum est au CROISEMENT, pas à un bord').toBe(128);
    expect(balaye.ratio).toBeCloseTo(1.0, 4);
    const extremites = [0, 255].map((g) =>
      contraste(gris, [128 * 0.9 + g * 0.1, 128 * 0.9 + g * 0.1, 128 * 0.9 + g * 0.1]));
    // Une règle par extrémité rendrait 1,19 (pixel 0) ou 1,19 (pixel 255) — jamais 1,00.
    expect(Math.min(...extremites)).toBeGreaterThan(1.18);
    expect(Math.min(...extremites) / balaye.ratio).toBeGreaterThan(1.18);

    // Et sur la pastille AVANT correction : le pire pixel n'est pas le même selon le thème —
    // 255 en clair (encre quasi blanche), 0 en sombre (encre quasi noire). Même couple.
    const clair = pireFondSurMedia(versRvb(JETONS_CLAIR['accent-foreground']!), versRvb(JETONS_CLAIR.accent!), 0.9);
    expect(clair.pixel).toBe(255);
    expect(clair.ratio).toBeCloseTo(4.223, 2);
    const sombre = pireFondSurMedia(versRvb(JETONS_SOMBRE['accent-foreground']!), versRvb(JETONS_SOMBRE.accent!), 0.9);
    expect(sombre.pixel).toBe(0);
  });

  it('AC3 — un couple INVENTÉ, dans un composant neuf, est attrapé par le périmètre', () => {
    // L'ablation ne porte pas sur le défaut connu : un test qui n'attraperait que celui-ci serait
    // déjà passé avant le ticket. On fabrique donc une page et un composant que personne n'a
    // déclarés, et on vérifie que la CLÔTURE les ramasse et que la MESURE les refuse.
    const racine = mkdtempSync(join(tmpdir(), 'contraste-ablation-'));
    writeFileSync(join(racine, 'Invente.tsx'), `
      export function Invente() {
        return <span className="bg-muted text-border">un libellé quelconque</span>;
      }
    `);
    writeFileSync(join(racine, 'page.tsx'), `
      import { Invente } from './Invente';
      export default function Page() { return <Invente />; }
    `);

    const cloture = clotureDImport([join(racine, 'page.tsx')]);
    expect(cloture, 'la clôture ne ramasse pas le composant neuf').toHaveLength(2);

    const { couples } = couplesDesFichiers(cloture, JETONS_CLAIR, false);
    const refuses = sousLeSeuil(couples);
    expect(refuses.length, 'le couple inventé traverse la mesure').toBeGreaterThan(0);
    expect(refuses[0]!.ratio).toBeLessThan(SEUIL_AA_TEXTE);
    expect(refuses[0]!.texte, "l'élément porte du texte : c'est le seuil de 4,5:1 qui s'applique").toBe(true);

    // Et le sens inverse : le même composant avec un couple CONFORME passe. Une garde qui refuse
    // tout ne garde rien.
    writeFileSync(join(racine, 'Invente.tsx'), `
      export function Invente() {
        return <span className="bg-muted text-foreground">un libellé quelconque</span>;
      }
    `);
    const { couples: conformes } = couplesDesFichiers(clotureDImport([join(racine, 'page.tsx')]), JETONS_CLAIR, false);
    expect(sousLeSeuil(conformes)).toEqual([]);
  });

  it('les deux trous déclarés sont COMPTÉS, et le compte est un cliquet à deux sens', () => {
    const { horsJetons, encresInverses } = couplesDesFichiers(SURFACE, JETONS_CLAIR, false);
    const fichiers = new Set(horsJetons.map((h) => h.split(':')[0]));
    expect(
      fichiers.size,
      `fichiers de la surface publique dont un couple reste IRRÉSOLVABLE. `
      + `Ce compte ne doit JAMAIS monter ; s'il descend, deux causes possibles et il faut `
      + `savoir laquelle : un fichier converti (famille TCK-440), ou un JETON devenu `
      + `lisible (TCK-480 en a sorti onze d'un coup). Corriger FICHIERS_HORS_JETONS ici, `
      + `avec sa date ET sa cause.`,
    ).toBe(FICHIERS_HORS_JETONS);
    expect(
      encresInverses.length,
      'encres inverses sans fond déclaré (trou décrit dans couples-de-contraste.ts)',
    ).toBe(ENCRES_INVERSES);
  });
});
