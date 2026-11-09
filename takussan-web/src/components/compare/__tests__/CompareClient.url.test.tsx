import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { CompareClient } from '../CompareClient';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import { COMPARE_STORAGE_KEY, readCompare } from '@/lib/compare';
import messages from '@/messages/fr.json';
import type { PropertyDetail } from '@/types/property';
import { makeProperty } from './bien-de-test';
import {
  ADRESSES_RETENUES,
  CLE_ADRESSES_ECRITES,
  adressesEcrites,
  estAdresseEcrite,
  retenirAdresse,
} from '../adresses-ecrites';

/**
 * TCK-2509 — l'URL `?ids=` FAIT FOI sur `/compare`, et un bien indisponible quitte la comparaison.
 *
 * Relevé de l'audit UX (2026-11, § 6) : ouverte avec `?ids=857,93,11`, la page affichait les trois
 * biens et l'adresse devenait `?ids=530` — le panier local réécrivait l'URL. Un lien partagé
 * montrait autre chose chez le destinataire.
 */

// L'adresse est la VRAIE adresse de jsdom : `useSearchParams` la relit à chaque rendu, comme Next
// le fait après un `history.replaceState`.
vi.mock('next/navigation', () => ({
  usePathname: () => '/fr/compare',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
function adresse(recherche: string) {
  window.history.replaceState(null, '', `/fr/compare${recherche ? `?${recherche}` : ''}`);
}
let remplacer: ReturnType<typeof vi.spyOn>;
vi.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- doublure de `next/image` dans un test.
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));

/** La réponse du comparatif : les biens demandés que l'API rend, sauf ceux de `indisponibles`. */
const api = vi.hoisted(() => ({ indisponibles: [] as number[], retard: null as number[] | null }));
vi.mock('@/hooks/useCompare', () => ({
  useCompare: (ids: readonly number[]) => {
    // `retard` : la réponse porte encore une demande ANTÉRIEURE (le chargement d'un ajout).
    const demandes = api.retard ?? [...ids];
    const rendus = demandes.filter((id) => !api.indisponibles.includes(id));
    return {
      properties: rendus.map((id) => bien(id)),
      loading: false,
      error: null,
      requestedIds: demandes,
      returnedIds: rendus,
    };
  },
}));

function bien(id: number): PropertyDetail {
  return makeProperty({ id, slug: `bien-${id}`, title: `Bien ${id}`, price: 100_000 * id });
}

function rendre() {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      <ToastProvider>
        <CompareProvider>
          <CompareClient />
        </CompareProvider>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

function selection(ids: number[], previews: Record<number, { title: string; slug: string; photo: null }> = {}) {
  localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify({ ids, previews, updated_at: Date.now() }));
}

function colonnes(): string[] {
  return within(screen.getByTestId('compare-en-tete'))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? '');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  adresse('ids=11,12,13');
  remplacer = vi.spyOn(window.history, 'replaceState');
  api.indisponibles = [];
  api.retard = null;
});
afterEach(() => {
  remplacer.mockRestore();
  localStorage.clear();
});

