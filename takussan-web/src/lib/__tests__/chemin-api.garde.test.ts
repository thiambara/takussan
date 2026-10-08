// @vitest-environment node
/**
 * TCK-600 (ADR-0055 §6, verif-600 B1-bis) — aucune valeur ne réécrit le chemin d'une URL de l'API.
 *
 * La sonde de la passe 2 : `createCustomerNoteAction("../admin/users/12/impersonate?reason=…&x=",
 * "note")`, appelée depuis la page, faisait poster `/api/admin/users/12/impersonate?reason=…&x=/notes`
 * avec le jeton de l'opérateur — et rendait `data.token` à la page. Les arguments d'une server
 * action viennent du navigateur : le `number` du TypeScript n'existe pas à l'exécution.
 *
 * Trois moitiés :
 *  - le CONSTRUCTEUR `cheminApi` lui-même ;
 *  - la GARDE statique (AST) : dans `src/lib/**` et `src/app/actions/**`, tout chemin d'API
 *    interpolé passe par `cheminApi`, et aucun ne se concatène ;
 *  - l'ÉPREUVE : l'action de la sonde, exécutée contre un `fetch` espion.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-operateur', getActiveProfileId: async () => undefined }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));

import { ApiError } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { createCustomerNoteAction } from '@/app/actions/dashboard-customers';

const SONDE = [
  '../admin/users/12/impersonate?reason=Ticket%20support%204821&x=',
  // verif-600 m-C : une valeur qui commence par `?` tronquait vers `POST /api/customers/?…`.
  '?reason=Ticket support 4821&x=',
  '?',
  '../admin/users/12/impersonate',
  '12/../../admin/users/12/impersonate',
  '12?x=',
  '12#',
  '..',
  '.',
  '',
  'a\\b',
];

describe('cheminApi', () => {
  it.each(SONDE)('refuse %j dans le chemin, par une ApiError 400 invalid_path', (valeur) => {
    expect(() => cheminApi`/api/customers/${valeur}/notes`).toThrow(
      expect.objectContaining({ status: 400, data: { code: 'invalid_path' } }),
    );
    expect(() => cheminApi`/api/customers/${valeur}/notes`).toThrow(ApiError);
  });

  it('encode un segment ordinaire', () => {
    expect(cheminApi`/api/customers/${12}/notes`).toBe('/api/customers/12/notes');
    expect(cheminApi`/api/moderation/${'property:12'}/claim`).toBe('/api/moderation/property%3A12/claim');
    expect(cheminApi`/api/me/wizard-drafts/${'été 2026'}`).toBe('/api/me/wizard-drafts/%C3%A9t%C3%A9%202026');
  });

  it('laisse la requête telle quelle après un `?` écrit', () => {
    expect(cheminApi`/api/export/${'leases'}?${'from=2026-01-01&to=x/../y'}`).toBe('/api/export/leases?from=2026-01-01&to=x/../y');
  });

  it("n'accepte un suffixe de requête que d'un URLSearchParams ou de requete()", () => {
    expect(cheminApi`/api/customers${requete('page=2')}`).toBe('/api/customers?page=2');
    expect(cheminApi`/api/customers/${12}/notes${new URLSearchParams({ per_page: '5' })}`).toBe('/api/customers/12/notes?per_page=5');
    expect(cheminApi`/api/customers/${12}${requete('x=a/../b')}`).toBe('/api/customers/12?x=a/../b');
    expect(cheminApi`/api/customers${requete('')}`).toBe('/api/customers');
    expect(cheminApi`/api/customers${new URLSearchParams()}`).toBe('/api/customers');
    // Une CHAÎNE qui commence par `?` n'est pas un suffixe de requête : c'est un segment refusé.
    expect(() => cheminApi`/api/customers${'?page=2'}`).toThrow(ApiError);
    expect(() => cheminApi`/api/customers/${'?reason=Ticket support 4821&x='}/notes`).toThrow(
      expect.objectContaining({ status: 400, data: { code: 'invalid_path' } }),
    );
  });

  it("n'admet une valeur vide qu'en suffixe, jamais en segment", () => {
    expect(cheminApi`/api/customers${''}`).toBe('/api/customers');
    expect(() => cheminApi`/api/leases/${''}`).toThrow(ApiError);
    expect(() => cheminApi`/api/leases/${''}/payments`).toThrow(ApiError);
    expect(() => cheminApi`/api/leases/${''}${requete('a=1')}`).toThrow(ApiError);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Garde statique
// ──────────────────────────────────────────────────────────────────────────────────────────────

const APPELS: Record<string, number> = { apiFetch: 0, apiRequest: 0, fetch: 0, apiFetchPublic: 0, useApiQuery: 1 };
const RACINES = ['src/lib', 'src/app/actions'];
const EXCLUS = new Set(['src/lib/api.ts', 'src/lib/chemin-api.ts']);

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const p = join(dossier, nom);
    if (statSync(p).isDirectory()) return nom === '__tests__' ? [] : fichiers(p);
    return /\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom) && !EXCLUS.has(p) ? [p] : [];
  });
}

type Releve = { etiquetes: number; fautes: string[] };

function relever(fichier: string, source = readFileSync(fichier, 'utf8')): Releve {
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, fichier.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const releve: Releve = { etiquetes: 0, fautes: [] };
  const ou = (n: ts.Node) => `${fichier}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const nu = (n: ts.Node) => ts.isTemplateExpression(n) && !ts.isTaggedTemplateExpression(n.parent);

  const visiter = (n: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(n) && n.tag.getText(sf) === 'cheminApi') releve.etiquetes += 1;

    // Un chemin d'API interpolé hors du constructeur.
    if (nu(n) && ((n as ts.TemplateExpression).head.text.startsWith('/api/') || (n as ts.TemplateExpression).head.text === '/api')) {
      releve.fautes.push(`${ou(n)} gabarit /api sans cheminApi`);
    }
    // Le chemin passé à un appel de l'API, interpolé hors du constructeur.
    if (ts.isCallExpression(n) && n.expression.getText(sf) in APPELS) {
      const arg = n.arguments[APPELS[n.expression.getText(sf)]];
      if (arg && nu(arg) && (arg as ts.TemplateExpression).head.text.startsWith('/')) {
        releve.fautes.push(`${ou(arg)} chemin d'appel interpolé sans cheminApi`);
      }
    }
    // Un chemin d'API concaténé : `'/api/x/' + id`.
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken
      && ts.isStringLiteralLike(n.left) && n.left.text.startsWith('/api/')) {
      releve.fautes.push(`${ou(n)} chemin d'API concaténé`);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return releve;
}

describe('garde — les chemins d\'API interpolés passent par cheminApi', () => {
  const releves = RACINES.flatMap(fichiers).map((f) => relever(f));

  it('trouve les chemins étiquetés (sans quoi la garde ne garderait rien)', () => {
    expect(releves.reduce((n, r) => n + r.etiquetes, 0)).toBeGreaterThanOrEqual(330);
  });

  it('aucun chemin interpolé ni concaténé hors du constructeur', () => {
    expect(releves.flatMap((r) => r.fautes)).toEqual([]);
  });

  it('reconnaît chaque forme fautive (auto-épreuve, sur la fonction de la garde)', () => {
    const fautes = (code: string) => relever('essai.ts', code).fautes.length;
    expect(fautes('apiRequest(`/api/customers/${id}/notes`);')).toBeGreaterThan(0);
    expect(fautes('const p = `/api/customers/${id}`;')).toBe(1);
    expect(fautes("apiRequest('/api/kpi-configs/' + id);")).toBe(1);
    expect(fautes('apiFetch(`/public/agents/${slug}`);')).toBe(1);
    expect(fautes('useApiQuery(cle, `/api/leases/${id}`);')).toBeGreaterThan(0);
    expect(fautes('apiRequest(cheminApi`/api/customers/${id}/notes`);')).toBe(0);
    expect(fautes('useApiQuery(cle, cheminApi`/api/leases/${id}`);')).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Épreuve : l'action de la sonde
// ──────────────────────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals();
});

function espion() {
  const fetchMock = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: { id: 1, body: 'note', token: 'SECRET-IMP-TOKEN' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('épreuve — createCustomerNoteAction', () => {
  it.each(SONDE.filter((v) => v !== ''))('%j : rien ne part vers l\'API, aucun jeton ne revient', async (valeur) => {
    const fetchMock = espion();
    const resultat = await createCustomerNoteAction(valeur as unknown as number, 'note de sonde');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(resultat.ok).toBe(false);
    expect(JSON.stringify(resultat)).not.toContain('SECRET-IMP-TOKEN');
  });

  it('témoin : un identifiant ordinaire part sur /api/customers/{id}/notes', async () => {
    const fetchMock = espion();
    const resultat = await createCustomerNoteAction(12, 'note');

    expect(resultat.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/customers\/12\/notes$/);
  });
});
