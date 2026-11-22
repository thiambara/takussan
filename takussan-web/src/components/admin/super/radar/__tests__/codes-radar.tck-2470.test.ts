import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { BLOCAGES_DEMANDE_RADAR, ECARTS_DEMANDE_RADAR, ISSUES_DEMANDE_RADAR } from '../codes-radar';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', '..');
const lire = (...chemin: string[]) => readFileSync(join(RACINE, 'takussan-api', 'app', ...chemin), 'utf8');

/** Les constantes `public const NOM = 'valeur';` d'une classe PHP dont le nom commence par `prefixe`. */
function constantes(source: string, prefixe: string): string[] {
  return [...source.matchAll(new RegExp(`const ${prefixe}[A-Z_]* = '([^']+)'`, 'g'))].map((m) => m[1]);
}

/**
 * TCK-2470 — chaque code que la demande peut afficher (blocage, issue d'un passage, opération écartée) a son libellé dans
 * chaque langue, et chaque code que l'API écrit est nommé, relu dans ses sources : un code neuf côté API rougit ici
 * avant de s'afficher par le repli.
 */
describe('codes des cibles de la demande', () => {
  it.each([['fr', fr], ['en', en], ['wo', wo]])('chaque blocage, issue et écart a son libellé en %s', (_langue, messages) => {
    const cibles = messages.superAdmin.pages.radar.targets;
    const blocages = cibles.demand.blocked as Record<string, string>;
    const issues = cibles.demand.outcomes as Record<string, string>;
    const ecarts = cibles.revisions.discardReasons as Record<string, string>;
    for (const cle of Object.values(BLOCAGES_DEMANDE_RADAR)) expect(blocages[cle], cle).toBeTruthy();
    for (const cle of [...Object.values(ISSUES_DEMANDE_RADAR), 'other']) expect(issues[cle], cle).toBeTruthy();
    for (const cle of [...Object.values(ECARTS_DEMANDE_RADAR), 'other']) expect(ecarts[cle], cle).toBeTruthy();
  });

  it('chaque issue et chaque blocage que l\'API écrit est nommé', () => {
    const curateur = lire('Services', 'Radar', 'Targets', 'RadarDemandCurator.php');
    const reglage = lire('Models', 'RadarDemandSetting.php');
    const issues = constantes(curateur, 'OUTCOME_');
    const blocages = constantes(reglage, 'BLOCKED_');
    expect(issues.length).toBeGreaterThanOrEqual(4);
    expect(blocages).toHaveLength(2);
    for (const code of [...issues, ...blocages]) expect(ISSUES_DEMANDE_RADAR[code], code).toBeTruthy();
    for (const code of blocages) expect(BLOCAGES_DEMANDE_RADAR[code], code).toBeTruthy();
  });

  it('chaque écart que le curateur consigne est nommé, critères et écritures des cibles compris', () => {
    const curateur = lire('Services', 'Radar', 'Targets', 'RadarDemandCurator.php');
    const sources = [
      curateur,
      lire('Services', 'Radar', 'Targets', 'RadarTargetCriteria.php'),
      lire('Services', 'Radar', 'Targets', 'RadarTargets.php'),
    ].join('\n');
    const ecarts = constantes(curateur, 'DISCARD_');
    // Les refus d'écriture des cibles (`abort_code`, `InvalidRadarTargetCriteria`), hors ceux de « défaire ».
    const codesCibles = [...new Set([...sources.matchAll(/(?:abort_code(?:_if)?\([^;]*?|InvalidRadarTargetCriteria\()'(radar\.targets\.[a-z_]+)'/g)].map((m) => m[1]))]
      .filter((code) => !code.startsWith('radar.targets.revision_'));
    expect(ecarts.length).toBeGreaterThanOrEqual(5);
    expect(codesCibles).toEqual(expect.arrayContaining(['radar.targets.invalid_criteria', 'radar.targets.duplicate']));
    for (const code of [...ecarts, ...codesCibles]) expect(ECARTS_DEMANDE_RADAR[code], code).toBeTruthy();
  });
});
