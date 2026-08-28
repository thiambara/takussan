import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * La CLASSIFICATION des pannes des fiches publiques (TCK-438, AC2).
 *
 * ## Pourquoi ce fichier existe : une ablation restée verte
 *
 * Les tests de rendu serveur des fiches (`agencies/[slug]/__tests__/page.server.test.tsx` et son
 * jumeau) remplacent le module de requête par un `vi.mock`. Ils gardent donc ce que la PAGE fait
 * d'un état — `introuvable` → `notFound()`, `indisponible` → écran + `noindex` — et rien de ce qui
 * DÉCIDE de cet état.
 *
 * Le trou n'a pas été deviné, il a été mesuré. Ablation du 2026-08-27 : `getAgency` remis à
 * `return { etat: 'introuvable' }` pour toute panne — c'est-à-dire le défaut d'origine, restauré à
 * l'identique — et la suite de la fiche est restée **verte, 5 tests sur 5** :
 *
 * ```
 * md5 e0cf8d4218e7 → a0b5b9cd9c63  (ablation effective)
 * Tests  5 passed (5)              ← le correctif d'AC2 n'était gardé par rien
 * ```
 *
 * *Une ablation qui reste verte ne dit pas que le code est bon : elle dit que le test ne le
 * regarde pas.* Les cas ci-dessous ferment cette moitié-là.
 *
 * ⚠ Le contrat tient en une phrase, et c'est la seule que le visiteur paie si elle est fausse :
 * **404 amont, et lui seul, vaut `introuvable`.** Tout le reste — 500, 503, 429, réseau mort,
 * JSON illisible — est une panne de notre côté, dont on ne peut RIEN conclure sur l'existence de
 * la chose demandée.
 */

const apiFetchMock = vi.fn();
// ⚠ Le journal est espionné UNE fois, puis remis à zéro : un `vi.spyOn` par cas ré-enveloppe
// l'espion précédent et le compteur cumule les appels de tous les cas antérieurs (mesuré : 20 au
// lieu de 1). Un test qui compte des appels doit posséder son compteur.
const erreurJournal = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const { getAgency } = await import('../public-agency');
const { getAgent } = await import('../public-agent');

/**
 * ⚠ `cache()` de React mémoïse par identité d'arguments. Un slug réutilisé d'un cas à l'autre
 * rendrait la réponse du cas précédent, et le second cas serait vert sans avoir rien exécuté —
 * un faux vert de la même famille que celui qui a fait naître ce fichier. Chaque cas prend donc
 * un slug qui n'a jamais servi.
 */
let compteur = 0;
const slugNeuf = () => `slug-de-test-${++compteur}`;

describe('getAgency / getAgent — 404 amont contre panne de notre côté', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    erreurJournal.mockClear();
  });

  const requetes = [
    ['getAgency', (slug: string) => getAgency(slug, 'fr')],
    ['getAgent', (slug: string) => getAgent(slug, 'fr')],
  ] as const;

  for (const [nom, appelle] of requetes) {
    describe(nom, () => {
      it('rend `trouve` quand l’API répond', async () => {
        apiFetchMock.mockResolvedValue({ data: { id: 1, slug: 'x' } });

        expect((await appelle(slugNeuf())).etat).toBe('trouve');
      });

      it('rend `introuvable` sur un 404 — et sur LUI SEUL', async () => {
        apiFetchMock.mockRejectedValue(new ApiError(404, null));

        expect((await appelle(slugNeuf())).etat).toBe('introuvable');
      });

      it.each([500, 502, 503, 429, 400, 401, 403])(
        'rend `indisponible` sur un %i — jamais `introuvable`',
        async (statut) => {
          apiFetchMock.mockRejectedValue(new ApiError(statut, null));

          expect((await appelle(slugNeuf())).etat).toBe('indisponible');
        },
      );

      it('rend `indisponible` quand le réseau est mort (ECONNREFUSED)', async () => {
        // La panne exacte observée le 2026-08-27, API locale arrêtée : `fetch` lève un `TypeError`
        // qui n'est PAS une `ApiError` et ne porte donc aucun statut. C'est le cas que le
        // `catch { return null }` d'origine transformait en « cette agence n'existe pas ».
        apiFetchMock.mockRejectedValue(
          Object.assign(new TypeError('fetch failed'), {
            cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8002'), {
              code: 'ECONNREFUSED',
            }),
          }),
        );

        expect((await appelle(slugNeuf())).etat).toBe('indisponible');
      });

      it('rend `indisponible` sur un corps illisible', async () => {
        apiFetchMock.mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));

        expect((await appelle(slugNeuf())).etat).toBe('indisponible');
      });

      it('journalise la panne côté serveur, et seulement la panne', async () => {
        // L'indisponibilité est muette pour le visiteur et bavarde pour le développeur : sans
        // trace, une API qui tombe rend une page polie et aucun signal.
        apiFetchMock.mockRejectedValue(new ApiError(500, null));
        await appelle(slugNeuf());
        expect(erreurJournal).toHaveBeenCalledTimes(1);

        apiFetchMock.mockRejectedValue(new ApiError(404, null));
        await appelle(slugNeuf());
        expect(erreurJournal).toHaveBeenCalledTimes(1); // un 404 amont n'est pas un incident
      });
    });
  }
});
