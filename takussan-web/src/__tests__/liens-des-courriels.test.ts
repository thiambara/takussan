/**
 * P97.05 (TCK-1185) — chaque bouton de courriel de l'API mène à une page du front.
 *
 * `takussan-api/tests/Feature/Notifications/MailActionLinksTest.php` rend chaque `toMail()` et exige
 * que le lien suive le chemin que déclare sa constante `CHEMINS` ; il ne lit pas le front, dont
 * l'attestation de l'API (ADR-0063) ne porte pas la clé. Ce test-ci, dont la clé couvre toute l'API,
 * résout chaque chemin déclaré dans `src/app` — même résolution que
 * `scripts/check-notification-target-paths.mjs` pour `NotificationTarget::PATHS` : un groupe `(x)`
 * est transparent, `{id}` tombe sur un segment dynamique `[x]`, un catch-all `[...x]` ne compte pas,
 * et le dossier atteint porte un `page.tsx`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = resolve(__dirname, '..', 'app');
const SOURCE = resolve(__dirname, '..', '..', '..', 'takussan-api', 'tests', 'Feature', 'Notifications', 'MailActionLinksTest.php');

function lireChemins(php: string): { classe: string; chemin: string }[] {
  const bloc = php.match(/public const CHEMINS = \[([\s\S]*?)\n\s*\];/);
  if (!bloc) throw new Error('CHEMINS introuvable dans MailActionLinksTest.php');
  return [...bloc[1].matchAll(/^\s*'([^']+)'\s*=>\s*'([^']+)'/gm)].map((m) => ({ classe: m[1], chemin: m[2] }));
}

const sousDossiers = (dir: string) => readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());

function resoudre(dir: string, segments: string[]): string[] {
  const viaGroupes = sousDossiers(dir)
    .filter((n) => n.startsWith('(') && n.endsWith(')'))
    .flatMap((n) => resoudre(join(dir, n), segments));
  if (segments.length === 0) return [dir, ...viaGroupes];
  const [tete, ...reste] = segments;
  const suivants = sousDossiers(dir).filter((n) => (tete === '{id}' ? /^\[[^.\]][^\]]*\]$/.test(n) : n === tete));
  return [...suivants.flatMap((n) => resoudre(join(dir, n), reste)), ...viaGroupes];
}

function pageDe(chemin: string): string | null {
  const segments = chemin.split('?')[0].split('/').filter(Boolean);
  return resoudre(APP, segments).map((d) => join(d, 'page.tsx')).find((f) => existsSync(f)) ?? null;
}

describe('les boutons des courriels de l’API mènent à une page du front — P97.05', () => {
  const chemins = lireChemins(readFileSync(SOURCE, 'utf8'));

  it('lit les chemins déclarés — un balayage vide ne prouverait rien', () => {
    expect(chemins.length).toBeGreaterThanOrEqual(15);
  });

  it('chaque chemin déclaré résout une page', () => {
    const morts = chemins.filter(({ chemin }) => pageDe(chemin) === null).map(({ classe, chemin }) => `${classe} → ${chemin}`);
    expect(morts).toEqual([]);
  });

  it('la résolution refuse un chemin mort et le catch-all', () => {
    expect(pageDe('/app/overview-p97')).toBeNull();
    expect(pageDe('/app/{id}')).toBeNull();
    expect(pageDe('/super-admin/agency-upgrade-requests/{id}')).not.toBeNull();
    expect(pageDe('/{id}/notifications/unsubscribe')).not.toBeNull();
  });
});
