import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import {
  RADAR_ADVERTISER_NATURES,
  RADAR_DISCARD_REASONS,
  RADAR_FIELD_FLAGS,
  RADAR_MATCH_SIGNALS,
  RADAR_PROPERTY_TYPES,
} from '@/types/radar';
import { ERREURS_FICHE_RADAR, ERREURS_SAISIE_RADAR, MOTIFS_ECART_RADAR } from '../codes-radar';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', '..');
const lire = (...chemin: string[]) => readFileSync(join(RACINE, ...chemin), 'utf8');

/** TCK-2387 — les codes, les drapeaux et les natures de la fiche : un libellé par langue, et l'API d'accord. */
describe('codes de la fiche du Radar', () => {
  it.each([['fr', fr], ['en', en], ['wo', wo]])('chaque code d\'erreur, drapeau et nature a son libellé en %s', (_langue, messages) => {
    const fiche = messages.superAdmin.pages.radar.listing;
    const erreurs = fiche.errors as Record<string, string>;
    for (const cle of Object.values(ERREURS_FICHE_RADAR)) expect(erreurs[cle], cle).toBeTruthy();
    const drapeaux = fiche.confidence.flags as Record<string, string>;
    for (const drapeau of RADAR_FIELD_FLAGS) expect(drapeaux[drapeau], drapeau).toBeTruthy();
    const natures = fiche.options.natures as Record<string, string>;
    for (const nature of RADAR_ADVERTISER_NATURES) expect(natures[nature], nature).toBeTruthy();
  });

  it('chaque code nommé est un code que l\'API émet (lang/fr/errors.php)', () => {
    const erreursApi = lire('takussan-api', 'lang', 'fr', 'errors.php');
    // Le fichier range les codes en tableaux imbriqués (`'radar' => ['listing' => ['stage_conflict' => …`) :
    // chaque segment du code se cherche après le précédent.
    const declare = (code: string) => {
      let position = 0;
      for (const segment of code.split('.')) {
        position = erreursApi.indexOf(`'${segment}' =>`, position);
        if (position === -1) return false;
      }
      return true;
    };
    for (const code of Object.keys(ERREURS_FICHE_RADAR)) expect(declare(code), code).toBe(true);
    expect(declare('radar.listing.inconnu')).toBe(false);
  });

  it('les drapeaux sont ceux de l\'ExtractionNormalizer, ni plus ni moins', () => {
    const source = lire('takussan-api', 'app', 'Services', 'Radar', 'ExtractionNormalizer.php');
    const api = [...source.matchAll(/public const FLAG_\w+ = '([^']+)'/g)].map((m) => m[1]).sort();
    expect([...RADAR_FIELD_FLAGS].sort()).toEqual(api);
  });

  it('les natures sont celles de l\'enum RadarAdvertiserNature', () => {
    const source = lire('takussan-api', 'app', 'Models', 'Enums', 'RadarAdvertiserNature.php');
    const api = [...source.matchAll(/case \w+ = '([^']+)'/g)].map((m) => m[1]).sort();
    expect([...RADAR_ADVERTISER_NATURES].sort()).toEqual(api);
  });

  it('les motifs d\'écart sont ceux de l\'enum RadarDiscardReason, chacun avec son libellé en trois langues', () => {
    const source = lire('takussan-api', 'app', 'Models', 'Enums', 'RadarDiscardReason.php');
    const api = [...source.matchAll(/case \w+ = '([^']+)'/g)].map((m) => m[1]).sort();
    expect([...RADAR_DISCARD_REASONS].sort()).toEqual(api);
    expect(Object.keys(MOTIFS_ECART_RADAR).sort()).toEqual(api);

    for (const messages of [fr, en, wo]) {
      const motifs = messages.superAdmin.pages.radar.reasons as Record<string, string>;
      for (const valeur of RADAR_DISCARD_REASONS) expect(motifs[MOTIFS_ECART_RADAR[valeur]], valeur).toBeTruthy();
    }
  });

  it.each([['fr', fr], ['en', en], ['wo', wo]])('chaque signal de rapprochement a son libellé en %s', (_langue, messages) => {
    const signaux = messages.superAdmin.pages.radar.listing.matches.signals as Record<string, string>;
    for (const signal of RADAR_MATCH_SIGNALS.filter((s) => s !== 'photo')) expect(signaux[signal], signal).toBeTruthy();
    for (const force of ['high', 'medium', 'low']) expect(signaux[`photo_${force}`], force).toBeTruthy();
  });

  it('les signaux sont ceux du RadarMatcher', () => {
    const source = lire('takussan-api', 'app', 'Services', 'Radar', 'RadarMatcher.php');
    for (const signal of RADAR_MATCH_SIGNALS) expect(source, signal).toContain(`'${signal}'`);
  });

  it('API vers front : chaque code `radar.*` de lang/fr/errors.php a son libellé dans une table du front', () => {
    const lignes = lire('takussan-api', 'lang', 'fr', 'errors.php').split('\n');
    const debut = lignes.findIndex((l) => /^\s{4}'radar' => \[/.test(l));
    expect(debut).toBeGreaterThan(-1);

    // Le tableau `radar` est imbriqué sur deux niveaux : groupe => [ clé => message ].
    const codes: string[] = [];
    let groupe: string | null = null;
    for (const ligne of lignes.slice(debut + 1)) {
      if (/^\s{4}\],/.test(ligne)) break;
      const ouvre = /^\s{8}'(\w+)' => \[/.exec(ligne);
      if (ouvre) groupe = ouvre[1];
      const feuille = /^\s{12}'(\w+)' =>/.exec(ligne);
      if (feuille && groupe) codes.push(`radar.${groupe}.${feuille[1]}`);
    }
    expect(codes.length).toBeGreaterThanOrEqual(9);

    const connus = new Set([...Object.keys(ERREURS_FICHE_RADAR), ...Object.keys(ERREURS_SAISIE_RADAR)]);
    expect(codes.filter((code) => !connus.has(code))).toEqual([]);
  });

  it('les types de bien de la fiche sont ceux de l\'enum PropertyType', () => {
    const source = lire('takussan-api', 'app', 'Models', 'Enums', 'PropertyType.php');
    const api = [...source.matchAll(/case \w+ = '([^']+)'/g)].map((m) => m[1]);
    expect([...RADAR_PROPERTY_TYPES]).toEqual(api);
  });
});

