import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { CompareFloatingBar } from '../CompareFloatingBar';
import { CompareProvider } from '@/context/CompareContext';
import { COMPARE_STORAGE_KEY, type ComparePreview } from '@/lib/compare';
import messages from '@/messages/fr.json';

/**
 * ⚠ Le substitut RÉÉMET TOUTES ses props, et ce n'est pas de la commodité. La version
 * précédente en énumérait quatre : `tabIndex` n'en faisait pas partie, et une assertion sur
 * le retrait du parcours de tabulation lisait `null` sur un composant qui posait bien
 * l'attribut. *Un substitut qui filtre les props mesure le substitut.*
 */
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * `next/image` demande une configuration de chargeur que jsdom n'a pas. Le substitut rend
 * un `<img>` NU — ce qui suffit : ce fichier garde ce que la barre AFFICHE, pas ce que
 * l'optimiseur de Next en fait.
 */
vi.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- c'est le SUBSTITUT de next/image.
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const APERCU: Record<number, ComparePreview> = {
  10: { title: 'Villa à Ngor', slug: 'villa-ngor', photo: 'https://placehold.co/80' },
  20: { title: 'Duplex aux Almadies', slug: 'duplex-almadies', photo: null },
};

/**
 * La sélection est SEMÉE DANS LE STOCKAGE, jamais par des `add()` successifs : `add` se
 * referme sur les ids de son rendu, si bien qu'une boucle dans un seul effet n'en ajoute
 * qu'un. Semer par le stockage exerce en prime le chemin de lecture réel — celui d'un
 * visiteur qui change de page avec une sélection en cours.
 */
function semer(ids: readonly number[], previews?: Record<number, ComparePreview>) {
  localStorage.setItem(
    COMPARE_STORAGE_KEY,
    JSON.stringify({
      ids: [...ids],
      previews: Object.fromEntries(ids.filter((id) => previews?.[id]).map((id) => [id, previews![id]])),
      updated_at: Date.now(),
    }),
  );
}

function wrap(ids: readonly number[], previews?: Record<number, ComparePreview>) {
  semer(ids, previews);
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      <CompareProvider>
        <CompareFloatingBar />
      </CompareProvider>
    </NextIntlClientProvider>
  );
}

describe('<CompareFloatingBar>', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is hidden when the selection is empty', () => {
    render(wrap([]));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('renders the count and CTA once ids are selected', async () => {
    render(wrap([1, 2]));
    await screen.findByRole('complementary');
    expect(screen.getByText(/Comparer \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 biens sélectionnés sur 4/)).toBeInTheDocument();
  });

  it('links to /compare?ids=... when 2+ ids are selected', async () => {
    render(wrap([3, 4]));
    const link = (await screen.findByText(/Comparer \(2\)/)).closest('a');
    // TCK-434 : le lien porte la langue. `LienLocalise` la pose depuis le contexte next-intl —
    // la chaîne de requête traverse intacte, ce qui est le point que ce test garde vraiment.
    expect(link).toHaveAttribute('href', '/fr/compare?ids=3,4');
  });

  /**
   * Le bouton grisé DIT ce qui manque au lieu d'être une impasse silencieuse — et il ne
   * doit pas être atteignable au clavier, sans quoi la tabulation s'arrête sur un lien
   * qui ne mène nulle part.
   */
  it('annonce la condition manquante — et se retire du parcours — sous 2 biens', async () => {
    render(wrap([5]));
    const cta = (await screen.findByText('Ajoutez un 2ᵉ bien')).closest('a')!;
    expect(cta).toHaveAttribute('aria-disabled', 'true');
    expect(cta).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByText(/Comparer \(1\)/)).not.toBeInTheDocument();
  });

  /**
   * LE POINT DE CE LOT : la barre montrait `#183`, l'identifiant de base. Elle montre
   * désormais la photo et le titre, et le nom accessible du bouton de retrait NOMME le bien.
   */
  it('montre la photo et le titre du bien, pas son identifiant de base', async () => {
    render(wrap([10, 20], APERCU));
    await screen.findByRole('complementary');

    const villa = screen.getByRole('button', { name: 'Retirer « Villa à Ngor » du comparateur' });
    expect(villa).toHaveAttribute('title', 'Villa à Ngor');
    expect(villa.querySelector('img')).toHaveAttribute('src', 'https://placehold.co/80');

    // Sans photo, le repli est l'INITIALE du titre — jamais un identifiant.
    const duplex = screen.getByRole('button', { name: 'Retirer « Duplex aux Almadies » du comparateur' });
    expect(duplex).toHaveTextContent('D');

    expect(screen.queryByText('#10')).not.toBeInTheDocument();
    expect(screen.queryByText('#20')).not.toBeInTheDocument();
  });

  /**
   * Le repli par identifiant reste EXERCÉ : une sélection venue d'une URL partagée n'a
   * aucun aperçu, et quatre boutons homonymes seraient indistinguables à la voix.
   */
  it('retombe sur l’identifiant quand aucun aperçu n’a été gardé', async () => {
    render(wrap([7, 8]));
    await screen.findByRole('complementary');
    expect(
      screen.getByRole('button', { name: /Retirer le bien #7 du comparateur/i }),
    ).toBeInTheDocument();
  });

  it('removes a bien when clicking its thumbnail', async () => {
    const user = userEvent.setup();
    render(wrap([10, 20], APERCU));
    await screen.findByRole('complementary');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Retirer « Villa à Ngor » du comparateur' }));
    });

    expect(
      screen.queryByRole('button', { name: 'Retirer « Villa à Ngor » du comparateur' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retirer « Duplex aux Almadies » du comparateur' }),
    ).toBeInTheDocument();
  });

  it('clears the whole comparator via the clear button', async () => {
    const user = userEvent.setup();
    render(wrap([1, 2, 3]));
    await screen.findByRole('complementary');

    const clearBtn = screen.getByRole('button', { name: /Vider le comparateur/i });
    await act(async () => {
      await user.click(clearBtn);
    });

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