describe('<CompareClient> — l’URL fait foi (AC3)', () => {
  it('un lien partagé montre SES biens, et la sélection locale le suit sans réécrire l’URL', () => {
    selection([530]);
    rendre();
    expect(colonnes()).toEqual(['Retirer Bien 11', 'Retirer Bien 12', 'Retirer Bien 13']);
    expect(readCompare().ids).toEqual([11, 12, 13]);
    expect(remplacer, 'l’URL d’un lien partagé ne doit jamais être réécrite par le panier').not.toHaveBeenCalled();
    expect(window.location.search).toBe('?ids=11,12,13');
  });

  it('retirer le deuxième bien donne une URL sans lui, et la recharger montre la même comparaison', async () => {
    const premiere = rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Bien 12' }));
    expect(window.location.search).toBe('?ids=11,13');
    expect(readCompare().ids).toEqual([11, 13]);
    expect(colonnes()).toEqual(['Retirer Bien 11', 'Retirer Bien 13']);

    // Le rechargement : la même adresse, une page neuve.
    premiere.unmount();
    remplacer.mockClear();
    const seconde = rendre();
    expect(colonnes()).toEqual(['Retirer Bien 11', 'Retirer Bien 13']);
    expect(readCompare().ids).toEqual([11, 13]);
    expect(remplacer).not.toHaveBeenCalled();

    // Le même lien, ouvert ailleurs (autre appareil : ni sélection, ni historique) : même comparaison.
    seconde.unmount();
    localStorage.clear();
    sessionStorage.clear();
    rendre();
    expect(colonnes()).toEqual(['Retirer Bien 11', 'Retirer Bien 13']);
    expect(readCompare().ids).toEqual([11, 13]);
    expect(window.location.search).toBe('?ids=11,13');
  });

  it('deux retraits coup sur coup : le second part de l’adresse laissée par le premier', async () => {
    adresse('ids=11,12,13,14');
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Bien 12' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Bien 14' }));
    expect(window.location.search).toBe('?ids=11,13');
    expect(readCompare().ids).toEqual([11, 13]);
  });

  it('sans `?ids=`, la sélection locale s’affiche et s’inscrit dans l’URL', () => {
    adresse('');
    selection([21, 22]);
    rendre();
    expect(colonnes()).toEqual(['Retirer Bien 21', 'Retirer Bien 22']);
    expect(window.location.search).toBe('?ids=21,22');
  });
});

