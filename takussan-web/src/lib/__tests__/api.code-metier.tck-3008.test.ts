import { describe, expect, it } from 'vitest';

import { ApiError, codeMetierDe, refusDAction } from '@/lib/api';

/** TCK-3008 — le code métier, ses paramètres et l'aplatissement 422, lus une fois sur `ApiError`. */
describe('ApiError — le refus lu par son code métier (TCK-3008)', () => {
  it('codeMetier rend le code de l’API même quand une prose l’accompagne', () => {
    const erreur = new ApiError(409, { code: 'booking.dossier_closed', message: 'Le dossier est clos.' });
    expect(erreur.codeMetier).toBe('booking.dossier_closed');
    // Le contrat de `codeErreur` ne bouge pas : la prose l'emporte.
    expect(erreur.codeErreur).toBeUndefined();
  });

  it('codeMetier est undefined sans code texte non vide', () => {
    expect(new ApiError(500, null).codeMetier).toBeUndefined();
    expect(new ApiError(409, { code: '' }).codeMetier).toBeUndefined();
    expect(new ApiError(409, { code: 42 }).codeMetier).toBeUndefined();
    expect(new ApiError(409, 'texte').codeMetier).toBeUndefined();
  });

  it('params rend `params` seul, objet vide sinon', () => {
    expect(new ApiError(422, { code: 'x', params: { max: 3 }, existing: { id: 1 } }).params).toEqual({ max: 3 });
    expect(new ApiError(422, { code: 'x' }).params).toEqual({});
    expect(new ApiError(422, { code: 'x', params: ['a'] }).params).toEqual({});
  });

  it('messagesDeValidation aplatit les erreurs d’un 422, et rien hors d’un 422', () => {
    const corps = { message: 'm', errors: { nom: ['Trop long.', 'Vide.'], ville: ['Manque.'] } };
    expect(new ApiError(422, corps).messagesDeValidation()).toEqual(['Trop long.', 'Vide.', 'Manque.']);
    expect(new ApiError(400, corps).messagesDeValidation()).toEqual([]);
    expect(new ApiError(422, { message: 'm' }).messagesDeValidation()).toEqual([]);
  });
});

describe('refusDAction — le résultat d’échec d’une server action (TCK-3008)', () => {
  const t = (cle: string) => cle;

  it('porte le code et les params de l’API à côté du message', () => {
    const erreur = new ApiError(409, { code: 'invitation.account_exists', message: 'Un compte existe.', params: { masked: 'm•••' } });
    expect(refusDAction(erreur, t, 'repli')).toEqual({ message: 'Un compte existe.', code: 'invitation.account_exists', params: { masked: 'm•••' } });
  });

  it('n’ajoute ni code ni params quand l’API n’en donne pas', () => {
    expect(refusDAction(new ApiError(500, { message: 'Panne.' }), t, 'repli')).toStrictEqual({ message: 'Panne.' });
    expect(refusDAction(new Error(''), t, 'repli')).toStrictEqual({ message: 'repli' });
  });
});

describe('codeMetierDe — le code de ce qu’a levé un appel (TCK-3008)', () => {
  it('lit une ApiError, et rien d’autre', () => {
    expect(codeMetierDe(new ApiError(410, { code: 'action_link.used' }))).toBe('action_link.used');
    expect(codeMetierDe(new TypeError('Failed to fetch'))).toBeUndefined();
    expect(codeMetierDe({ status: 410, data: { code: 'action_link.used' } })).toBeUndefined();
  });
});
