import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_ROLES } from '../user';

/**
 * Garde de PARITÉ front ↔ back sur les RÔLES (TCK-494).
 *
 * **Il y avait deux axes et un seul était gardé.** `profile-types.parity.test.ts`
 * (TCK-329) tient les PROFILS — `ActiveProfileResolver::TYPE_MAP` ↔
 * `PROFILE_TYPES`. Les RÔLES, eux, n'avaient rien : `HasProfiles::profileTypes()`
 * d'un côté, l'union `UserRole` de l'autre, et aucun test entre les deux.
 *
 * C'est pourtant l'axe où la dérive a réellement eu lieu, et sur ses trois
 * valeurs à la fois, relevé le 2026-08-30 :
 *
 *   - `broker` était émis par le back et ABSENT de l'union — écart soldé le
 *     lendemain, par le RETRAIT du rôle et non par son ajout au front
 *     (TCK-495 / ADR-0027) ;
 *   - `customer` et `tenant` étaient déclarés dans l'union et JAMAIS émis, si
 *     bien que `isCustomer()` et `isTenant()` rendaient `false` en toutes
 *     circonstances — et que quatre surfaces front bâties dessus (menu latéral,
 *     widget de check-list locataire, onboarding customer) ne se montaient plus.
 *
 * Aucune n'a rougi pendant trois mois et demi : *une condition qui ne s'allume
 * jamais n'échoue pas, elle se tait.* C'est exactement ce qu'un test de parité
 * attrape et qu'aucun test de comportement ne peut attraper.
 *
 * ⚠ CE QU'IL NE PROUVE PAS : que les prédicats de `lib/roles.ts` soient justes,
 * ni que les libellés soient bons. Il vérifie que les deux ENSEMBLES coïncident,
 * rien de plus.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const TRAIT = join(ROOT, 'takussan-api', 'app', 'Models', 'Concerns', 'HasProfiles.php');

/**
 * Extrait les rôles poussés par `profileTypes()`.
 *
 * ⚠ L'extraction est en DEUX temps, et le premier n'est pas décoratif : on
 * isole d'abord le CORPS de la méthode, on ne cherche les `push()` qu'ensuite.
 * Chercher `$types->push('…')` sur le fichier entier reviendrait à faire
 * confiance au reste du fichier pour ne jamais contenir cette forme — dans un
 * commentaire, dans une méthode voisine — et la garde lit le code, pas ce qui
 * l'entoure.
 *
 * Chaque étape qui peut échouer le DIT. Un ensemble vide n'est pas une parité
 * tenue : c'est la forme de vacuité qui ressemble le plus à un succès.
 */
function rolesDuBack(): string[] {
  const php = readFileSync(TRAIT, 'utf8');

  const debut = php.indexOf('public function profileTypes(): Collection');
  expect(debut, `profileTypes() introuvable dans ${TRAIT}`).toBeGreaterThan(-1);

  const corps = php.slice(debut, php.indexOf('return $types->values();', debut));
  expect(
    corps.length,
    'le corps de profileTypes() n’a pas pu être borné — la forme de la méthode a changé',
  ).toBeGreaterThan(0);

  const roles = [...corps.matchAll(/\$types->push\('([a-z_]+)'\)/g)].map((m) => m[1]);
  expect(
    roles.length,
    'aucun rôle extrait de profileTypes() — la garde n’aurait rien vérifié',
  ).toBeGreaterThan(0);

  return roles;
}

describe('parité UserRole ↔ HasProfiles::profileTypes()', () => {
  it('le front déclare exactement les rôles que le back émet', () => {
    expect([...USER_ROLES].sort()).toEqual(rolesDuBack().sort());
  });

  /**
   * TCK-495 — ce cas affirmait l'inverse : *« émet broker — l'écart où le back
   * en disait plus que le front »*. Il n'a pas été supprimé, il a été RETOURNÉ,
   * parce que l'écart qu'il nommait a été soldé par une décision et non par un
   * alignement de listes (ADR-0027).
   *
   * ⚠ **La garde de parité aurait été verte dans les deux sens** — back et
   * front d'accord sur `broker` présent, ou d'accord sur `broker` absent. C'est
   * la limite annoncée d'un test de parité : *il tient l'accord entre deux
   * listes, jamais la justesse de ce qu'elles contiennent.* Ce qui a tranché,
   * c'est `AppSidebar.audience.test.tsx` — un profil commutable qui n'ouvre
   * aucun écran —, et le cas ci-dessous en garde la trace ici, là où quelqu'un
   * qui voudrait « remettre broker pour faire propre » viendra lire.
   */
  it('n’émet plus broker — le rôle a été retiré, pas oublié', () => {
    expect(rolesDuBack()).not.toContain('broker');
    expect(USER_ROLES).not.toContain('broker');
  });

  it('émet customer et tenant — les deux écarts où le front en disait plus que le back', () => {
    // Déclarés côté front depuis toujours, jamais émis entre le cutover
    // TCK-278 et TCK-492. Ce cas-là est la raison d'être de la garde.
    const back = rolesDuBack();
    expect(back).toContain('customer');
    expect(back).toContain('tenant');
  });

  it('échoue bruyamment si la source PHP est introuvable', () => {
    // La garde repose sur un chemin en dur vers l'autre moitié du monorepo.
    // Le jour où ce fichier bouge, elle doit CASSER — pas verdir sur rien.
    expect(() => readFileSync(TRAIT, 'utf8')).not.toThrow();
  });
});
