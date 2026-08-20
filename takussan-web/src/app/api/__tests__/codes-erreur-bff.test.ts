import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { CODES_ERREUR_BFF } from '@/lib/api';

/**
 * TCK-292 (AC7) — les route handlers de `src/app/api/**` n'ont PAS le droit d'émettre de la prose.
 *
 * Le BFF est du front : le principe non négociable n°5 du dépôt lui interdit d'inventer du texte
 * destiné à l'écran. Il en émettait pourtant **42**, en anglais, répartis sur 22 de ses 31
 * fichiers — dont 18 sur le seul chemin 401. Une session expirée pendant un téléversement KYC
 * affichait « Not authenticated. » en bannière ET en toast, dans une interface française.
 *
 * Rien ne l'avait vu parce que **aucun test ne parcourait ces chemins** : `src/app/api/` n'avait
 * pas un seul fichier de test. C'est ce trou-là que ce fichier bouche, dans les deux sens — le
 * comportement d'un handler, ET la garde statique qui empêche la prose de revenir.
 */

const cookiesMock = vi.hoisted(() => ({ valeur: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookiesMock.valeur ? { value: cookiesMock.valeur } : undefined) }),
}));

const FICHIERS_HANDLERS = globSync('src/app/api/**/route.ts');

describe('garde statique — aucune prose dans les route handlers', () => {
  it('trouve bien les 31 handlers (sans quoi la garde ne garderait rien)', () => {
    expect(FICHIERS_HANDLERS.length).toBeGreaterThanOrEqual(31);
  });

  it.each(FICHIERS_HANDLERS)('%s n\'émet aucun `message:` littéral', (fichier) => {
    const source = readFileSync(fichier, 'utf8');
    // On vise le littéral émis par CE dépôt. Reforwarder `err.data` de Laravel reste permis :
    // ce message-là est déjà localisé par le backend, il ne s'invente pas ici.
    const prose = source.match(/message: *["'`]/g) ?? [];
    expect(prose).toEqual([]);
  });

  it('n\'émet que des codes déclarés dans CODES_ERREUR_BFF', () => {
    const inconnus = new Set<string>();
    for (const fichier of FICHIERS_HANDLERS) {
      const source = readFileSync(fichier, 'utf8');
      for (const m of source.matchAll(/code: '([a-z_]+)'/g)) {
        if (!(CODES_ERREUR_BFF as readonly string[]).includes(m[1])) inconnus.add(m[1]);
      }
    }
    expect([...inconnus]).toEqual([]);
  });
});

describe('chemin 401 — POST /api/me/agent-profiles/[id]/kyc/upload', () => {
  beforeEach(() => { cookiesMock.valeur = undefined; });

  it('rend un CODE, jamais de prose anglaise', async () => {
    const { POST } = await import('../me/agent-profiles/[id]/kyc/upload/route');
    const req = new Request('http://localhost/x', { method: 'POST' });
    const res = await POST(req as never, { params: Promise.resolve({ id: '1' }) });

    expect(res.status).toBe(401);
    const corps = await res.json();
    expect(corps).toEqual({ code: 'unauthenticated' });
    expect(JSON.stringify(corps)).not.toMatch(/authenticated\./i);
  });

  it('rend `invalid_profile_id` sur un id non numérique, une fois le cookie posé', async () => {
    cookiesMock.valeur = 'jeton-de-test';
    const { POST } = await import('../me/agent-profiles/[id]/kyc/upload/route');
    const req = new Request('http://localhost/x', { method: 'POST' });
    const res = await POST(req as never, { params: Promise.resolve({ id: 'abc' }) });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'invalid_profile_id' });
  });
});
