// @vitest-environment node
/**
 * TCK-948 (P44.01) — `GET /api/sante` contre un VRAI serveur HTTP local, avec le `fetch` réel.
 *
 * Deux comportements qu'aucune doublure de `fetch` ne montre, parce qu'ils sont ceux de `fetch`
 * lui-même (vérification adverse du 2026-10-18) :
 *
 * - **la redirection** : par défaut, `fetch` la suit. Un `/up` qui renvoie en 301 vers une page à
 *   200 — un autre environnement, un passage http → https — faisait rendre `{api:"ok"}`. La doublure
 *   rendait le 301 tel quel, et le test était vert sans le correctif ;
 * - **le délai** : une API qui accepte la connexion sans répondre figeait la sonde jusqu'au délai
 *   d'en-têtes d'undici (300 s), et la preuve d'`images.yml` avec elle.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { GET } = await import('../route');

let serveur: Server;

beforeAll(async () => {
  serveur = createServer((requete, reponse) => {
    if (requete.url === '/up') {
      // Ce que rend un hôte qui n'est pas l'API : une redirection vers une page servie.
      reponse.writeHead(301, { Location: '/ailleurs' }).end();
    } else if (requete.url === '/ailleurs') {
      reponse.writeHead(200).end('une page');
    }
    // `/muet/up` : la connexion est acceptée, aucune réponse ne part jamais.
  });
  await new Promise<void>((pret) => serveur.listen(0, '127.0.0.1', pret));
});

afterAll(async () => {
  serveur.closeAllConnections();
  await new Promise((ferme) => serveur.close(ferme));
});

const base = () => `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;

beforeEach(() => {
  vi.stubEnv('API_URL', 'https://api.publique.test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/sante — serveur réel', () => {
  it('le serveur de l\'épreuve redirige bien vers une page à 200 (sans quoi le cas suivant ne prouverait rien)', async () => {
    const suivie = await fetch(`${base()}/up`);
    expect(suivie.status).toBe(200);
    expect(suivie.redirected).toBe(true);
  });

  it('rend 503 quand /up redirige, même vers une page à 200 : la redirection n\'est pas suivie', async () => {
    vi.stubEnv('API_INTERNAL_URL', base());

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ api: 'ko', amont: 301 });
  });

  it('rend 503 dans le délai quand l\'API accepte la connexion sans jamais répondre', async () => {
    // Le délai de la route est de 3 s ; l'épreuve le ramène à 100 ms, et vérifie qu'il est demandé.
    const delaiReel = AbortSignal.timeout.bind(AbortSignal);
    const delai = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => delaiReel(100));
    vi.stubEnv('API_INTERNAL_URL', `${base()}/muet`);

    const debut = Date.now();
    const issue = await Promise.race([
      GET(),
      new Promise<'figée'>((fin) => setTimeout(() => fin('figée'), 2000)),
    ]);

    expect(issue).not.toBe('figée');
    expect((issue as Response).status).toBe(503);
    expect(Date.now() - debut).toBeLessThan(2000);
    expect(delai).toHaveBeenCalledWith(3000);
  });
});
