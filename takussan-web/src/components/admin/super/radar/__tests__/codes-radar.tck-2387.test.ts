import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { RADAR_ADVERTISER_NATURES, RADAR_FIELD_FLAGS } from '@/types/radar';
import { ERREURS_FICHE_RADAR } from '../codes-radar';

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
});
