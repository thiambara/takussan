import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import messages from '@/messages/fr.json';
import { PropertyOverviewPanel } from '../PropertyOverviewPanel';
import type { PropertyDetail } from '@/types/property';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

function bien(patch: Record<string, unknown> = {}): PropertyDetail {
  return {
    id: 7,
    title: 'Villa Almadies',
    type: 'house',
    contract_type: 'sale',
    price: 85_000_000,
    currency: 'XOF',
    description: null,
    main_photo_url: null,
    title_type: null,
    views_count: 0,
    favorites_count: 0,
    average_rating: null,
    reviews_count: 0,
    price_history: [],
    location: { city: 'Dakar', latitude: null, longitude: null },
    ...patch,
  } as never;
}

function rendre(property: PropertyDetail) {
  return render(<PropertyOverviewPanel property={property} onJumpTo={vi.fn()} />, { wrapper });
}

describe('checklist de l’aperçu — la matrice de pertinence (TCK-488)', () => {
  it('AC1 — une maison propose toujours la tâche « titre foncier »', () => {
    rendre(bien({ type: 'house' }));
    expect(screen.getByText(/renseigner le type de titre foncier/i)).toBeInTheDocument();
  });

  it('AC1 — un appartement ne la propose plus : aucun écran ne permet de la faire', () => {
    rendre(bien({ type: 'apartment' }));
    expect(screen.queryByText(/renseigner le type de titre foncier/i)).not.toBeInTheDocument();
  });

  it('AC1 — le compte de tâches restantes suit : 3 pour un appartement, 4 pour une maison', () => {
    const { unmount } = rendre(bien({ type: 'apartment' }));
    expect(screen.getByText(/3 éléments à compléter/i)).toBeInTheDocument();
    unmount();

    rendre(bien({ type: 'house' }));
    expect(screen.getByText(/4 éléments à compléter/i)).toBeInTheDocument();
  });

  it('un bureau ne la propose pas non plus — le foncier est celui de l’immeuble', () => {
    rendre(bien({ type: 'office' }));
    expect(screen.queryByText(/renseigner le type de titre foncier/i)).not.toBeInTheDocument();
  });
});

describe('date de disponibilité sur l’aperçu (TCK-489)', () => {
  it('AC5 — un bien en location affiche sa date de disponibilité', () => {
    rendre(bien({ contract_type: 'rent', available_from: '2099-09-15' }));
    expect(screen.getByText(/disponibilité/i)).toBeInTheDocument();
    expect(screen.getByText(/15 sept\. 2099/i)).toBeInTheDocument();
  });

  it('AC2 — le même bien en vente ne l’affiche pas', () => {
    rendre(bien({ contract_type: 'sale', available_from: '2099-09-15' }));
    expect(screen.queryByText(/disponibilité/i)).not.toBeInTheDocument();
  });

  it('AC3 — une date passée se lit « immédiatement », pas comme une attente', () => {
    rendre(bien({ contract_type: 'rent', available_from: '2020-01-01' }));
    expect(screen.getByText(/immédiatement/i)).toBeInTheDocument();
    expect(screen.queryByText(/2020/)).not.toBeInTheDocument();
  });

  it('AC4 — une clé nulle et une clé absente ne rendent rien', () => {
    const { unmount } = rendre(bien({ contract_type: 'rent', available_from: null }));
    expect(screen.queryByText(/disponibilité/i)).not.toBeInTheDocument();
    unmount();

    const sansCle = bien({ contract_type: 'rent' });
    delete (sansCle as unknown as Record<string, unknown>).available_from;
    rendre(sansCle);
    expect(screen.queryByText(/disponibilité/i)).not.toBeInTheDocument();
  });
});
