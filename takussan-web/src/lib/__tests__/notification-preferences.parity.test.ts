import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENEMENTS_DE_PREFERENCE, GROUPES_DE_PREFERENCES } from '../notification-preferences';

/**
 * Garde de PARITÉ front ↔ back sur les ÉVÉNEMENTS réglables (TCK-2636).
 *
 * L'écran des préférences portait sa propre liste, sous le commentaire « Must mirror
 * `PreferenceResolver::EVENTS` » : relevée le 2026-11-10, elle comptait 14 événements contre 20
 * côté API. Les six absents (renouvellement, résiliation anticipée, révision du loyer, relance de
 * facture, rappel de tâche, rappel d'état des lieux d'entrée) partaient avec les réglages par
 * défaut, et personne ne pouvait les couper. Un commentaire n'est pas une garde.
 *
 * Le test lit la constante PHP — `public const EVENTS = [ … ];`, pas `CRITICAL_EVENTS` ni
 * `MOBILE_*_EVENTS` —, commentaires retirés (ils portent des apostrophes), et la compare à la liste
 * DÉRIVÉE des groupes de l'écran : un événement écrit dans une liste mais rendu dans aucun groupe
 * ne peut pas la tromper.
 *
 * `web-ci.yml` se déclenche sur `PreferenceResolver.php` : une PR qui n'ajoute un événement QUE
 * côté API réveille ce test (les deux côtés qu'une garde compare doivent la déclencher).
 *
 * ⚠ CE QU'IL NE PROUVE PAS : qu'un libellé soit juste, ni qu'un événement soit dans le BON groupe.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const RESOLVER = join(ROOT, 'takussan-api', 'app', 'Services', 'Notifications', 'PreferenceResolver.php');

function evenementsDuBack(php: string): string[] {
  const sansCommentaires = php.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const bloc = /public const EVENTS = \[([\s\S]*?)\];/.exec(sansCommentaires);
  expect(bloc, `« public const EVENTS = [ … ]; » introuvable dans ${RESOLVER}`).not.toBeNull();
  const evenements = [...(bloc as RegExpExecArray)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  expect(evenements.length, 'aucun événement extrait — la garde n’aurait rien vérifié').toBeGreaterThan(0);
  return evenements;
}

describe('parité des événements ↔ PreferenceResolver::EVENTS', () => {
  const php = readFileSync(RESOLVER, 'utf8');

  it('l’écran règle exactement les événements que l’API connaît', () => {
    expect([...EVENEMENTS_DE_PREFERENCE].sort()).toEqual(evenementsDuBack(php).sort());
  });

  it('chaque événement est dans UN groupe, une seule fois', () => {
    const vus = GROUPES_DE_PREFERENCES.flatMap((g) => g.evenements);
    expect(new Set(vus).size).toBe(vus.length);
  });

  it('les six événements oubliés ont leur place (AC3)', () => {
    const groupeDe = (e: string) => GROUPES_DE_PREFERENCES.find((g) => (g.evenements as readonly string[]).includes(e))?.cle;
    for (const e of ['lease_renewed', 'lease_early_termination', 'lease_rent_reviewed', 'invoice_reminder_sent', 'tenant_inventory_reminder']) {
      expect(groupeDe(e), e).toBe('leases');
    }
    expect(groupeDe('task_due_reminder')).toBe('alerts');
  });

  it('l’extraction ne prend ni CRITICAL_EVENTS ni les listes mobiles', () => {
    const extraits = evenementsDuBack(php);
    expect(extraits).not.toContain('password_reset');
    expect(extraits).not.toContain('kyc_status_changed');
  });
});
