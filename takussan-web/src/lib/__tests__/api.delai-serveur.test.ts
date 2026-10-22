// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-1215 (P79.01, P79.03) — côté serveur, aucun appel à l'API n'attend sans borne.
 *
 * Sans signal, le `fetch` de Node attend une API qui accepte la connexion sans répondre jusqu'au
 * `headersTimeout` d'undici : 300 s, mesurés à 301,2 s. `apiFetch` et `apiRequest` posent
 * désormais un délai côté serveur, combiné au signal de l'appelant.
 *
 * Le délai réel (30 s) n'est pas attendu : `AbortSignal.timeout` est épié, la valeur demandée
 * relevée, et un délai de quelques millisecondes rendu à sa place.
 */

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next-intl/server', () => ({ getLocale: vi.fn(async () => 'fr') }));

import { apiFetch, apiRequest, DELAI_API_SERVEUR_ENVOI_MS, DELAI_API_SERVEUR_MS } from '../api';
import { getProperty } from '../queries/public-property';

const timeoutReel = AbortSignal.timeout.bind(AbortSignal);
let delaisDemandes: number[];
let fetchSpy: MockInstance<typeof fetch>;

/** Un `fetch` contre une API figée : il ne se résout jamais, et ne rejette qu'à l'abandon de son signal. */
function apiFigee(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resoudre, rejeter) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) rejeter(signal.reason);
    signal.addEventListener('abort', () => rejeter(signal.reason), { once: true });
  });
}

beforeEach(() => {
  delaisDemandes = [];
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    delaisDemandes.push(ms);
    return timeoutReel(5);
  });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(apiFigee);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Rejette si la promesse n'est pas réglée sous `ms` : le test échoue au lieu d'attendre 20 s. */
function sousLaBorne<T>(promesse: Promise<T>, ms = 1_000): Promise<T> {
  return Promise.race([
    promesse,
    new Promise<T>((_r, rejeter) => setTimeout(() => rejeter(new Error(`toujours en attente après ${ms} ms`)), ms)),
  ]);
}

describe('délai des appels serveur vers l\'API', () => {
  it('la borne vaut 30 s, et 90 s pour un envoi de fichier', () => {
    expect(DELAI_API_SERVEUR_MS).toBe(30_000);
    expect(DELAI_API_SERVEUR_ENVOI_MS).toBe(90_000);
  });

  it('apiFetch rejette sur une API figée, au délai serveur', async () => {
    const erreur = await sousLaBorne(apiFetch('/public/properties').catch((e: unknown) => e));

    expect(erreur).toBeInstanceOf(DOMException);
    expect((erreur as DOMException).name).toBe('TimeoutError');
    expect(delaisDemandes).toEqual([DELAI_API_SERVEUR_MS]);
  });

  it('apiRequest rejette sur une API figée, au délai serveur', async () => {
    const erreur = await sousLaBorne(apiRequest('/api/auth/me', { token: 't' }).catch((e: unknown) => e));

    expect((erreur as DOMException).name).toBe('TimeoutError');
    expect(delaisDemandes).toEqual([DELAI_API_SERVEUR_MS]);
  });

  it('apiRequest d\'un formulaire de fichiers demande le délai d\'envoi', async () => {
    await sousLaBorne(
      apiRequest('/api/documents', { method: 'POST', body: new FormData(), formData: true }).catch(() => null),
    );

    expect(delaisDemandes).toEqual([DELAI_API_SERVEUR_ENVOI_MS]);
  });

  it('le signal de l\'appelant abandonne toujours l\'appel', async () => {
    vi.mocked(AbortSignal.timeout).mockImplementation((ms: number) => {
      delaisDemandes.push(ms);
      return timeoutReel(60_000);
    });
    const appelant = new AbortController();
    const appel = apiRequest('/api/properties', { signal: appelant.signal }).catch((e: unknown) => e);
    appelant.abort(new DOMException('abandon', 'AbortError'));

    const erreur = await sousLaBorne(appel);
    expect((erreur as DOMException).name).toBe('AbortError');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('P79.03 — la fiche publique rend « indisponible » sur une API figée', async () => {
    const resultat = await sousLaBorne(getProperty('villa-a-ngor-abc123', 'fr'));

    expect(resultat).toEqual({ etat: 'indisponible' });
  });
});
