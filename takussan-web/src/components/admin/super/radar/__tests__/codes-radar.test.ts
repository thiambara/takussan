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

  // Les motifs `ai.*` servent l'extraction d'une annonce ET la rédaction d'un message d'annonceur : ils ne parlent d'aucun des deux.
  it.each([['fr', fr, /extraction|annonce/i], ['en', en, /extraction|listing/i]])(
    'aucun libellé `ai.*` ne nomme l\'extraction ni l\'annonce en %s',
    (_langue, messages, motInterdit) => {
      const motifs = messages.superAdmin.pages.radar.reasons as Record<string, string>;
      const cles = Object.entries(MOTIFS_RADAR).filter(([code]) => code.startsWith('ai.')).map(([, cle]) => cle);
      expect(cles.length).toBeGreaterThan(10);
      for (const cle of cles) expect(motifs[cle], cle).not.toMatch(motInterdit);
    },
  );

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

  // TCK-2413 (vérification adverse M5) — chaque code que `PublishClaimedRadarListings` peut écrire en `stage_reason` a son
  // libellé : les siens, et tout refus de `RadarPublisher::publishClaimed()` / `publishLocked()`, relus dans les sources.
  it('chaque code que la publication de la réclamation peut laisser est nommé', () => {
    const lire = (...chemin: string[]) => readFileSync(join(RACINE, 'takussan-api', 'app', ...chemin), 'utf8');
    const sources: Record<string, string> = {
      RadarPublisher: lire('Services', 'Radar', 'RadarPublisher.php'),
      AdvertiserProvisioner: lire('Services', 'Radar', 'AdvertiserProvisioner.php'),
      PublishClaimedRadarListings: lire('Jobs', 'Radar', 'PublishClaimedRadarListings.php'),
    };
    const constante = (classe: string, nom: string) => new RegExp(`const ${nom} = '([^']+)'`).exec(sources[classe])?.[1];
    const resoudre = (classe: string, expr: string) => {
      const ref = /^(self|static|(\w+))::(\w+)$/.exec(expr.trim());
      return ref ? constante(ref[2] ?? classe, ref[3]) : expr.trim().replace(/^'|'$/g, '');
    };

    const publisher = sources.RadarPublisher;
    const tranche = publisher.slice(publisher.indexOf('function publishClaimed('), publisher.indexOf('function publishedMessage('));
    const refus = [...tranche.matchAll(/abort_code(?:_if|_unless)?\([\s\S]*?,\s*\d{3},\s*([^,)\n]+)/g)]
      .map((m) => resoudre('RadarPublisher', m[1]));
    const job = sources.PublishClaimedRadarListings;
    // Les codes écrits par le job lui-même : chaque chaîne et chaque constante passées à `leave()` (le refus, `$e->errorCode`,
    // est l'un de ceux de la tranche ci-dessus).
    const laisses = [...job.matchAll(/->leave\(([^;]*)\);/g)]
      .flatMap((m) => [...m[1].matchAll(/'([a-z_]+\.[a-z_.]+)'|\b(\w+::[A-Z_]+)\b/g)].map((t) => t[1] ?? resoudre('PublishClaimedRadarListings', t[2])));

    expect(refus.length).toBeGreaterThan(8);
    expect(laisses.length).toBeGreaterThan(3);
    for (const code of [...refus, ...laisses, 'quota.listings_exceeded']) {
      expect(code, 'un code non résolu').toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
      expect(MOTIFS_RADAR[code as string], code).toBeTruthy();
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
