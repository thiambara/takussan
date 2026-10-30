import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import {
  ERREURS_ANNONCEUR_RADAR,
  ERREURS_FICHE_RADAR,
  ERREURS_SAISIE_RADAR,
  MOTIFS_RADAR,
} from '../../codes-radar';
import { BLOCAGES_GLOBAUX_RADAR, CODES_SANS_SECOND_MESSAGE, ERREURS_PUBLICATION_RADAR } from '../codes-publication';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', '..', '..');
const lire = (...chemin: string[]) => readFileSync(join(RACINE, ...chemin), 'utf8');

/** Les fichiers PHP de `takussan-api/app/`, récursivement. */
function fichiersPhp(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiersPhp(chemin) : chemin.endsWith('.php') ? [chemin] : [];
  });
}

/**
 * Tous les codes `radar.(publish|photo|advertiser|listing|mandate|activation).x` que l'API écrit en littéral — hors clés de
 * `config()` (`radar.publish.max_photos`). TCK-2394 : le mandat et la relance d'activation y entrent.
 */
const CODES_API = (() => {
  const trouves = new Set<string>();
  for (const fichier of fichiersPhp(join(RACINE, 'takussan-api', 'app'))) {
    for (const m of readFileSync(fichier, 'utf8').matchAll(/(?<!config\()'(radar\.(?:publish|photo|advertiser|listing|mandate|activation)\.[a-z_]+)'/g)) trouves.add(m[1]);
  }
  return [...trouves].sort();
})();

/**
 * TCK-2389 — les codes de « Publier pour lui » et de la réserve de photos : un libellé par langue, chaque code que l'API
 * émet est connu de l'écran, et chaque code nommé existe côté API (lang/fr/errors.php, ou la source de l'aperçu).
 */
describe('codes de « Publier pour lui »', () => {
  it.each([['fr', fr], ['en', en], ['wo', wo]])('chaque code a son libellé en %s', (_langue, messages) => {
    const libelles = messages.superAdmin.pages.radar.publication.errors as Record<string, string>;
    for (const cle of Object.values(ERREURS_PUBLICATION_RADAR)) expect(libelles[cle], cle).toBeTruthy();
  });

  it('chaque code `radar.publish|photo|advertiser|listing` que l\'API écrit a un libellé à l\'écran', () => {
    const connus = new Set([
      ...Object.keys(ERREURS_PUBLICATION_RADAR),
      ...Object.keys(ERREURS_ANNONCEUR_RADAR),
      ...Object.keys(ERREURS_FICHE_RADAR),
      ...Object.keys(ERREURS_SAISIE_RADAR),
      ...Object.keys(MOTIFS_RADAR),
    ]);
    expect(CODES_API.length).toBeGreaterThan(20);
    expect(CODES_API.filter((code) => !connus.has(code))).toEqual([]);
  });

  it('les codes de refus nommés sont ceux de lang/fr/errors.php, ceux de l\'aperçu ceux de RadarPublisher', () => {
    const erreursApi = lire('takussan-api', 'lang', 'fr', 'errors.php');
    const declare = (code: string) => {
      let position = 0;
      for (const segment of code.split('.')) {
        position = erreursApi.indexOf(`'${segment}' =>`, position);
        if (position === -1) return false;
      }
      return true;
    };
    const publisher = lire('takussan-api', 'app', 'Services', 'Radar', 'RadarPublisher.php');
    for (const code of Object.keys(ERREURS_PUBLICATION_RADAR)) {
      // `quota.*` et `idempotency.*` sont ceux de l'API commune ; `nothing_covered` n'est qu'un blocage de l'aperçu.
      if (code.startsWith('quota.') || code.startsWith('idempotency.')) continue;
      if (code === 'radar.publish.nothing_covered') {
        expect(publisher, code).toContain(`'${code}'`);
        continue;
      }
      expect(declare(code), code).toBe(true);
    }
  });

  it('les codes de l\'idempotence et du quota sont ceux que l\'API émet', () => {
    expect(lire('takussan-api', 'app', 'Http', 'Middleware', 'EnsureIdempotentWrite.php')).toContain("'idempotency.key_reused'");
    expect(lire('takussan-api', 'app', 'Http', 'Middleware', 'EnsureIdempotentWrite.php')).toContain("'idempotency.in_progress'");
    expect(lire('takussan-api', 'app', 'Services', 'Billing', 'QuotaResolver.php')).toContain("'quota.listings_exceeded'");
  });

  it('les blocages qui ferment tout l\'écran sont des codes connus', () => {
    const connus = new Set([...Object.keys(ERREURS_PUBLICATION_RADAR), ...Object.keys(ERREURS_ANNONCEUR_RADAR)]);
    for (const code of BLOCAGES_GLOBAUX_RADAR) expect(connus.has(code), code).toBe(true);
  });

  it('les codes qui font taire le second message sont des blocages globaux, refusés par l\'API à published-message', () => {
    const publisher = lire('takussan-api', 'app', 'Services', 'Radar', 'RadarPublisher.php');
    const corps = publisher.slice(publisher.indexOf('public function publishedMessage'));
    expect(CODES_SANS_SECOND_MESSAGE.size).toBeGreaterThan(0);
    for (const code of CODES_SANS_SECOND_MESSAGE) {
      expect(BLOCAGES_GLOBAUX_RADAR.has(code), code).toBe(true);
      const constante = publisher.match(new RegExp(`const (\\w+) = '${code.replaceAll('.', '\\.')}'`))?.[1];
      expect(constante, `constante de ${code}`).toBeDefined();
      expect(corps.slice(0, corps.indexOf('$template')), code).toContain(`self::${constante}`);
    }
  });

  it('les plafonds de la réserve sont ceux de l\'API', async () => {
    const { RADAR_PHOTOS_PAR_ENVOI_MAX, RADAR_RESERVE_PHOTOS_MAX } = await import('@/types/radar');
    expect(lire('takussan-api', 'config', 'radar.php')).toContain(`'reserve_max' => ${RADAR_RESERVE_PHOTOS_MAX}`);
    expect(lire('takussan-api', 'app', 'Http', 'Requests', 'Api', 'Admin', 'StoreRadarListingPhotosRequest.php'))
      .toContain(`'max:${RADAR_PHOTOS_PAR_ENVOI_MAX}'`);
  });
});
