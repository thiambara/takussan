// @vitest-environment node
/**
 * TCK-600 (ADR-0055 §6, verif-600 B1) — aucun segment de route dynamique ne réécrit l'URL de l'API.
 *
 * La sonde de la vérification adverse : `impersonate%3F`, `impersonate%23` et
 * `..%2Fadmin%2Fusers%2F12%2Fimpersonate`, décodés par Next puis recollés tels quels, faisaient
 * relayer `POST /api/admin/users/12/impersonate` — et le jeton de sa réponse — par cinq proxys.
 *
 * Deux moitiés :
 *  - la GARDE statique : tout route handler dynamique de `src/app/api` passe ses segments par
 *    `@/lib/segments-amont` ;
 *  - l'ÉPREUVE : chaque handler dynamique, exécuté contre un `fetch` espion, refuse chaque ligne de
 *    la sonde sans appeler l'API, et un segment ordinaire, lui, part bien (sinon le refus serait
 *    celui de tout).
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { cheminAmont, segmentAmont } from '@/lib/segments-amont';

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (nom === 'auth_token' ? { value: 'jeton-operateur' } : undefined),
  }),
  headers: async () => new Headers(),
}));

const DYNAMIQUES = globSync('src/app/api/**/route.ts').filter((f) => f.includes('[') && !f.includes('__tests__'));

/** Les noms de paramètres d'un chemin : `[id]` → id, `[...path]` et `[[...path]]` → path (catch-all). */
function parametres(fichier: string): { nom: string; catchAll: boolean }[] {
  return [...fichier.matchAll(/\[\[?(\.\.\.)?(\w+)\]\]?/g)].map((m) => ({ nom: m[2], catchAll: m[1] !== undefined }));
}

describe('segmentAmont / cheminAmont', () => {
  it.each(['impersonate?', 'impersonate#', '../admin/users/12/impersonate', '..', '.', 'a\\b', 'a/b'])(
    'refuse %j',
    (segment) => {
      expect(segmentAmont(segment)).toBeNull();
      expect(cheminAmont(['users', '12', segment])).toBeNull();
    },
  );

  it('ré-encode un segment ordinaire', () => {
    expect(segmentAmont('42')).toBe('42');
    expect(segmentAmont('é ;')).toBe('%C3%A9%20%3B');
    expect(cheminAmont(['users', '12', 'block'])).toBe('users/12/block');
    expect(cheminAmont([])).toBe('');
  });
});

describe('garde statique — les handlers dynamiques passent par segments-amont', () => {
  it('trouve les handlers dynamiques (sans quoi la garde ne garderait rien)', () => {
    expect(DYNAMIQUES.length).toBeGreaterThanOrEqual(17);
  });

  it.each(DYNAMIQUES)('%s', (fichier) => {
    const source = readFileSync(fichier, 'utf8');
    expect(source).toContain("from '@/lib/segments-amont'");
    for (const { nom, catchAll } of parametres(fichier)) {
      if (catchAll) {
        expect(source).toMatch(/cheminAmont\(segments\)/);
        expect(source).not.toMatch(/segments\.(join|map)\(/);
      } else {
        expect(source).toMatch(new RegExp(`const ${nom} = segmentAmont\\(\\(await (ctx\\.)?params\\)\\.${nom}\\);`));
        expect(source).not.toMatch(new RegExp(`const \\{ ${nom} \\} = await`));
      }
    }
  });
});

const SONDE = [
  ['users', '12', 'impersonate?'],
  ['users', '12', 'impersonate#'],
  ['impersonate', 'stop?'],
  ['../admin/users/12/impersonate'],
  ['..', 'admin', 'users', '12', 'impersonate'],
  ['.'],
  ['users\\12'],
];

const METHODES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, unknown>> }) => Promise<Response>;

const modules = import.meta.glob('../**/route.ts');
const aEprouver = Object.keys(modules).filter((cle) => cle.includes('[') && !cle.includes('__tests__'));

function requete(methode: string): NextRequest {
  const enTetes = new Headers({
    cookie: 'auth_token=jeton-operateur; impersonation_token=42|jeton-imp',
    'content-type': 'application/json',
  });
  const init: RequestInit = { method: methode, headers: enTetes };
  if (!['GET', 'HEAD'].includes(methode)) init.body = JSON.stringify({ reason: 'Ticket support 4821.' });
  return new NextRequest(new URL('http://localhost:3113/api/x'), init as never);
}

function espion() {
  const fetchMock = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: { token: 'SECRET-IMP-TOKEN' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('épreuve — chaque handler dynamique refuse la sonde sans appeler l\'API', () => {
  it('éprouve autant de modules que la garde en voit', () => {
    expect(aEprouver.length).toBe(DYNAMIQUES.length);
  });

  it.each(aEprouver)('%s', async (cle) => {
    const mod = (await modules[cle]()) as Record<string, Handler>;
    const params = parametres(cle);
    const methodes = METHODES.filter((m) => typeof mod[m] === 'function');
    expect(methodes.length).toBeGreaterThan(0);

    const valeurs: Record<string, unknown>[] = SONDE.map((segments) =>
      Object.fromEntries(params.map(({ nom, catchAll }) => [nom, catchAll ? segments : segments.join('/')])),
    );

    for (const methode of methodes) {
      for (const valeur of valeurs) {
        const fetchMock = espion();
        const res = await mod[methode](requete(methode), { params: Promise.resolve(valeur) });
        expect(res.status, `${methode} ${JSON.stringify(valeur)}`).toBe(400);
        expect(await res.text()).not.toContain('SECRET-IMP-TOKEN');
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
      }
    }

    // Témoin : un segment ordinaire part bien vers l'API, ré-encodé.
    const fetchMock = espion();
    const ORDINAIRES: Record<string, string> = { entity: 'customers', key: 'annonce' };
    const ordinaire = Object.fromEntries(params.map(({ nom, catchAll }) => [nom, catchAll ? ['users', '12'] : (ORDINAIRES[nom] ?? '42')]));
    await mod[methodes[0]](requete(methodes[0]), { params: Promise.resolve(ordinaire) });
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toMatch(/\.\.|impersonate/);
  });
});
