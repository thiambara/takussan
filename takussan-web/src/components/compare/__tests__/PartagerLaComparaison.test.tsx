import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { PartagerLaComparaison } from '../PartagerLaComparaison';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import messages from '@/messages/fr.json';

/**
 * TCK-2509 — « Partager » la comparaison : la feuille de partage du téléphone quand elle existe,
 * sinon la copie du lien `?ids=`, DITE par un toast (AC4).
 */

function rendre() {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      <ToastProvider>
        <PartagerLaComparaison chemin="/fr/compare?ids=11,13" count={2} />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const LIEN = `${window.location.origin}/fr/compare?ids=11,13`;

function poser(cle: 'share' | 'clipboard', valeur: unknown) {
  Object.defineProperty(navigator, cle, { value: valeur, configurable: true, writable: true });
}

async function cliquer() {
  await act(async () => {
    screen.getByRole('button', { name: 'Partager' }).click();
  });
}

afterEach(() => {
  // jsdom n'a ni l'une ni l'autre : on les retire pour le test suivant.
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe('<PartagerLaComparaison>', () => {
  it('AC4 — sans `navigator.share`, « Partager » copie le lien et le dit', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    poser('clipboard', { writeText });
    expect('share' in navigator).toBe(false);

    rendre();
    await cliquer();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(LIEN);
    expect(await screen.findByText('Lien copié')).toBeInTheDocument();
  });

  it('avec `navigator.share`, la feuille de partage reçoit le lien `?ids=` — rien n’est copié', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    poser('share', share);
    poser('clipboard', { writeText });

    rendre();
    await cliquer();

    expect(share).toHaveBeenCalledExactlyOnceWith({
      title: 'Comparaison de biens',
      text: '2 biens à comparer sur Takussan',
      url: LIEN,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText('Lien copié')).toBeNull();
  });

  it('le visiteur qui referme la feuille n’obtient ni copie ni avis', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('fermée'), { name: 'AbortError' }));
    const writeText = vi.fn();
    poser('share', share);
    poser('clipboard', { writeText });

    rendre();
    await cliquer();

    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText('Lien copié')).toBeNull();
  });

  it('une feuille qui échoue autrement retombe sur la copie', async () => {
    poser('share', vi.fn().mockRejectedValue(Object.assign(new Error('refus'), { name: 'NotAllowedError' })));
    const writeText = vi.fn().mockResolvedValue(undefined);
    poser('clipboard', { writeText });

    rendre();
    await cliquer();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(LIEN);
    expect(await screen.findByText('Lien copié')).toBeInTheDocument();
  });

  /**
   * Revue adverse : un presse-papiers PRÉSENT qui refuse (contexte non sûr, permission) — sans
   * `await`, le refus passait inaperçu et la page annonçait « Lien copié » sur un échec.
   */
  it('un presse-papiers qui refuse : jamais « Lien copié », le lien est montré', async () => {
    const writeText = vi.fn().mockRejectedValue(Object.assign(new Error('refus'), { name: 'NotAllowedError' }));
    poser('clipboard', { writeText });

    rendre();
    await cliquer();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(LIEN);
    expect(await screen.findByText('Copie impossible — voici le lien à copier')).toBeInTheDocument();
    expect(screen.queryByText('Lien copié')).toBeNull();
  });

  it('sans presse-papiers non plus, le lien est montré pour être copié à la main', async () => {
    rendre();
    await cliquer();
    expect(await screen.findByText('Copie impossible — voici le lien à copier')).toBeInTheDocument();
    expect(screen.getByText(LIEN)).toBeInTheDocument();
  });
});
