import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import messages from '@/messages/fr.json';
import { PropertyCharacteristics } from '../PropertyCharacteristics';
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
    id: 1,
    type: 'apartment',
    contract_type: 'rent',
    type_label: 'Appartement',
    contract_type_label: 'À louer',
    rent_period_label: 'Par mois',
    status_label: 'Disponible',
    title_type_label: null,
    floor_number: null,
    total_floors: null,
    year_built: null,
    parking_spaces: null,
    furnished: false,
    ...patch,
  } as never;
}

function rendre(property: PropertyDetail) {
  return render(<PropertyCharacteristics property={property} />, { wrapper });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('date de disponibilité sur la fiche publique (TCK-489)', () => {
  it('AC1 — un bien en location affiche sa date, formatée dans la langue de la page', () => {
    rendre(bien({ available_from: '2099-09-15' }));
    expect(screen.getByText('Disponibilité')).toBeInTheDocument();
    expect(screen.getByText(/à partir du 15 sept\. 2099/i)).toBeInTheDocument();
  });

  it('AC2 — le même bien en vente ne l’affiche pas', () => {
    rendre(bien({ contract_type: 'sale', available_from: '2099-09-15' }));
    expect(screen.queryByText('Disponibilité')).not.toBeInTheDocument();
  });

  it('AC3 — une date déjà passée se lit « immédiatement »', () => {
    rendre(bien({ available_from: '2020-01-01' }));
    expect(screen.getByText('Immédiatement')).toBeInTheDocument();
    expect(screen.queryByText(/2020/)).not.toBeInTheDocument();
  });

  it('AC4 — une clé nulle ne rend ni ligne vide, ni tiret, ni « null »', () => {
    const { container } = rendre(bien({ available_from: null }));
    expect(screen.queryByText('Disponibilité')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/null/i);
  });

  it('AC4 — une clé ABSENTE non plus', () => {
    const sansCle = bien();
    delete (sansCle as unknown as Record<string, unknown>).available_from;
    const { container } = rendre(sansCle);
    expect(screen.queryByText('Disponibilité')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/null|undefined/i);
  });

  it('le statut foncier, lui, reste affiché — TCK-464 l’avait déjà branché', () => {
    rendre(bien({ title_type_label: 'Bail' }));
    expect(screen.getByText('Titre foncier')).toBeInTheDocument();
    expect(screen.getByText('Bail')).toBeInTheDocument();
  });
});
