import { describe, expect, it } from 'vitest';

import type { PropertyVisit } from '@/types/visit';

import { commenceeDeLUrl, commenceeRetenue, etatDeLaFiche, finPrevue } from '../etat-de-la-fiche';

// Reprise (vérification du lot B, g2) : la machine et la CI sont à l'heure de Dakar (UTC+0), où l'heure
// locale et l'heure de Dakar se confondent ; une lecture en heure locale y passerait inaperçue. Le
// fichier tourne donc dans un fuseau qui en diffère, et Dakar doit rester juste partout.
process.env.TZ = 'Europe/Paris';

/** Mardi 10 novembre 2026, 10:12 à Dakar (UTC+0 toute l'année). */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');
const a = (iso: string) => new Date(iso);

const visite = (o: Partial<PropertyVisit>): PropertyVisit => ({ id: 1, property_id: 2, status: 'confirmed', scheduled_at: '2026-11-10T10:57:00Z', duration_minutes: 30, ...o });

describe('TCK-2587 — l’état de la fiche d’une visite', () => {
  it('une demande à confirmer, à heure fixée comme par tranche, tant que son heure n’est pas passée', () => {
    expect(etatDeLaFiche(visite({ status: 'scheduled', scheduled_at: '2026-11-11T10:00:00Z' }), MAINTENANT, null)).toBe('a-confirmer');
    expect(etatDeLaFiche(visite({ status: 'scheduled', preferred_window: 'afternoon', scheduled_at: '2026-11-11T14:00:00Z' }), MAINTENANT, null)).toBe('a-confirmer');
  });

  it('une demande par tranche reste à confirmer une fois le début de la tranche passé : son heure n’est pas fixée', () => {
    expect(etatDeLaFiche(visite({ status: 'scheduled', preferred_window: 'morning', scheduled_at: '2026-11-10T09:00:00Z' }), MAINTENANT, null)).toBe('a-confirmer');
  });

  it('une demande à heure fixée dont l’heure est passée : en cours jusqu’à sa fin prévue, puis après', () => {
    expect(etatDeLaFiche(visite({ status: 'scheduled', scheduled_at: '2026-11-10T10:12:00Z' }), MAINTENANT, null)).toBe('en-cours');
    expect(etatDeLaFiche(visite({ status: 'scheduled', scheduled_at: '2026-11-10T09:42:00Z' }), MAINTENANT, null)).toBe('apres');
  });

  it('confirmée aujourd’hui à Dakar, pas encore commencée : jour J ; un autre jour : confirmée', () => {
    expect(etatDeLaFiche(visite({}), MAINTENANT, null)).toBe('jour-j');
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-10T23:59:00Z' }), MAINTENANT, null)).toBe('jour-j');
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-11T00:00:00Z' }), MAINTENANT, null)).toBe('confirmee');
  });

  it('confirmée, son heure atteinte (borne incluse) : en cours ; une seconde avant : jour J', () => {
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-10T10:12:00Z' }), MAINTENANT, null)).toBe('en-cours');
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-10T10:12:01Z' }), MAINTENANT, null)).toBe('jour-j');
  });

  it('en cours jusqu’à début + durée (borne exclue), après ensuite — une visite d’hier n’est pas « en cours »', () => {
    // 45 min : de 09:30 à 10:15.
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-10T09:30:00Z', duration_minutes: 45 }), MAINTENANT, null)).toBe('en-cours');
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-10T09:27:00Z', duration_minutes: 45 }), MAINTENANT, null)).toBe('apres');
    // Sans durée : 30 min.
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-10T09:43:00Z', duration_minutes: undefined }), MAINTENANT, null)).toBe('en-cours');
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-10T09:42:00Z', duration_minutes: undefined }), MAINTENANT, null)).toBe('apres');
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-09T17:00:00Z' }), MAINTENANT, null)).toBe('apres');
  });

  it('« Commencer » avance le jour J à « en cours », et la fin prévue part du clic', () => {
    const clic = a('2026-11-10T10:05:00Z');
    expect(etatDeLaFiche(visite({}), MAINTENANT, clic)).toBe('en-cours');
    expect(finPrevue(visite({}), clic)).toBe(Date.parse('2026-11-10T10:35:00Z'));
    // Commencée à 09:40 : la fin prévue (10:10) est passée.
    expect(etatDeLaFiche(visite({}), MAINTENANT, a('2026-11-10T09:40:00Z'))).toBe('apres');
    // Un clic après l'heure compte aussi (maquette : visite de 10:57, « Commencée à 10:58 · fin prévue à 11:28 »).
    expect(finPrevue(visite({ scheduled_at: '2026-11-10T09:50:00Z' }), a('2026-11-10T10:00:00Z'))).toBe(Date.parse('2026-11-10T10:30:00Z'));
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-10T09:40:00Z' }), MAINTENANT, a('2026-11-10T09:50:00Z'))).toBe('en-cours');
  });

  it('« Commencer » ne vaut ni pour un autre jour, ni pour une demande, ni pour une visite close, ni pour un clic à venir', () => {
    const clic = a('2026-11-10T10:05:00Z');
    expect(etatDeLaFiche(visite({ scheduled_at: '2026-11-12T10:00:00Z' }), MAINTENANT, clic)).toBe('confirmee');
    expect(etatDeLaFiche(visite({ status: 'scheduled', scheduled_at: '2026-11-10T15:00:00Z' }), MAINTENANT, clic)).toBe('a-confirmer');
    expect(etatDeLaFiche(visite({ status: 'completed' }), MAINTENANT, clic)).toBe('terminee');
    expect(etatDeLaFiche(visite({}), MAINTENANT, a('2026-11-10T10:30:00Z'))).toBe('jour-j');
  });

  it('le clic retenu : une visite confirmée du jour, un clic passé — sinon rien', () => {
    const clic = a('2026-11-10T10:05:00Z');
    expect(commenceeRetenue(visite({}), MAINTENANT, clic)).toBe(clic);
    expect(commenceeRetenue(visite({ scheduled_at: '2026-11-11T10:00:00Z' }), MAINTENANT, clic)).toBeNull();
    expect(commenceeRetenue(visite({ status: 'scheduled' }), MAINTENANT, clic)).toBeNull();
    expect(commenceeRetenue(visite({}), MAINTENANT, a('2026-11-10T10:30:00Z'))).toBeNull();
    expect(commenceeRetenue(visite({}), MAINTENANT, null)).toBeNull();
  });

  it('les visites closes : terminée, annulée, absent', () => {
    expect(etatDeLaFiche(visite({ status: 'completed' }), MAINTENANT, null)).toBe('terminee');
    expect(etatDeLaFiche(visite({ status: 'cancelled' }), MAINTENANT, null)).toBe('annulee');
    expect(etatDeLaFiche(visite({ status: 'no_show' }), MAINTENANT, null)).toBe('absent');
  });

  it('`?commencee=HH:MM` se lit à Dakar, le jour même ; une valeur mal formée ne commence rien', () => {
    expect(commenceeDeLUrl('10:05', MAINTENANT)?.toISOString()).toBe('2026-11-10T10:05:00.000Z');
    for (const x of [null, '', '1005', '24:00', '9:05', '10:60', 'x']) expect(commenceeDeLUrl(x, MAINTENANT)).toBeNull();
  });
});
