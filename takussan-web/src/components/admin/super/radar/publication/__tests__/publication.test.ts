import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  annoncesCochees,
  estCochee,
  preparationEnCours,
  publicationFermee,
  rejouerSiEnCours,
  resumeDeLaPublication,
} from '../publication';
import { annonce, apercu, compte } from './mocks';

/** TCK-2389 — ce que l'écran décide seul : qui est coché, ce que la confirmation récapitule. L'API juge de nouveau. */
describe('sélection de la publication', () => {
  it('une annonce sans blocage est cochée par défaut, et se décoche', () => {
    expect(estCochee(annonce(12), {})).toBe(true);
    expect(estCochee(annonce(12), { 12: false })).toBe(false);
  });

  it('une annonce bloquée n\'est jamais cochée, quel qu\'ait été le choix', () => {
    const bloquee = annonce(12, { blocking: ['radar.publish.no_photo'] });
    expect(estCochee(bloquee, {})).toBe(false);
    expect(estCochee(bloquee, { 12: true })).toBe(false);
  });

  it('les annonces cochées partent par identifiant croissant', () => {
    const liste = [annonce(14), annonce(12), annonce(13, { blocking: ['radar.publish.missing_field'] })];
    expect(annoncesCochees(liste, {}).map((a) => a.id)).toEqual([12, 14]);
    expect(annoncesCochees(liste, { 14: false }).map((a) => a.id)).toEqual([12]);
  });

  it('le résumé compte les biens, les photos des seules annonces cochées, et le compte créé', () => {
    const a = apercu({ listings: [annonce(12), annonce(13, { photos: [] , blocking: ['radar.publish.no_photo'] }), annonce(14)] });
    expect(resumeDeLaPublication(a, {})).toEqual({ biens: 2, photos: 4, creeLeCompte: true });
    expect(resumeDeLaPublication(a, { 14: false })).toEqual({ biens: 1, photos: 2, creeLeCompte: true });
    expect(resumeDeLaPublication({ ...a, account: compte({ exists: true }) }, {}).creeLeCompte).toBe(false);
  });

  it('la préparation en cours et la fermeture se lisent sur l\'aperçu', () => {
    expect(preparationEnCours(undefined)).toBe(false);
    expect(preparationEnCours(apercu())).toBe(false);
    expect(preparationEnCours(apercu({ listings: [annonce(12, { photo_preparation: { status: 'pending', total: 3, done: 1 } })] }))).toBe(true);
    expect(publicationFermee(apercu())).toBe(false);
    expect(publicationFermee(apercu({ blocking: ['radar.advertiser.phone_registered'] }))).toBe(true);
  });
});

describe('rejouerSiEnCours — un envoi encore en cours se rejoue (ADR-0072)', () => {
  const enCours = () => new ApiError(409, { code: 'idempotency.in_progress' });

  it('rend le résultat dès qu\'il arrive, après autant d\'attentes que de refus « en cours »', async () => {
    const appel = vi.fn()
      .mockRejectedValueOnce(enCours())
      .mockRejectedValueOnce(enCours())
      .mockResolvedValueOnce('enregistree');
    const attendre = vi.fn().mockResolvedValue(undefined);

    await expect(rejouerSiEnCours(appel, { essais: 5, delaiMs: 1234, attendre })).resolves.toBe('enregistree');

    expect(appel).toHaveBeenCalledTimes(3);
    expect(attendre.mock.calls).toEqual([[1234], [1234]]);
  });

  it('est borné : passé le dernier essai, le refus remonte tel quel', async () => {
    const appel = vi.fn().mockRejectedValue(enCours());
    const attendre = vi.fn().mockResolvedValue(undefined);

    await expect(rejouerSiEnCours(appel, { essais: 3, attendre })).rejects.toMatchObject({ status: 409 });

    expect(appel).toHaveBeenCalledTimes(3);
    expect(attendre).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue aucun autre refus, ni une panne', async () => {
    for (const erreur of [new ApiError(422, { code: 'radar.publish.not_covered' }), new ApiError(409, { code: 'radar.advertiser.claim_required' }), new ApiError(504, { code: 'upstream_timeout' })]) {
      const appel = vi.fn().mockRejectedValue(erreur);
      const attendre = vi.fn();

      await expect(rejouerSiEnCours(appel, { attendre })).rejects.toBe(erreur);

      expect(appel).toHaveBeenCalledTimes(1);
      expect(attendre).not.toHaveBeenCalled();
    }
  });
});
