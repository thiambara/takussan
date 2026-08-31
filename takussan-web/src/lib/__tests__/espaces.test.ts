import { describe, expect, it } from 'vitest';
import { espacesAProposer, slugAAfficher } from '@/lib/espaces';
import type { AgencyKind, Profile, ProfileType } from '@/types/profile';

/**
 * TCK-497 — le sélecteur cesse de proposer deux entrées indiscernables.
 *
 * ⚠ Ces tests portent sur ce qu'on PROPOSE, jamais sur ce que l'API liste :
 * `GET /api/me/profiles` continue de rendre les deux profils (AC5), et
 * `ProfilesEndpointTest` le garde côté back. Confondre les deux ferait de ce
 * ticket une suppression de profil, ce que sa première contrainte interdit.
 */
function profil(
  type: ProfileType,
  agencyId: number,
  kind: AgencyKind,
  nom = 'Espace de Awa Diop',
): Profile {
  return {
    id: `${type}:${agencyId}${type.length}`,
    type,
    numeric_id: agencyId,
    agency_id: agencyId,
    agency: { id: agencyId, name: nom, slug: 'espace-de-awa-diop-3', kind },
    status: 'active',
    created_at: null,
  };
}

describe('espacesAProposer — une agence personnelle est UN espace', () => {
  it('fusionne les deux profils que l’assistant hôte crée', () => {
    // AC1 — c'est exactement la capture du signalement : « Administrateur » et
    // « Propriétaire » sur le même nom et le même slug.
    const admin = profil('agency_admin', 7, 'individual');
    const owner = profil('owner', 7, 'individual');

    const proposes = espacesAProposer([admin, owner], admin.id);

    expect(proposes).toHaveLength(1);
    expect(proposes[0].id).toBe(admin.id);
  });

  it('retient le profil ACTIF comme représentant — fusionner ne fait basculer personne', () => {
    const admin = profil('agency_admin', 7, 'individual');
    const owner = profil('owner', 7, 'individual');

    // Quelqu'un qui se trouve sur son espace propriétaire y reste : le
    // représentant n'est pas choisi dans l'absolu, il est choisi là où on est.
    const proposes = espacesAProposer([admin, owner], owner.id);

    expect(proposes.map((p) => p.id)).toEqual([owner.id]);
  });

  it('à défaut d’actif, retient agency_admin — celui que TCK-271 épingle', () => {
    const owner = profil('owner', 7, 'individual');
    const admin = profil('agency_admin', 7, 'individual');

    // Ordre d'arrivée inversé volontairement : le choix suit `PROFILE_TYPES`,
    // pas la position dans la réponse.
    expect(espacesAProposer([owner, admin], null).map((p) => p.type)).toEqual(['agency_admin']);
  });

  it('laisse INTACTS les deux espaces d’une agence standard', () => {
    // AC4 — un administrateur d'agence qui est aussi propriétaire d'un bien
    // chez elle a deux espaces qui ont un sens. La règle se lit dans `kind`,
    // jamais dans une heuristique de nom.
    const admin = profil('agency_admin', 9, 'standard', 'Agence Teranga');
    const owner = profil('owner', 9, 'standard', 'Agence Teranga');

    expect(espacesAProposer([admin, owner], admin.id)).toHaveLength(2);
  });

  it('ne fusionne pas des agences individuelles DIFFÉRENTES', () => {
    const a = profil('agency_admin', 7, 'individual', 'Espace de Awa');
    const b = profil('agency_admin', 8, 'individual', 'Espace de Modou');

    expect(espacesAProposer([a, b], null)).toHaveLength(2);
  });

  it('un compte multi-agences ne perd rien', () => {
    // AC3 — trois agences, cinq profils : seule la paire de l'agence
    // personnelle se réduit.
    const perso1 = profil('agency_admin', 7, 'individual');
    const perso2 = profil('owner', 7, 'individual');
    const pro1 = profil('agent', 9, 'standard', 'Agence Teranga');
    const pro2 = profil('owner', 9, 'standard', 'Agence Teranga');
    const autre = profil('agent', 11, 'standard', 'Agence Baobab');

    const proposes = espacesAProposer([perso1, perso2, pro1, pro2, autre], perso1.id);

    expect(proposes.map((p) => p.agency_id)).toEqual([7, 9, 9, 11]);
  });

  it('laisse passer un profil sans agence — prestataire', () => {
    // TCK-495 — le cas était écrit sur un courtier, qui n'est plus un
    // `ProfileType` (ADR-0027). Le prestataire porte la même propriété et la
    // porte toujours : `agency_id` nul, donc rien à fusionner.
    const prestataire: Profile = {
      id: 'service_provider:1',
      type: 'service_provider',
      numeric_id: 1,
      agency_id: null,
      status: null,
      created_at: null,
    };

    expect(espacesAProposer([prestataire], null)).toEqual([prestataire]);
  });

  it('n’invente rien quand `kind` est absent de la charge utile', () => {
    // Le sparse fieldset de `lib/profiles.ts` demande `kind`, mais un appelant
    // futur pourrait ne pas le faire. Sans la nature de l'agence, on ne fusionne
    // PAS : montrer une ligne de trop est réparable, en escamoter une ne l'est
    // pas.
    const sansKind: Profile = {
      ...profil('agency_admin', 7, 'individual'),
      agency: { id: 7, name: 'Espace de Awa Diop', slug: 'espace-de-awa-diop-3' },
    };
    const autre: Profile = {
      ...profil('owner', 7, 'individual'),
      agency: { id: 7, name: 'Espace de Awa Diop', slug: 'espace-de-awa-diop-3' },
    };

    expect(espacesAProposer([sansKind, autre], null)).toHaveLength(2);
  });
});

describe('slugAAfficher — un rang de collision ne se montre pas', () => {
  it('tait le slug d’une agence personnelle', () => {
    // AC2 — `uniqueSlug()` incrémente sur collision GLOBALE : le `-3` que voit
    // l'utilisateur compte des homonymes, pas quelque chose qui le concerne.
    expect(slugAAfficher(profil('owner', 7, 'individual'))).toBeNull();
  });

  it('garde celui d’une agence professionnelle — c’est son URL publique', () => {
    expect(slugAAfficher(profil('agent', 9, 'standard'))).toBe('espace-de-awa-diop-3');
  });
});
