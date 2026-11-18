/**
 * TCK-2968 — les règles de la boîte que le front tient : délai d'un fil « À vous » (dépassé au-delà de 4 h),
 * motif d'attente nommé d'après les participants, et choix courts de « Rappelez-le-moi » (heure de Dakar).
 */
import { describe, expect, it } from 'vitest';
import { DELAI_DEPASSE_MS, choixDeRappel, delaiDuFil, fileDeLaPuce, nomsAttendus } from '../pilotage';

const participant = (id: number, nom: string, parti = false) => ({
  id: id + 100,
  user_id: id,
  role: 'member',
  last_read_at: null,
  joined_at: '',
  left_at: parti ? '2026-11-01T00:00:00Z' : null,
  user: { id, full_name: nom, avatar_url: null },
});

describe('pilotage de la boîte (TCK-2968)', () => {
  it('le délai dépassé est de 4 h, une constante nommée', () => {
    expect(DELAI_DEPASSE_MS).toBe(4 * 60 * 60 * 1000);
    const maintenant = new Date('2026-11-18T12:00:00Z');
    expect(delaiDuFil('2026-11-18T11:35:00Z', maintenant)).toEqual({ unite: 'minutes', n: 25, reste: 0, depasse: false });
    expect(delaiDuFil('2026-11-18T08:00:00Z', maintenant)).toMatchObject({ unite: 'heures', n: 4, depasse: false });
    expect(delaiDuFil('2026-11-18T07:59:00Z', maintenant)).toMatchObject({ unite: 'heures', n: 4, reste: 1, depasse: true });
    expect(delaiDuFil('2026-11-16T12:00:00Z', maintenant)).toMatchObject({ unite: 'jours', n: 2, depasse: true });
    expect(delaiDuFil(null, maintenant)).toBeNull();
  });

  it('les puces de file partent au serveur ; « Tous » et « Non lus » n’en portent pas', () => {
    expect(fileDeLaPuce('vous')).toBe('vous');
    expect(fileDeLaPuce('attente')).toBe('attente');
    expect(fileDeLaPuce('rappel')).toBe('rappel');
    expect(fileDeLaPuce('tous')).toBeNull();
    expect(fileDeLaPuce('nonLus')).toBeNull();
  });

  it('le motif d’attente nomme les participants actifs ; un identifiant inconnu ou parti n’est jamais affiché', () => {
    const conversation = { en_attente_de: [2, 99, 3], participants: [participant(1, 'Moi'), participant(2, 'Bineta Sarr'), participant(3, 'Ibou Fall', true)] };
    expect(nomsAttendus(conversation as never)).toEqual(['Bineta Sarr']);
  });

  it('« Rappelez-le-moi » : dans 1 h, ce soir, demain matin, lundi — tous futurs, à 30 jours au plus', () => {
    // Mercredi 18 novembre 2026, 10:00 à Dakar (UTC+0).
    const maintenant = new Date('2026-11-18T10:00:00Z');
    const choix = choixDeRappel(maintenant);
    expect(choix.map((c) => c.cle)).toEqual(['uneHeure', 'ceSoir', 'demainMatin', 'lundi']);
    expect(choix.map((c) => c.jusqua.toISOString())).toEqual([
      '2026-11-18T11:00:00.000Z',
      '2026-11-18T18:00:00.000Z',
      '2026-11-19T09:00:00.000Z',
      '2026-11-23T09:00:00.000Z',
    ]);
    for (const c of choix) expect(c.jusqua.getTime()).toBeGreaterThan(maintenant.getTime());
  });

  it('« ce soir » disparaît à moins d’une heure de 18 h, « lundi » quand il tombe demain', () => {
    expect(choixDeRappel(new Date('2026-11-18T17:30:00Z')).map((c) => c.cle)).toEqual(['uneHeure', 'demainMatin', 'lundi']);
    // Dimanche 22 novembre : lundi est demain.
    expect(choixDeRappel(new Date('2026-11-22T10:00:00Z')).map((c) => c.cle)).toEqual(['uneHeure', 'ceSoir', 'demainMatin']);
  });
});
