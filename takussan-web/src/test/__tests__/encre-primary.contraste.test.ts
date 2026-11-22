/**
 * `--primary` SUR LES FONDS CONNUS DE TOUT `src/` — TCK-487 (AC3, option b du porteur).
 *
 * Le porteur a tranché le 2026-11-16 : le jeton `--primary` ne change pas, on corrige les SITES qui
 * échouent, un par un (encre `text-primary-deep`, survol `hover:bg-primary-deep` opaque). Une
 * décision par sites ne se garde pas par la valeur d'un jeton : elle se garde par les sites. Cette
 * garde mesure donc, par le harnais commun (`couplesDesFichiers`), tout couple dont l'encre OU le
 * fond est de la famille `primary`, dans tous les fichiers de `src/`, et refuse ceux qui tombent
 * sous leur seuil — 4,5:1 pour du texte, 3:1 sinon.
 *
 * ⚠ Ce qu'elle ne voit PAS, et pourquoi c'est déclaré plutôt que masqué :
 *  · les couples au fond INCONNU (`pire` = vrai) : le pire des 256 gris rend ~1,00:1 sur tout aplat
 *    de sa propre couleur — un rouge inventé. Ils sont gardés là où leur fond réel est connu
 *    (`surface-publique.contraste.test.ts`, `familles-de-tons-tck-484.test.tsx`) ;
 *  · les classes écrites dans un `.ts` (tables de tons) : `familles-de-tons-tck-484` les mesure.
 *
 * ⚠⚠ **Le sombre ne compte que sous une portée `.dark`** (TCK-452, option B : pas de thème sombre
 * global). Mesurer le sombre partout rendrait ~25 rouges (`text-primary` sur `hover:bg-muted`,
 * 3,99:1…) sur des écrans que personne ne verra jamais en sombre ; `portees-sombres.ts` dérive la
 * liste des fichiers qu'une portée peut faire rendre.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC, nommer, sourcesDe } from '../analyse-statique';
import { JETONS_CLAIR, JETONS_SOMBRE, fmt } from '../contraste-wcag';
import { type CoupleMesure, cleDuCouple, couplesDesFichiers } from '../couples-de-contraste';
import { fichiersSousPorteeSombre } from '../portees-sombres';

const FICHIERS = sourcesDe(RACINE_SRC, /\.tsx$/).filter(
  (f) => !f.includes('/__tests__/') && !/\.test\.tsx$/.test(f) && !f.includes('/playground/maquettes/'),
);

const famillePrimary = (c: CoupleMesure) => /(^|[:-])primary\b/.test(c.encre) || /(^|[:-])primary\b/.test(c.fond);

function echecs(fichiers: readonly string[], jetons: Readonly<Record<string, string>>, sombre: boolean) {
  const { couples } = couplesDesFichiers(fichiers, jetons, sombre);
  const mesures = couples.filter((c) => !c.pire && famillePrimary(c));
  return {
    mesures,
    sous: mesures
      .filter((c) => c.ratio < c.seuil)
      .map((c) => `${cleDuCouple(c)} = ${fmt(c.ratio)} (seuil ${c.seuil}) — ${c.fichier}:${c.ligne}`),
  };
}

describe('TCK-487 — `--primary` tient son seuil sur tout fond connu', () => {
  it('thème clair : aucun couple de la famille `primary` sous son seuil, dans tout `src/`', () => {
    const { mesures, sous } = echecs(FICHIERS, JETONS_CLAIR, false);
    // Une garde qui n'a plus rien à mesurer rend le même vert qu'une garde satisfaite.
    expect(mesures.length).toBeGreaterThan(300);
    expect(sous, 'couple(s) `primary` sous le seuil en clair').toEqual([]);
  });

  it('thème sombre : idem, sur les seuls fichiers qu’une portée `.dark` peut rendre', () => {
    const sousPortee = fichiersSousPorteeSombre();
    const fichiers = FICHIERS.filter((f) => sousPortee.has(nommer(f)));
    expect(fichiers.length, 'aucun fichier sous portée sombre : la dérivation a cassé').toBeGreaterThan(5);
    // Le badge « console » est LE site sombre de ce ticket : s'il n'est plus mesuré, rien ne l'est.
    expect(fichiers.map(nommer)).toContain('components/layout/SuperAdminTopbar.tsx');
    const { sous } = echecs(fichiers, JETONS_SOMBRE, true);
    expect(sous, 'couple(s) `primary` sous le seuil sous une portée `.dark`').toEqual([]);
  });

  it('auto-épreuve : les quatre motifs corrigés par TCK-487 sont refusés, leurs corrections acceptées', () => {
    const racine = mkdtempSync(join(tmpdir(), 'encre-primary-'));
    const ecrire = (classes: readonly string[]) => {
      const f = join(racine, 'Invente.tsx');
      writeFileSync(f, `export function Invente() { return <div className="bg-background">${
        classes.map((c) => `<span className="${c}">un libellé</span>`).join('')
      }</div>; }`);
      return echecs([f], JETONS_CLAIR, false);
    };
    const avant = ecrire([
      'bg-primary/10 text-primary',                                // pastille sur aplat : 4,43:1
      'bg-primary text-primary-foreground hover:bg-primary/90',    // survol translucide : 4,18:1
      'text-primary hover:bg-accent',                              // sélecteur survolé : 1,04:1
    ]);
    expect(avant.sous.length, 'un motif corrigé par TCK-487 traverse la garde').toBeGreaterThanOrEqual(3);
    const apres = ecrire([
      'bg-primary/10 text-primary-deep',
      'bg-primary text-primary-foreground hover:bg-primary-deep',
      'text-primary hover:bg-muted',
    ]);
    expect(apres.mesures.length).toBeGreaterThanOrEqual(3);
    expect(apres.sous).toEqual([]);
  });
});