describe('<CompareClient> — un bien indisponible quitte la comparaison', () => {
  it('il sort de l’URL et de la sélection, avec un avis qui le nomme et « Biens proches »', async () => {
    selection([11, 12, 13], { 12: { title: 'Studio meublé près de la VDN', slug: 'studio-vdn', photo: null } });
    api.indisponibles = [12];
    await act(async () => {
      rendre();
    });

    const avis = screen.getByRole('status');
    expect(avis).toHaveTextContent('Studio meublé près de la VDN n’est plus disponible : il a quitté la comparaison.');
    expect(within(avis).getByRole('link', { name: 'Biens proches' }).getAttribute('href')).toContain('/properties/studio-vdn');

    expect(window.location.search).toBe('?ids=11,13');
    expect(readCompare().ids).toEqual([11, 13]);
    // Il n'occupe plus une place : deux colonnes, et une place libre de plus.
    expect(colonnes()).toEqual(['Retirer Bien 11', 'Retirer Bien 13']);
  });

  it('venu d’un lien partagé (sans titre connu), l’avis le dit sans le nommer', async () => {
    api.indisponibles = [12];
    await act(async () => {
      rendre();
    });
    const avis = screen.getByRole('status');
    expect(avis).toHaveTextContent('Un bien n’est plus disponible : il a quitté la comparaison.');
    expect(within(avis).getByRole('link', { name: 'Biens proches' }).getAttribute('href')).toMatch(/\/properties$/);
  });

  it('un bien qui manque à une réponse ANTÉRIEURE (en cours de chargement) n’est pas annoncé', async () => {
    // La réponse porte encore la demande d'avant (le visiteur vient de retirer le 14, absent d'elle) :
    // elle ne dit rien de la comparaison affichée.
    api.retard = [11, 12, 13, 14];
    api.indisponibles = [14];
    await act(async () => {
      rendre();
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(remplacer).not.toHaveBeenCalled();
    expect(readCompare().ids).toEqual([11, 12, 13]);
  });
});

describe('<CompareClient> — sa propre page d’historique contre un lien partagé (revue adverse)', () => {
  // Rendus SANS StrictMode (le `render` de Testing Library ne l'active pas) : chaque montage joue
  // l'effet UNE fois, comme en production. En dev, le double passage de StrictMode masquait la
  // perte du bien ajouté (contre-vérification, 2026-11-09).
  const apercu13 = { 13: { title: 'Bien 13', slug: 'bien-13', photo: null } };

  /** Une visite de `/compare?<recherche>` dans cet onglet : montée, effet joué, quittée. */
  function visiter(recherche: string) {
    adresse(recherche);
    rendre().unmount();
  }

  it('un Retour : l’adresse écrite par le comparateur cède à la sélection, qui garde le bien ajouté et son aperçu', () => {
    // `?ids=11,12` écrit par le comparateur ; le visiteur est allé ajouter le 13 sur la liste.
    visiter('ids=11,12');
    expect(adressesEcrites()).toEqual(['11,12']);
    selection([11, 12, 13], apercu13);

    adresse('ids=11,12'); // Retour
    rendre();
    expect(colonnes()).toEqual(['Retirer Bien 11', 'Retirer Bien 12', 'Retirer Bien 13']);
    expect(readCompare().ids).toEqual([11, 12, 13]);
    expect(readCompare().previews[13]?.title).toBe('Bien 13');
    expect(window.location.search, 'l’adresse est réécrite pour refléter la sélection').toBe('?ids=11,12,13');
  });

  it('deux Retours : la page la plus ancienne de l’onglet est encore à soi, et le bien ajouté reste', () => {
    // Arrivé par la pastille sur `?ids=11,12` ; « Ajouter un bien » → ajout du 13 → pastille.
    visiter('ids=11,12');
    selection([11, 12, 13], apercu13);
    visiter('ids=11,12,13');
    expect(adressesEcrites()).toEqual(['11,12', '11,12,13']);

    adresse('ids=11,12'); // Retour (la liste), puis Retour (la première page du comparateur)
    rendre();
    expect(colonnes()).toEqual(['Retirer Bien 11', 'Retirer Bien 12', 'Retirer Bien 13']);
    expect(readCompare().ids).toEqual([11, 12, 13]);
    expect(readCompare().previews[13]?.title, 'l’aperçu du bien ajouté survit').toBe('Bien 13');
    expect(window.location.search).toBe('?ids=11,12,13');
  });

  it('un lien partagé dans un onglet vierge l’emporte sur la sélection, et garde l’aperçu d’un bien qui y reste', () => {
    selection([7, 11], { 7: { title: 'Bien 7', slug: 'bien-7', photo: null }, 11: { title: 'Bien 11', slug: 'bien-11', photo: null } });
    adresse('ids=11,12');
    rendre();
    expect(colonnes()).toEqual(['Retirer Bien 11', 'Retirer Bien 12']);
    expect(readCompare().ids).toEqual([11, 12]);
    expect(readCompare().previews[11]?.title, 'le bien 11 reste sélectionné : son aperçu aussi').toBe('Bien 11');
    expect(window.location.search).toBe('?ids=11,12');
    // Désormais, c'est une adresse du comparateur.
    expect(adressesEcrites()).toEqual(['11,12']);
  });

  it('un lien partagé l’emporte même quand l’onglet a écrit d’autres adresses', () => {
    visiter('ids=7,8');
    adresse('ids=11,12');
    rendre();
    expect(colonnes()).toEqual(['Retirer Bien 11', 'Retirer Bien 12']);
    expect(readCompare().ids).toEqual([11, 12]);
  });

  it('un retrait retient l’adresse qu’il écrit', async () => {
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Bien 12' }));
    expect(adressesEcrites()).toContain('11,13');
  });
});

describe('adresses écrites : l’ensemble, borné', () => {
  it('retient les 20 dernières, la plus récente en dernier ; une adresse revue remonte', () => {
    for (let i = 1; i <= 25; i++) retenirAdresse(`${i},${i + 100}`);
    const retenues = adressesEcrites();
    expect(retenues).toHaveLength(ADRESSES_RETENUES);
    expect(retenues[0]).toBe('6,106');
    expect(estAdresseEcrite('5,105')).toBe(false);
    retenirAdresse('6,106');
    expect(adressesEcrites().at(-1)).toBe('6,106');
    expect(adressesEcrites()).toHaveLength(ADRESSES_RETENUES);
  });

  it('un stockage illisible ne retient rien, sans lever', () => {
    sessionStorage.setItem(CLE_ADRESSES_ECRITES, '11,12');
    expect(adressesEcrites()).toEqual([]);
    expect(estAdresseEcrite('11,12')).toBe(false);
  });
});
