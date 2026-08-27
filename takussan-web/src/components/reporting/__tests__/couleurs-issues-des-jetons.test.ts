import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **`components/reporting/` ne parle qu'un vocabulaire de couleur : celui des jetons.**
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE — un `done` mesuré une fois redevient faux
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-361 a éteint deux couleurs en dur : un ambre de l'échelle Tailwind sur les barres de
 * l'entonnoir, et un ambre écrit en canaux rouge-vert-bleu dans le style inline des cohortes. Une
 * revue adverse les a REMISES telles quelles, puis a rejoué les 26 gardes du dépôt et la suite de
 * tests : **tout est resté vert.** Ce répertoire n'entrait dans le périmètre d'aucune garde de
 * palette — `check-super-admin-tokens.mjs` nomme quatre répertoires dont il n'est pas, et
 * `check-app-tokens.mjs` ne garde que le dialecte `app-*`.
 *
 * L'exigence était donc vraie au moment du merge et gardée par rien. C'est le motif exact que
 * l'en-tête de `check-super-admin-tokens.mjs` raconte sur TCK-244 et TCK-245.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE AJOUTE À `check-super-admin-tokens.mjs`, ET POURQUOI ELLE NE LE REMPLACE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le recouvrement des deux contrôles Tailwind est délibéré et coûte trois lignes : ce répertoire
 * doit rester gardé même si le périmètre de l'autre bouge, et l'inverse est vrai aussi.
 *
 * Mais le contrôle C n'a **aucun** équivalent ailleurs, et c'est celui qui manquait vraiment :
 * l'autre garde déclare elle-même son angle mort — « sauf le cas, hors sujet ici, d'un style
 * inline en `style={{ color: '#…' }}` ». Or c'est EXACTEMENT la forme qu'avait la carte de chaleur.
 * Un graphique est la surface où la couleur est le plus souvent calculée, donc écrite en style
 * inline : lui appliquer une garde aveugle aux styles inline aurait laissé le trou principal.
 *
 * ⚠ Les commentaires ne sont pas retirés avant analyse, délibérément — même raison que les deux
 * autres gardes de jetons : un docblock qui montre une couleur en dur en syntaxe copiable est la
 * documentation périmée qui fait repousser le motif. Le récit s'écrit en toutes lettres.
 *
 * Ce qu'elle NE prouve PAS : rien sur la justesse du rendu. Un `--chart-4` posé là où il fallait
 * `--chart-1` la laisse verte. C'est un plancher de vocabulaire, pas une revue de design.
 */

const RACINE = join(__dirname, '..');

const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'divide', 'fill', 'stroke', 'placeholder',
  'outline', 'shadow', 'from', 'via', 'to', 'caret', 'accent', 'decoration',
].join('|');

/** Les familles de l'échelle Tailwind, TOUTES — pas celles que ce répertoire emploie aujourd'hui. */
const FAMILLES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
].join('|');

const CONTROLES = [
  ['A', 'échelle Tailwind brute (bg-amber-500, stroke-emerald-400…)',
    new RegExp(`\\b(?:${PREFIXES})-(?:${FAMILLES})-[0-9]{2,3}\\b`, 'g')],
  ['B', 'couleur nommée en dur (bg-white, text-black…)',
    new RegExp(`\\b(?:${PREFIXES})-(?:white|black)\\b`, 'g')],
  ['C', 'valeur de couleur littérale (style inline, valeur arbitraire) — l’angle mort des deux autres gardes',
    /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\(|\bcolor\s*\(/g],
] as const;

function fichiersDeRendu(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return entree.name === '__tests__' ? [] : fichiersDeRendu(chemin);
    return /\.tsx?$/.test(entree.name) ? [chemin] : [];
  });
}

function ligneDe(contenu: string, decalage: number): number {
  return contenu.slice(0, decalage).split('\n').length;
}

describe('components/reporting — les couleurs sortent des jetons (TCK-361)', () => {
  it('n’écrit aucune couleur hors des jetons du design system', () => {
    const fichiers = fichiersDeRendu(RACINE);

    // Une garde qui parcourt une liste vide passe au vert sans rien vérifier.
    expect(fichiers.length).toBeGreaterThan(0);

    const fautifs = fichiers.flatMap((chemin) => {
      const contenu = readFileSync(chemin, 'utf8');

      return CONTROLES.flatMap(([id, libelle, motif]) => {
        motif.lastIndex = 0;

        return [...contenu.matchAll(motif)].map(
          (m) => `${id} · ${libelle} — ${chemin}:${ligneDe(contenu, m.index ?? 0)} — ${m[0]}`,
        );
      });
    });

    expect(fautifs).toEqual([]);
  });

  /**
   * La garde doit pouvoir échouer, et sur les DEUX couleurs exactes que la revue adverse a remises
   * — plus les formes voisines par lesquelles elles reviendraient sous un autre nom.
   */
  it.each([
    ['la barre d’entonnoir remise en ambre', 'bg-amber-500/70'],
    ['le même ambre sous un autre utilitaire', 'stroke-emerald-400'],
    ['la carte de chaleur en canaux bruts', 'backgroundColor: `rgba(217, 119, 6, ${intensite})`'],
    ['la même en hexadécimal', "style={{ color: '#d97706' }}"],
    ['la même en valeur arbitraire Tailwind', 'className="bg-[#d97706]"'],
    ['un blanc en dur', 'className="bg-white"'],
    ['un espace avant la parenthèse', 'backgroundColor: rgb (217, 119, 6)'],
  ])('reconnaît « %s » (la garde sait échouer)', (_libelle, extrait) => {
    const vu = CONTROLES.some(([, , motif]) => {
      motif.lastIndex = 0;

      return motif.test(extrait);
    });

    expect(vu).toBe(true);
  });

  /** …et laisser passer le vocabulaire légitime, sous peine d'être contournée plutôt que suivie. */
  it.each([
    ['jeton de graphique', 'className="stroke-chart-1"'],
    ['jeton avec opacité', 'className="bg-chart-1/80"'],
    ['jeton sémantique', 'className="text-muted-foreground"'],
    ['color-mix sur un jeton', 'backgroundColor: `color-mix(in srgb, var(--chart-1) 40%, transparent)`'],
    ['une classe qui contient un nom de famille', 'className="border-dashed border-border/70"'],
  ])('ne mord pas sur « %s »', (_libelle, extrait) => {
    const vu = CONTROLES.some(([, , motif]) => {
      motif.lastIndex = 0;

      return motif.test(extrait);
    });

    expect(vu).toBe(false);
  });
});
