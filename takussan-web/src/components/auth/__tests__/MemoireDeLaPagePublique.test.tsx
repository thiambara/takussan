/**
 * La mémoire de la dernière page publique — TCK-568, M2 (revue du 2026-09-23).
 *
 * C'est elle qui donne au retour de l'écran de connexion sa destination quand l'historique ne se
 * lit pas (pas de Navigation API) ou ne mène pas au site public (après une déconnexion) : sans
 * elle, le lien retombait sur l'accueil — la plainte du testeur.
 */
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/fr/properties';
let parametres = new URLSearchParams('type=office&contract_type=rent');

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => parametres,
}));

import { MemoireDeLaPagePublique } from '../MemoireDeLaPagePublique';
import { CLE_PAGE_PUBLIQUE, pagePubliqueMemorisee } from '../page-publique-memorisee';

function visiter(chemin: string, requete = '') {
  pathname = chemin;
  parametres = new URLSearchParams(requete);
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('ce qu’elle retient', () => {
  it('une recherche du site public, AVEC ses filtres', () => {
    visiter('/fr/properties', 'type=office&contract_type=rent');
    render(<MemoireDeLaPagePublique />);
    expect(pagePubliqueMemorisee()).toBe('/fr/properties?type=office&contract_type=rent');
  });

  it('la page suivante remplace la précédente', () => {
    visiter('/fr/properties', 'type=office');
    const vue = render(<MemoireDeLaPagePublique />);
    visiter('/fr/properties/villa-a-fann');
    vue.rerender(<MemoireDeLaPagePublique />);
    expect(pagePubliqueMemorisee()).toBe('/fr/properties/villa-a-fann');
  });

  it.each(['/auth/login', '/app/messages', '/admin/users', '/onboarding/intention', '/api/auth/me'])(
    '%s n’efface pas la dernière page publique',
    (chemin) => {
      visiter('/fr/agents');
      const vue = render(<MemoireDeLaPagePublique />);
      visiter(chemin);
      vue.rerender(<MemoireDeLaPagePublique />);
      expect(pagePubliqueMemorisee()).toBe('/fr/agents');
    },
  );
});

describe('ce qu’elle rend', () => {
  it('rien quand l’onglet n’a vu aucune page publique', () => {
    expect(pagePubliqueMemorisee()).toBeNull();
  });

  it('une valeur falsifiée dans le stockage est refiltrée à la lecture', () => {
    window.sessionStorage.setItem(CLE_PAGE_PUBLIQUE, '/\\evil.tld');
    expect(pagePubliqueMemorisee()).toBeNull();
    window.sessionStorage.setItem(CLE_PAGE_PUBLIQUE, '/app/owners');
    expect(pagePubliqueMemorisee()).toBeNull();
  });

  it('un stockage inaccessible (navigation privée, site bloqué) ne casse rien', () => {
    const lecture = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('refusé', 'SecurityError');
    });
    const ecriture = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('refusé', 'SecurityError');
    });
    visiter('/fr/properties', 'type=office');
    expect(() => render(<MemoireDeLaPagePublique />)).not.toThrow();
    expect(pagePubliqueMemorisee()).toBeNull();
    lecture.mockRestore();
    ecriture.mockRestore();
  });
});

describe('elle est montée pour tout le produit', () => {
  // Elle doit survivre à la navigation qui mène à `/auth/login` : le layout racine, seul ancêtre
  // commun du site public et des écrans de connexion. Composant serveur : on en lit le source.
  it('dans le layout racine, une fois', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    expect(source).toMatch(/import \{ MemoireDeLaPagePublique \} from '@\/components\/auth\/MemoireDeLaPagePublique';/);
    expect(source.match(/<MemoireDeLaPagePublique \/>/g)).toHaveLength(1);
  });
});
