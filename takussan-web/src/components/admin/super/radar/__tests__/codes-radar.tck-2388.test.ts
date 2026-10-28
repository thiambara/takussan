import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import {
  RADAR_OUTREACH_MAX_LISTINGS,
  RADAR_OUTREACH_OUTCOMES,
  RADAR_OUTREACH_STATUSES,
  RADAR_SALUTATION_MAX,
  RADAR_SUMMARY_MAX,
  RADAR_VERDICT_CLASSIFICATIONS,
} from '@/types/radar';
import { DISCORDANCES_RADAR, ERREURS_ANNONCEUR_RADAR, MOTIFS_VERIFICATION_RADAR } from '../codes-radar';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', '..');
const lire = (...chemin: string[]) => readFileSync(join(RACINE, ...chemin), 'utf8');
const casesDe = (source: string) => [...source.matchAll(/case \w+ = '([^']+)'/g)].map((m) => m[1]).sort();

/** TCK-2388 — les codes de la fiche annonceur et les énumérations du message : un libellé par langue, et l'API d'accord. */
describe('codes de la fiche annonceur du Radar', () => {
  it.each([['fr', fr], ['en', en], ['wo', wo]])('chaque code d\'erreur, statut et issue a son libellé en %s', (_langue, messages) => {
    const fiche = messages.superAdmin.pages.radar.advertiser;
    const erreurs = fiche.errors as Record<string, string>;
    for (const cle of Object.values(ERREURS_ANNONCEUR_RADAR)) expect(erreurs[cle], cle).toBeTruthy();

    const statuts = fiche.history.statuses as Record<string, string>;
    for (const statut of RADAR_OUTREACH_STATUSES) expect(statuts[statut], statut).toBeTruthy();
    const issues = fiche.history.outcomes as Record<string, string>;
    for (const issue of RADAR_OUTREACH_OUTCOMES) expect(issues[issue], issue).toBeTruthy();
  });

  it('chaque code nommé est un code que l\'API émet (lang/fr/errors.php)', () => {
    const erreursApi = lire('takussan-api', 'lang', 'fr', 'errors.php');
    // Les codes sont rangés en tableaux imbriqués : chaque segment se cherche après le précédent.
    const declare = (code: string) => {
      let position = 0;
      for (const segment of code.split('.')) {
        position = erreursApi.indexOf(`'${segment}' =>`, position);
        if (position === -1) return false;
      }
      return true;
    };
    for (const code of Object.keys(ERREURS_ANNONCEUR_RADAR)) expect(declare(code), code).toBe(true);
    // Le code que la consigne de la tâche supposait n'existe pas : « pas la prise » se dit autrement.
    expect(declare('radar.advertiser.not_claimed')).toBe(false);
  });

  it('les issues sont celles de RadarOutreachOutcome, les classifications celles du verdict', () => {
    expect([...RADAR_OUTREACH_OUTCOMES].sort()).toEqual(casesDe(lire('takussan-api', 'app', 'Models', 'Enums', 'RadarOutreachOutcome.php')));
    const agent = lire('takussan-api', 'app', 'Ai', 'Agents', 'RadarConsentVerification.php');
    const api = /CLASSIFICATIONS = \[([^\]]+)\]/.exec(agent)?.[1].match(/'([^']+)'/g)?.map((m) => m.slice(1, -1)).sort();
    expect([...RADAR_VERDICT_CLASSIFICATIONS].sort()).toEqual(api);
  });

  it('les plafonds du message sont ceux de l\'API', () => {
    const composeur = lire('takussan-api', 'app', 'Services', 'Radar', 'ConsentMessageComposer.php');
    expect(composeur).toContain(`SALUTATION_MAX = ${RADAR_SALUTATION_MAX};`);
    expect(composeur).toContain(`SUMMARY_MAX = ${RADAR_SUMMARY_MAX};`);
    expect(lire('takussan-api', 'app', 'Http', 'Requests', 'Api', 'Admin', 'StoreRadarOutreachRequest.php'))
      .toContain(`MAX_LISTINGS = ${RADAR_OUTREACH_MAX_LISTINGS};`);
  });

  it.each([['fr', fr], ['en', en], ['wo', wo]])('chaque motif de vérification, écart du verdict et issue du dialogue a son libellé en %s', (_langue, messages) => {
    const fiche = messages.superAdmin.pages.radar.advertiser;
    const motifs = fiche.reply.reasons as Record<string, string>;
    for (const cle of Object.values(MOTIFS_VERIFICATION_RADAR)) expect(motifs[cle], cle).toBeTruthy();
    const ecarts = fiche.outcome.discordances as Record<string, string>;
    for (const cle of Object.values(DISCORDANCES_RADAR)) expect(ecarts[cle], cle).toBeTruthy();
    const options = fiche.outcome.options as Record<string, string>;
    const conseils = fiche.outcome.hints as Record<string, string>;
    for (const issue of RADAR_OUTREACH_OUTCOMES) {
      expect(options[issue], issue).toBeTruthy();
      expect(conseils[issue], issue).toBeTruthy();
    }
  });

  it('les motifs de vérification sont ceux que le job écrit, les écarts ceux que le verdict calcule', () => {
    const job = lire('takussan-api', 'app', 'Jobs', 'Radar', 'VerifyRadarConsentReply.php');
    const emis = [...job.matchAll(/const REASON_\w+ = '(radar\.verification\.[^']+)'/g)].map((m) => m[1]).sort();
    expect(Object.keys(MOTIFS_VERIFICATION_RADAR).sort()).toEqual(emis);

    const verdict = lire('takussan-api', 'app', 'Services', 'Radar', 'RadarConsentVerdict.php');
    const api = /DISCORDANCES = \[([^\]]+)\]/.exec(verdict)?.[1].match(/'([^']+)'/g)?.map((m) => m.slice(1, -1)).sort();
    expect(Object.keys(DISCORDANCES_RADAR).sort()).toEqual(api);
  });
});
