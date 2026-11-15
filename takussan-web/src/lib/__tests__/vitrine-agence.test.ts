import { describe, expect, it } from 'vitest';

import {
  basculerBien,
  chargeUtileVitrine,
  couvertureApercue,
  deplacerBien,
  erreursVitrineSurLeurChamp,
  peutEcrireLaVitrine,
  type BienDeVitrine,
} from '../vitrine-agence';
import { pageAccessible, pageAdmin } from '@/lib/access/pages-admin';
import type { UserRole } from '@/types/user';

/** TCK-2524 — les règles de la vitrine d'agence, sans écran. */

const bien = (id: number, photo = true): BienDeVitrine => ({
  id,
  title: `Bien ${id}`,
  main_photo_url: photo ? `https://media.test/${id}.webp` : null,
});

describe('basculerBien — six biens au plus', () => {
  it('ajoute à la fin, retire où qu\'il soit', () => {
    expect(basculerBien([1, 2], 3)).toEqual([1, 2, 3]);
    expect(basculerBien([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('AC1 — refuse le septième et rend la MÊME sélection', () => {
    const six = [1, 2, 3, 4, 5, 6];
    const apres = basculerBien(six, 7);
    expect(apres).toBe(six);
    expect(apres).toHaveLength(6);
  });

  it('retirer reste possible à six', () => {
    expect(basculerBien([1, 2, 3, 4, 5, 6], 4)).toEqual([1, 2, 3, 5, 6]);
  });

  it('à cinq, le sixième entre', () => {
    expect(basculerBien([1, 2, 3, 4, 5], 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('deplacerBien', () => {
  it('échange avec le voisin, immobile aux bords', () => {
    expect(deplacerBien([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(deplacerBien([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(deplacerBien([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(deplacerBien([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });
});

describe('couvertureApercue — la règle d\'AgencyShowcase::covers()', () => {
  const publics = [bien(10), bien(11), bien(12), bien(13), bien(14, false), bien(15)];

  it('sans sélection : les trois plus récents (ordre de la liste)', () => {
    expect(couvertureApercue([], publics).map((b) => b.id)).toEqual([10, 11, 12]);
  });

  it('AC2 — la sélection d\'abord, dans son ordre, complétée par les plus récents', () => {
    expect(couvertureApercue([13], publics).map((b) => b.id)).toEqual([13, 10, 11]);
    expect(couvertureApercue([15, 13], publics).map((b) => b.id)).toEqual([15, 13, 10]);
    expect(couvertureApercue([13, 15], publics).map((b) => b.id)).toEqual([13, 15, 10]);
  });

  it('saute un bien sans photo et un bien sélectionné qui n\'est plus public', () => {
    expect(couvertureApercue([14, 999, 12], publics).map((b) => b.id)).toEqual([12, 10, 11]);
  });

  it('ne compte pas deux fois un bien sélectionné qui est aussi récent', () => {
    expect(couvertureApercue([11], publics).map((b) => b.id)).toEqual([11, 10, 12]);
  });

  it('un bien choisi hors de la page reçue, lu par son id, reste en tête', () => {
    expect(couvertureApercue([150, 13], publics, [bien(150), bien(13)]).map((b) => b.id)).toEqual([150, 13, 10]);
    // Lu par son id mais sans photo : sauté, comme l'API.
    expect(couvertureApercue([151], publics, [bien(151, false)]).map((b) => b.id)).toEqual([10, 11, 12]);
  });

  it('les récents s\'arrêtent aux neuf premiers, comme l\'API', () => {
    const sansPhoto = Array.from({ length: 9 }, (_, i) => bien(i + 1, false));
    expect(couvertureApercue([], [...sansPhoto, bien(50)])).toEqual([]);
  });
});

describe('chargeUtileVitrine — vider retire, les lignes vides ne partent pas', () => {
  it('tout vide part à null', () => {
    expect(chargeUtileVitrine({ accroche: '  ', points: ['', ' ', ''], selection: [] }).payload).toEqual({
      tagline: null,
      highlights: null,
      showcase_property_ids: null,
    });
  });

  it('rogne, retire la ligne du milieu vide et garde l\'ordre de la sélection', () => {
    const { payload, indexDesPoints } = chargeUtileVitrine({
      accroche: ' Depuis 2014. ',
      points: ['Wolof parlé', '', ' Visites le samedi '],
      selection: [8, 3],
    });
    expect(payload).toEqual({
      tagline: 'Depuis 2014.',
      highlights: ['Wolof parlé', 'Visites le samedi'],
      showcase_property_ids: [8, 3],
    });
    expect(indexDesPoints).toEqual([0, 2]);
  });
});

describe('erreursVitrineSurLeurChamp — un 422 reposé sur son champ', () => {
  it('reporte highlights.1 sur la ligne d\'écran du deuxième point ENVOYÉ', () => {
    const { champs } = erreursVitrineSurLeurChamp({ 'highlights.1': ['Trop long.'] }, [0, 2]);
    expect(champs).toEqual({ 'point-2': 'Trop long.' });
  });

  it('accroche, sélection (indexée ou non) et le reste au bandeau', () => {
    const { champs, autres } = erreursVitrineSurLeurChamp(
      {
        tagline: ['Accroche trop longue.'],
        'showcase_property_ids.3': ['Bien inconnu.'],
        highlights: ['Trois au plus.'],
        currency: ['Devise.'],
      },
      [],
    );
    expect(champs).toEqual({ accroche: 'Accroche trop longue.', selection: 'Bien inconnu.', points: 'Trois au plus.' });
    expect(autres).toEqual(['Devise.']);
  });
});

describe('peutEcrireLaVitrine — la règle d’AgencyPolicy::configure', () => {
  it('l’administrateur principal, ou qui tient agency.update', () => {
    expect(peutEcrireLaVitrine(['agency.update'], { primary_admin_id: 9 }, 2)).toBe(true);
    expect(peutEcrireLaVitrine([], { primary_admin_id: 2 }, 2)).toBe(true);
    expect(peutEcrireLaVitrine(null, { primary_admin_id: 2 }, 2)).toBe(true);
  });

  it('AC3 — sans la capacité (un agent, un admin à rôle restreint), ni sans capacités lisibles : non', () => {
    expect(peutEcrireLaVitrine(['properties.create', 'agency.view'], { primary_admin_id: 9 }, 2)).toBe(false);
    expect(peutEcrireLaVitrine(null, { primary_admin_id: 9 }, 2)).toBe(false);
    expect(peutEcrireLaVitrine(['agency.update_kyc'], { primary_admin_id: null }, 2)).toBe(false);
  });
});

describe('AC3 — la page qui porte le bloc ne s’ouvre pas à un agent sans rôle d’administration', () => {
  it('/app/agency est refusée à l’agent, quelles que soient ses capacités déléguées', () => {
    const page = pageAdmin('/app/agency')!;
    const agent = { roles: ['agent', 'customer'] as UserRole[], agence: { kind: 'standard' as const }, capacites: ['team.invite', 'agency.update'] };
    expect(pageAccessible(page, agent)).toBe(false);
    const admin = { roles: ['agency_admin'] as UserRole[], agence: { kind: 'standard' as const }, capacites: ['agency.update'] };
    expect(pageAccessible(page, admin)).toBe(true);
  });
});
