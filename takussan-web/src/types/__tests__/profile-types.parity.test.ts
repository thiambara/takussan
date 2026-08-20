import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_TYPES } from '../profile';

/**
 * Garde de PARITÉ front ↔ back sur les types de profil (TCK-329, AC5).
 *
 * La source de vérité est le BACK : `ActiveProfileResolver::TYPE_MAP` porte les
 * alias de fil, et c'est `ProfileResource` qui les émet dans `type`.
 * `PROFILE_TYPES` côté front est une recopie manuelle de cette liste — et une
 * liste écrite à la main est juste le jour où on l'écrit. Elle avait cessé de
 * l'être : `agency_admin` manquait, `Record<ProfileType, …>` restait exhaustif
 * aux yeux de `tsc` (l'union était fausse, pas la table), et la barre supérieure
 * affichait « undefined · <agence> ».
 *
 * Ce test lit le FICHIER PHP, il ne déduit rien d'un commentaire ni d'un docblock.
 * Il vit dans la suite vitest plutôt que dans `scripts/check-*.mjs` pour une
 * raison mesurable : `web-ci.yml` la rejoue déjà à chaque PR, sans qu'il faille
 * ajouter une étape ailleurs.
 *
 * ⚠ CE QU'IL NE PROUVE PAS : que chaque alias soit correctement LIBELLÉ. Il
 * vérifie que les deux ensembles coïncident, rien de plus. La justesse des
 * libellés est portée par `ProfileBadge.test.tsx`.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const RESOLVER = join(
  ROOT,
  'takussan-api',
  'app',
  'Services',
  'Profiles',
  'ActiveProfileResolver.php',
);

function aliasDuBack(): string[] {
  const php = readFileSync(RESOLVER, 'utf8');
  const bloc = /public const TYPE_MAP\s*=\s*\[([\s\S]*?)\];/.exec(php);
  // Une garde qui ne trouve pas sa source doit le DIRE, pas passer au vert sur
  // un ensemble vide — c'est la forme de vacuité qui ressemble le plus à un succès.
  expect(bloc, `TYPE_MAP introuvable dans ${RESOLVER}`).not.toBeNull();
  const alias = [...bloc![1].matchAll(/'([a-z_]+)'\s*=>/g)].map((m) => m[1]);
  expect(alias.length, 'aucun alias extrait de TYPE_MAP — la garde n’aurait rien vérifié').toBeGreaterThan(0);
  return alias;
}

describe('parité ProfileType ↔ ActiveProfileResolver::TYPE_MAP', () => {
  it('le front déclare exactement les alias que le back émet', () => {
    const back = aliasDuBack().sort();
    const front = [...PROFILE_TYPES].sort();
    expect(front).toEqual(back);
  });

  it('n’oublie pas agency_admin — l’occurrence qui a motivé la garde', () => {
    expect(aliasDuBack()).toContain('agency_admin');
    expect(PROFILE_TYPES).toContain('agency_admin');
  });
});
