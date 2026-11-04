import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { ARRETS_COLLECTE_RADAR, ERREURS_COLLECTE_RADAR, MOTIFS_RADAR } from '../codes-radar';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', '..');
const lire = (...chemin: string[]) => readFileSync(join(RACINE, 'takussan-api', 'app', ...chemin), 'utf8');

/** Les valeurs des constantes `const <PREFIXE>… = '…'` d'une source PHP. */
function constantes(source: string, prefixe = ''): string[] {
  return [...source.matchAll(new RegExp(`const ${prefixe}[A-Z_]* = '([^']+)'`, 'g'))].map((m) => m[1]);
}

/**
 * TCK-2467 — les trois codes de la découverte par sitemap ont leur libellé, et, relus dans les sources de l'API, chaque
 * refus de lecture (`RadarFetchRefused`) et chaque arrêt de passage (`STOP_*`) est nommé : un code neuf rougit ici au
 * lieu de s'afficher brut.
 */
describe('codes de la collecte (TCK-2467)', () => {
  it.each([['fr', fr], ['en', en], ['wo', wo]])('les trois codes du sitemap ont leur libellé en %s', (_langue, messages) => {
    const radar = messages.superAdmin.pages.radar;
    const motifs = radar.reasons as Record<string, string>;
    const arrets = radar.crawl.stops as Record<string, string>;
    const erreurs = radar.crawl.errors as Record<string, string>;
    expect(motifs[MOTIFS_RADAR['radar.fetch.not_xml']]).toBeTruthy();
    expect(arrets[ARRETS_COLLECTE_RADAR['radar.crawl.sitemap_invalid']]).toBeTruthy();
    expect(erreurs[ERREURS_COLLECTE_RADAR['radar.crawl.discovery_unavailable']]).toBeTruthy();
    for (const cle of Object.values(ARRETS_COLLECTE_RADAR)) expect(arrets[cle], cle).toBeTruthy();
    for (const cle of Object.values(ERREURS_COLLECTE_RADAR)) expect(erreurs[cle], cle).toBeTruthy();
  });

  it('chaque refus de lecture de `RadarFetchRefused` est nommé', () => {
    const codes = constantes(lire('Services', 'Radar', 'Exceptions', 'RadarFetchRefused.php'));
    expect(codes).toContain('radar.fetch.not_xml');
    for (const code of codes) expect(MOTIFS_RADAR[code], code).toBeTruthy();
  });

  it('chaque arrêt de passage (`STOP_*`) est nommé', () => {
    const codes = [
      lire('Models', 'RadarCrawlRun.php'),
      lire('Services', 'Radar', 'Crawl', 'RadarCrawler.php'),
      lire('Services', 'Radar', 'Crawl', 'RadarCrawlScheduler.php'),
    ].flatMap((source) => constantes(source, 'STOP_'));
    expect(codes).toContain('radar.crawl.sitemap_invalid');
    for (const code of codes) expect(ARRETS_COLLECTE_RADAR[code], code).toBeTruthy();
  });

  it('le refus du réglage de la découverte est nommé', () => {
    const requete = lire('Http', 'Requests', 'Api', 'Admin', 'UpdateRadarCrawlSourceRequest.php');
    // Les codes des refus (`abort_code…`), pas les clés de configuration (`config('radar.crawl.…')`).
    const codes = [...requete.matchAll(/abort_code(?:_if)?\([^;]*?'(radar\.crawl\.[a-z_]+)'/g)].map((m) => m[1]);
    expect(codes).toContain('radar.crawl.discovery_unavailable');
    for (const code of codes) expect(ERREURS_COLLECTE_RADAR[code], code).toBeTruthy();
  });
});
