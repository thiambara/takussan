import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileBadge, profileShortLabel, profileTypeLabel } from '../ProfileBadge';
import { PROFILE_TYPES, type Profile, type ProfileType } from '@/types/profile';
import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';

/**
 * Traducteur du sous-arbre `profile.types`, alimenté par le VRAI `fr.json` —
 * même source que `withIntl`. Les libellés attendus n'ont pas bougé d'un
 * caractère : TCK-292 déplace le texte, il ne le reformule pas.
 */
const t = (cle: string): string => (fr.profile.types as Record<string, string>)[cle];

function makeProfile(type: ProfileType, agency: Profile['agency'] = undefined): Profile {
  return {
    id: `${type}:1`,
    type,
    numeric_id: 1,
    agency_id: agency?.id ?? null,
    agency,
    status: 'active',
    created_at: '2026-08-20T00:00:00Z',
  };
}

const TERANGA = { id: 7, name: 'Agence Teranga', slug: 'teranga' };

describe('profileTypeLabel', () => {
  // Un cas PAR type de profil, énuméré depuis PROFILE_TYPES : ajouter un type au
  // front sans son libellé fait rougir ce test sans qu'on ait à l'éditer.
  it.each(PROFILE_TYPES)('rend un libellé lisible pour %s', (type) => {
    const label = profileTypeLabel(type, t);
    expect(label).toBeTruthy();
    expect(label).not.toContain('undefined');
  });

  // AC5 — repli : une valeur de fil inconnue du front ne doit JAMAIS produire
  // `undefined`. Le pire cas est le jeton brut, visible et diagnosticable.
  it('replie sur la valeur brute pour un type inconnu du front', () => {
    const inconnu = 'notaire' as ProfileType;
    expect(profileTypeLabel(inconnu, t)).toBe('notaire');
    expect(profileTypeLabel(inconnu, t)).not.toContain('undefined');
  });
});

describe('profileShortLabel', () => {
  it.each(PROFILE_TYPES)('rend « <libellé> · <agence> » pour %s avec agence', (type) => {
    const label = profileShortLabel(makeProfile(type, TERANGA), t);
    expect(label).not.toContain('undefined');
    expect(label).toBe(`${profileTypeLabel(type, t)} · Agence Teranga`);
  });

  // AC1 — le bug observé le 2026-08-17 : « undefined · Agence Teranga ».
  it('AC1 — agency_admin avec agence rend le libellé, jamais undefined', () => {
    expect(profileShortLabel(makeProfile('agency_admin', TERANGA), t)).toBe('Administrateur · Agence Teranga');
  });

  // AC2 — sans agence : le seul libellé de type, pas de séparateur orphelin.
  it.each(PROFILE_TYPES)('AC2 — rend le seul libellé, sans séparateur orphelin, pour %s sans agence', (type) => {
    const label = profileShortLabel(makeProfile(type), t);
    expect(label).toBe(profileTypeLabel(type, t));
    expect(label).not.toContain('·');
    expect(label).not.toContain('undefined');
  });
});

/**
 * ⚠ TCK-381 — ces trois cas cherchaient `bg-<famille>-<échelle>`, c'est-à-dire EXACTEMENT le
 * vocabulaire que ce ticket éteint : ils rougissaient sur le portage sur jetons, pour du code
 * juste. La forme attendue est désormais un jeton de SÉRIE (`--chart-1..5`), et l'exigence n'a pas
 * été affaiblie au passage — elle a été resserrée : le motif pinçait n'importe quelle famille
 * Tailwind, il pince maintenant les cinq jetons du DS et rien d'autre.
 */
const CLASSE_DE_SERIE = /\bbg-chart-[1-5]\/\d{1,3}\b/;

describe('<ProfileBadge>', () => {
  // AC4 — la pastille doit porter une classe de couleur pour CHAQUE type.
  it.each(PROFILE_TYPES)('rend une classe de couleur pour %s (variante dot)', (type) => {
    const { container } = render(withIntl(<ProfileBadge profile={makeProfile(type)} variant="dot" />));
    const dot = container.querySelector('span');
    expect(dot).not.toBeNull();
    expect(dot!.className).toMatch(CLASSE_DE_SERIE);
  });

  // ⚠ La garde ci-dessus matche AUSSI le REPLI : elle ne distingue donc pas une couleur DÉCLARÉE
  // d'un repli. Mesuré par ablation le 2026-08-20 (vérification adverse) — retirer la seule entrée
  // `agency_admin` de `TYPE_COLOR` laissait les 27 cas VERTS, `tsc` étant le seul à rougir. Le cas
  // suivant ferme l'écart côté test, pour que la preuve d'AC4 ne repose pas sur la compilation.
  //
  // TCK-381 : le repli n'est plus une classe d'échelle brute, il est `bg-muted` — et comme il ne
  // matche PLUS `CLASSE_DE_SERIE`, l'ablation est désormais attrapée deux fois plutôt qu'une.
  it('n’utilise le repli de couleur pour AUCUN type déclaré', () => {
    for (const type of PROFILE_TYPES) {
      const { container } = render(withIntl(<ProfileBadge profile={makeProfile(type)} variant="dot" />));
      expect(container.querySelector('span')!.className, `type ${type}`).not.toContain('bg-muted');
    }
  });

  it('donne une couleur DISTINCTE à chacun des types déclarés', () => {
    const couleurs = PROFILE_TYPES.map((type) => {
      const { container } = render(withIntl(<ProfileBadge profile={makeProfile(type)} variant="dot" />));
      return container.querySelector('span')!.className;
    });
    expect(new Set(couleurs).size).toBe(PROFILE_TYPES.length);
  });

  it.each(PROFILE_TYPES)('rend le libellé et une classe de couleur pour %s (variante pill)', (type) => {
    render(withIntl(<ProfileBadge profile={makeProfile(type)} />));
    const pill = screen.getByText(profileTypeLabel(type, t));
    expect(pill.className).toMatch(CLASSE_DE_SERIE);
  });
});
