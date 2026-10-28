import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { ERREURS_SAISIE_RADAR, MOTIFS_ATTENTE_COURTE, MOTIFS_RADAR, suggereTexteOuCaptures } from '../codes-radar';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', '..');

/** TCK-2386 — tout motif et tout code de saisie affiché a son libellé dans chaque langue. */
describe('codes du Radar', () => {
  it.each([['fr', fr], ['en', en], ['wo', wo]])('chaque motif et chaque code de saisie a son libellé en %s', (_langue, messages) => {
    const radar = messages.superAdmin.pages.radar;
    const motifs = radar.reasons as Record<string, string>;
    const erreurs = radar.intake.errors as Record<string, string>;
    for (const cle of Object.values(MOTIFS_RADAR)) expect(motifs[cle], cle).toBeTruthy();
    for (const cle of Object.values(ERREURS_SAISIE_RADAR)) expect(erreurs[cle], cle).toBeTruthy();
  });

  it('les codes que le job écrit sont tous nommés (tâche 6 et ses correctifs)', () => {
    for (const code of [
      'radar.fetch.deferred', 'radar.fetch.invalid_url', 'radar.fetch.airbnb', 'radar.fetch.private_address',
      'radar.fetch.robots', 'radar.fetch.robots_unavailable', 'radar.fetch.too_many_redirects', 'radar.fetch.too_large',
      'radar.fetch.not_html', 'radar.fetch.http_error', 'radar.fetch.timeout', 'radar.fetch.unresolvable',
      'ai.budget', 'ai.kill_switch', 'ai.forbidden', 'ai.data_class', 'ai.sensitive_data',
      'ai.role_unassigned', 'ai.providers_unavailable', 'ai.provider_auth', 'ai.request_rejected',
      'ai.provider_rate_limited', 'ai.provider_credits', 'ai.provider_unavailable', 'ai.provider_timeout',
      'ai.response_invalid', 'ai.response_truncated', 'ai.response_filtered', 'ai.unexpected',
      'radar.extraction.invalid_output', 'radar.extraction.empty_source', 'radar.extraction.timeout', 'radar.extraction.error',
    ]) {
      expect(MOTIFS_RADAR[code], code).toBeTruthy();
    }
    for (const code of ['radar.url.airbnb', 'radar.url.invalid', 'radar.captures.unreadable', 'radar.captures.too_large']) {
      expect(ERREURS_SAISIE_RADAR[code], code).toBeTruthy();
    }
  });

  it('les attentes courtes sont la lecture différée et les motifs à une seule nouvelle tentative du job', () => {
    const job = readFileSync(join(RACINE, 'takussan-api', 'app', 'Jobs', 'Radar', 'ExtractRadarListing.php'), 'utf8');
    const constante = (nom: string) => new RegExp(`const ${nom} = '([^']+)'`).exec(job)?.[1];
    const liste = /const RETRY_ONCE_REASONS = \[([^\]]*)\]/.exec(job)?.[1] ?? '';
    const uneTentative = liste.split(',').map((e) => e.trim()).filter(Boolean)
      .map((e) => (e.startsWith('self::') ? constante(e.slice('self::'.length)) : e.replace(/^'|'$/g, '')));

    expect(uneTentative.length).toBeGreaterThan(0);
    expect([...MOTIFS_ATTENTE_COURTE].sort()).toEqual([constante('REASON_FETCH_DEFERRED'), ...uneTentative].sort());
    // Garée longtemps : pas une attente courte.
    expect(MOTIFS_ATTENTE_COURTE.has('ai.budget')).toBe(false);
    expect(MOTIFS_ATTENTE_COURTE.has('ai.kill_switch')).toBe(false);
  });

  it('une URL illisible renvoie au texte ou aux captures, sauf Airbnb et une lecture différée', () => {
    expect(suggereTexteOuCaptures('radar.fetch.http_error')).toBe(true);
    expect(suggereTexteOuCaptures('radar.fetch.robots')).toBe(true);
    expect(suggereTexteOuCaptures('radar.fetch.airbnb')).toBe(false);
    expect(suggereTexteOuCaptures('radar.fetch.deferred')).toBe(false);
    expect(suggereTexteOuCaptures('ai.budget')).toBe(false);
    expect(suggereTexteOuCaptures(null)).toBe(false);
  });
});
