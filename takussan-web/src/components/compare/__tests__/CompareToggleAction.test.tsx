import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { CompareToggleAction } from '../CompareToggleAction';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { COMPARE_MAX_IDS, COMPARE_STORAGE_KEY, readCompare } from '@/lib/compare';
import messages from '@/messages/fr.json';

/**
 * AJOUTER AU COMPARATEUR DEPUIS LA FICHE D'UN BIEN.
 *
 * Le chemin n'existait pas : la pastille de comparaison ne vivait que sur les cartes de
 * liste, alors que l'état vide de `/compare` promettait déjà « depuis la liste ou la fiche
 * d'un bien ». Un visiteur qui lisait une fiche devait revenir en arrière pour l'ajouter.
 */

const APERCU = {
  title: 'Villa à Ngor',
  slug: 'villa-ngor',
  photo: 'https://placehold.co/80',
};

function rendre(propertyId = 42) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      <ToastProvider>
        <CompareProvider>
          <CompareToggleAction propertyId={propertyId} preview={APERCU} />
        </CompareProvider>
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

async function cliquer(nom: RegExp) {
  const user = userEvent.setup();
  await act(async () => {
    await user.click(screen.getByRole('button', { name: nom }));
  });
}

describe('<CompareToggleAction> — le comparateur depuis la fiche', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ajoute le bien à la sélection, et le retire au second clic', async () => {
    rendre(42);

    await cliquer(/Ajouter au comparateur/i);
    expect(readCompare().ids).toEqual([42]);

    // L'état est ANNONCÉ, pas seulement peint : `aria-pressed` bascule.
    expect(screen.getByRole('button', { name: /Retirer du comparateur/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await cliquer(/Retirer du comparateur/i);
    expect(readCompare().ids).toEqual([]);
  });

  /**
   * L'aperçu est ce qui distingue ce lot d'un simple bouton de plus : sans lui, la barre
   * flottante retomberait sur `#42` pour un bien qu'on vient d'ouvrir en grand.
   */
  it('garde le titre et la photo pour la barre flottante', async () => {
    rendre(42);
    await cliquer(/Ajouter au comparateur/i);
    expect(readCompare().previews[42]).toEqual(APERCU);
  });

  it('refuse le cinquième bien sans toucher à la sélection', async () => {
    const pleins = [1, 2, 3, 4];
    expect(pleins).toHaveLength(COMPARE_MAX_IDS);
    localStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify({ ids: pleins, previews: {}, updated_at: Date.now() }),
    );

    rendre(99);
    await cliquer(/Ajouter au comparateur/i);

    expect(readCompare().ids).toEqual(pleins);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  /**
   * TCK-2509 — plus de toast à chaque ajout : la pastille du comparateur (TCK-2493) dit déjà « 3 »,
   * et les toasts s'empilaient sur l'en-tête (audit UX 2026-11, § 6). Le REFUS, lui, se dit encore.
   */
  it('l’ajout ne lève aucun toast', async () => {
    const toasts = () => {
      const zone = document.querySelector('[data-slot="toaster"]');
      expect(zone, 'le Toaster doit être monté : sans lui, « aucun toast » ne prouverait rien').not.toBeNull();
      return zone!.children.length;
    };

    rendre(42);
    await cliquer(/Ajouter au comparateur/i);
    expect(readCompare().ids).toEqual([42]);
    expect(toasts(), 'un ajout réussi ne doit lever aucun toast').toBe(0);
  });

  it('le refus du cinquième bien se dit par un toast', async () => {
    localStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify({ ids: [1, 2, 3, 4], previews: {}, updated_at: Date.now() }),
    );
    rendre(99);
    await cliquer(/Ajouter au comparateur/i);
    expect(await screen.findByText(`Maximum ${COMPARE_MAX_IDS} biens`)).toBeInTheDocument();
  });
});
