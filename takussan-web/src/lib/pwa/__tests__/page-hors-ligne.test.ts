import { afterEach, describe, expect, it } from 'vitest';

import { FAVORITES_STORAGE_KEY } from '@/lib/favoritesStore';
import { CLE_DES_FAVORIS, SCRIPT_DE_LA_PAGE } from '../service-worker';

/**
 * TCK-598 (AC14) — la page hors ligne relit les favoris LOCAUX depuis les réponses by-ids mises en
 * cache, et rien d'autre : pas de faux contenu, pas d'injection.
 */

const CACHE = 'takussan-favoris-v1';

function monter(reponses: unknown[], favoris: unknown) {
  document.body.innerHTML = `<ul id="favoris"></ul><p id="favoris-vide">vide</p>
    <script id="horsligne-donnees" type="application/json">${JSON.stringify({ langue: 'en', cache: CACHE })}</script>`;
  localStorage.setItem('takussan.favorites', JSON.stringify(favoris));
  const ouverts: string[] = [];
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      open: async (nom: string) => {
        ouverts.push(nom);
        return {
          keys: async () => reponses.map((_, i) => ({ url: `r${i}` })),
          match: async (r: { url: string }) => new Response(JSON.stringify(reponses[Number(r.url.slice(1))])),
        };
      },
    },
  });
  return ouverts;
}

async function executer() {
  await (new Function(`return ${SCRIPT_DE_LA_PAGE}`)() as Promise<void>);
}

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(globalThis, 'caches');
});

describe('page hors ligne — favoris', () => {
  it('lit la même clé que le magasin des favoris', () => {
    expect(CLE_DES_FAVORIS).toBe(FAVORITES_STORAGE_KEY);
  });

  it('liste les favoris présents dans le cache, dans l\'ordre local, avec un lien localisé', async () => {
    const ouverts = monter(
      [{ data: [{ id: 2, slug: 'villa-mermoz', title: 'Villa Mermoz', address: { city: 'Dakar' } }, { id: 9, slug: 'autre', title: 'Pas un favori' }] },
        { data: [{ id: 1, slug: 'studio-yoff', title: 'Studio Yoff' }] }],
      [1, 2, 3],
    );

    await executer();

    expect(ouverts).toEqual([CACHE]);
    const liens = [...document.querySelectorAll('#favoris a')] as HTMLAnchorElement[];
    expect(liens.map((a) => a.textContent)).toEqual(['Studio Yoff', 'Villa Mermoz']);
    expect(liens[1].getAttribute('href')).toBe('/en/properties/villa-mermoz');
    expect(document.getElementById('favoris')!.textContent).toContain('Dakar');
    expect(document.getElementById('favoris')!.textContent).not.toContain('Pas un favori');
    expect((document.getElementById('favoris-vide') as HTMLElement).hidden).toBe(true);
  });

  it('sans favori en cache, le message vide reste et rien n\'est inventé', async () => {
    monter([{ data: [{ id: 9, slug: 'x', title: 'X' }] }], [1]);
    await executer();
    expect(document.querySelectorAll('#favoris li')).toHaveLength(0);
    expect((document.getElementById('favoris-vide') as HTMLElement).hidden).toBe(false);
  });

  it('un titre hostile reste du texte', async () => {
    monter([{ data: [{ id: 1, slug: 'a', title: '<img src=x onerror="window.__pwn=1">' }] }], [1]);
    await executer();
    expect(document.querySelector('#favoris img')).toBeNull();
    expect(document.querySelector('#favoris a')!.textContent).toBe('<img src=x onerror="window.__pwn=1">');
  });

  it('un stockage local corrompu ne casse rien', async () => {
    monter([{ data: [] }], 'pas-un-tableau');
    await executer();
    expect(document.querySelectorAll('#favoris li')).toHaveLength(0);
  });
});
