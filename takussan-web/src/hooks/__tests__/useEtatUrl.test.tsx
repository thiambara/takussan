import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * TCK-376 — les tests du support d'état d'URL des consoles.
 *
 * Le test qui compte est `poserFiltres retire TOUJOURS page`. La revue adverse de TCK-363 a
 * relevé que le retour à la page 1 était écrit à la main sur **un écran sur trois** : on filtre
 * depuis la page 7, la file rend vide, l'écran dit « aucun résultat » — et la réponse est page 1.
 * Ici la règle n'est plus une discipline d'appelant, c'est la seule écriture de filtre exposée.
 */

const replace = vi.fn();
let recherche = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(recherche),
}));

import { useEtatUrl } from '../useEtatUrl';

function monte(qs = '') {
  recherche = qs;
  return renderHook(() => useEtatUrl());
}

/** Les paramètres de la dernière URL écrite — l'ordre n'a pas de sens, la présence en a un. */
function derniereUrl(): URLSearchParams {
  const appel = replace.mock.calls.at(-1);
  if (!appel) throw new Error('router.replace n’a pas été appelé');
  return new URLSearchParams(String(appel[0]).replace(/^\?/, ''));
}

describe('useEtatUrl', () => {
  beforeEach(() => {
    replace.mockReset();
    recherche = '';
  });

  describe('lecture', () => {
    it('rend une chaîne vide pour un paramètre absent, et sa valeur sinon', () => {
      const { result } = monte('filter[search]=Dakar');
      expect(result.current.lire('filter[search]')).toBe('Dakar');
      expect(result.current.lire('filter[status]')).toBe('');
    });

    it('ne lit un booléen que sur la valeur « 1 »', () => {
      expect(monte('filter[reported]=1').result.current.lireBooleen('filter[reported]')).toBe(true);
      expect(monte('filter[reported]=0').result.current.lireBooleen('filter[reported]')).toBe(false);
      expect(monte('').result.current.lireBooleen('filter[reported]')).toBe(false);
    });

    // `page` vient de l'URL, donc de l'utilisateur : c'est une chaîne arbitraire, pas un nombre.
    it.each([
      ['', 1],
      ['page=1', 1],
      ['page=7', 7],
      ['page=0', 1],
      ['page=-3', 1],
      ['page=abc', 1],
      ['page=', 1],
    ])('borne la page : « %s » → %i', (qs, attendu) => {
      expect(monte(qs).result.current.page).toBe(attendu);
    });
  });

  describe('poserFiltres — la garde du retour à la page 1', () => {
    it('retire TOUJOURS page, même quand le filtre posé n’a rien à voir', () => {
      const { result } = monte('filter[search]=Dakar&page=7');
      act(() => result.current.poserFiltres({ 'filter[status]': 'pending' }));

      const params = derniereUrl();
      expect(params.get('page')).toBeNull();
      expect(params.get('filter[status]')).toBe('pending');
      // ...et n'emporte pas les autres filtres au passage.
      expect(params.get('filter[search]')).toBe('Dakar');
    });

    it('retire page même quand le filtre est RETIRÉ et non posé', () => {
      const { result } = monte('filter[status]=pending&page=4');
      act(() => result.current.poserFiltres({ 'filter[status]': null }));

      const params = derniereUrl();
      expect(params.get('page')).toBeNull();
      expect(params.get('filter[status]')).toBeNull();
    });

    it('abandonne la sélection : elle désigne une ligne d’une liste qui vient de changer', () => {
      const { result } = monte('selected=42&page=3');
      act(() => result.current.poserFiltres({ 'filter[search]': 'Saly' }));

      expect(derniereUrl().get('selected')).toBeNull();
    });

    it('pose plusieurs filtres d’un coup', () => {
      const { result } = monte('page=2');
      act(() =>
        result.current.poserFiltres({ 'filter[a]': 'x', 'filter[b]': 'y', 'filter[c]': null }),
      );

      const params = derniereUrl();
      expect(params.get('filter[a]')).toBe('x');
      expect(params.get('filter[b]')).toBe('y');
      expect(params.get('filter[c]')).toBeNull();
      expect(params.get('page')).toBeNull();
    });

    it('traite la chaîne vide comme un retrait — un `filter[search]=` ne veut rien dire', () => {
      const { result } = monte('filter[search]=Dakar');
      act(() => result.current.poserFiltres({ 'filter[search]': '' }));

      expect(derniereUrl().has('filter[search]')).toBe(false);
    });
  });

  describe('allerALaPage — le geste inverse', () => {
    it('écrit la page et GARDE les filtres', () => {
      const { result } = monte('filter[search]=Dakar&filter[status]=pending');
      act(() => result.current.allerALaPage(3));

      const params = derniereUrl();
      expect(params.get('page')).toBe('3');
      expect(params.get('filter[search]')).toBe('Dakar');
      expect(params.get('filter[status]')).toBe('pending');
    });

    it('n’écrit pas `page=1` : la page 1 est l’absence de paramètre', () => {
      const { result } = monte('page=4');
      act(() => result.current.allerALaPage(1));

      expect(derniereUrl().has('page')).toBe(false);
    });
  });

  describe('sélection et remise à zéro', () => {
    it('selectionner n’écrit QUE `selected` et laisse la page en place', () => {
      const { result } = monte('filter[search]=Dakar&page=2');
      act(() => result.current.selectionner(17));

      const params = derniereUrl();
      expect(params.get('selected')).toBe('17');
      expect(params.get('page')).toBe('2');
      expect(params.get('filter[search]')).toBe('Dakar');
    });

    it('selectionner(null) retire la sélection', () => {
      const { result } = monte('selected=17');
      act(() => result.current.selectionner(null));
      expect(derniereUrl().has('selected')).toBe(false);
    });

    // `router.replace('')` GARDERAIT la query string courante au lieu de la vider — d'où le
    // « ? » seul, sur le chemin qui retire le dernier paramètre.
    it('écrit « ? » et jamais la chaîne vide quand il ne reste rien', () => {
      const { result } = monte('filter[search]=Dakar');
      act(() => result.current.poserFiltres({ 'filter[search]': null }));
      expect(replace).toHaveBeenLastCalledWith('?');
    });
  });
});
