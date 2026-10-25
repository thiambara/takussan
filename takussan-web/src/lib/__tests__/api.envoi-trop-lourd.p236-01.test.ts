import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';
import { ApiError, CODES_ERREUR_API, messageErreurApi } from '../api';

/**
 * TCK-2370 (P236.01) — un envoi refusé pour sa taille par le proxy de l'API (`docker/Caddyfile`,
 * plus de 25 Mio) se nomme. Le proxy rend désormais `{"code":"payload_too_large"}` avec les
 * en-têtes CORS de l'API ; un relais qui recopie un corps vide laisse un `ApiError(413, null)`.
 * Les deux rendaient le repli générique de l'appelant.
 */
function resous(chemin: string): string | undefined {
  const v = chemin
    .split('.')
    .reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), fr);
  return typeof v === 'string' ? v : undefined;
}
const t = (cle: string) => resous(cle) ?? cle;

const LIBELLE = "L'envoi dépasse 25 Mo : envoyez moins de fichiers à la fois, ou des fichiers plus légers.";

describe('messageErreurApi — envoi trop lourd', () => {
  it('le code est au catalogue que le front sait traduire', () => {
    expect(CODES_ERREUR_API).toContain('payload_too_large');
  });

  it('le corps du proxy, {code: payload_too_large}, dit quoi changer', () => {
    const err = new ApiError(413, { code: 'payload_too_large' });

    expect(err.codeErreur).toBe('payload_too_large');
    expect(messageErreurApi(err, t, 'repli')).toBe(LIBELLE);
  });

  it('un 413 au corps vide, recopié par un relais, aussi', () => {
    expect(messageErreurApi(new ApiError(413, null), t, 'repli')).toBe(LIBELLE);
  });

  it('la prose localisée de Laravel sur son propre 413 l’emporte toujours', () => {
    const err = new ApiError(413, { message: 'Le contenu envoyé est trop volumineux.', code: 'http.payload_too_large' });

    expect(messageErreurApi(err, t, 'repli')).toBe('Le contenu envoyé est trop volumineux.');
  });
});
