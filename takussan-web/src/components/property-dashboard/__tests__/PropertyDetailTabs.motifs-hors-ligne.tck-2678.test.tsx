/**
 * TCK-2678 (ADR-0097 § 5), AC4 reformulé le 2026-11-14 — les phrases du motif hors ligne vivent en tête
 * de l'onglet Annonce > Aperçu, sous « Hors ligne » : la maquette retenue de la fiche (app-biens a-2)
 * ne les dessine pas dans l'en-tête, et la maquette b les rattache à l'annonce (« Annonce — Hors ligne »).
 * Les motifs sont ceux de l'API (`offline_reasons`), jamais recomposés du statut ni de la visibilité.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyDetail } from '@/types/property';
import { withIntl } from '@/test/intl';
import { PropertyDetailTabs } from '../PropertyDetailTabs';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('tab=annonce') }));
vi.mock('@/components/property-form/PropertyForm', () => ({ PropertyForm: () => null }));
vi.mock('@/components/property-dashboard/PropertyMediaPanel', () => ({ PropertyMediaPanel: () => null }));
vi.mock('@/components/property-dashboard/PropertyOverviewPanel', () => ({ PropertyOverviewPanel: () => null }));
vi.mock('@/components/property-dashboard/PropertyCollaboratorsPanel', () => ({ PropertyCollaboratorsPanel: () => null }));
vi.mock('@/components/property-dashboard/fiche/BarreDuBien', () => ({ BarreDuBien: () => null }));
vi.mock('@/components/property-dashboard/fiche/OngletDocuments', () => ({ OngletDocuments: () => null, useDocumentsDuBien: () => ({ total: null }) }));
vi.mock('@/lib/queries/maintenance', () => ({ useMaintenanceHistoryForProperty: () => ({ data: undefined }) }));
vi.mock('@/components/contact/ContactsSurPlaceDuBien', () => ({ ContactsSurPlaceDuBien: () => null }));

const bien = (extra: Record<string, unknown>) =>
  ({ id: 9, contract_type: 'rent', rent_period: 'monthly', status: 'rented', visibility: 'public', photos: [], price_history: [], ...extra }) as unknown as PropertyDetail;

const bloc = () => document.querySelector<HTMLElement>('[data-slot="annonce-hors-ligne"]');

describe('TCK-2678 — l’onglet Annonce dit pourquoi le bien est hors ligne', () => {
  it('AC4 — un bien loué : « Loué — … » sous « Hors ligne », en tête de l’aperçu, sans « Publié »', () => {
    render(withIntl(<PropertyDetailTabs property={bien({ is_online: false, offline_reasons: ['status_rented'] })} tags={[]} />));
    const section = bloc();
    expect(section).not.toBeNull();
    const liste = section!.querySelector('[data-slot="motifs-hors-ligne"]');
    expect(liste).toHaveTextContent('Loué — remis en ligne à la fin du bail.');
    expect(liste?.previousElementSibling?.textContent ?? '').toContain('Hors ligne');
    expect(document.body.textContent).not.toMatch(/Publié/);
  });

  it('plusieurs motifs dans l’ordre de l’API ; un code inconnu se dit « Hors ligne. »', () => {
    render(withIntl(<PropertyDetailTabs property={bien({ is_online: false, offline_reasons: ['private', 'nouveau_code'] })} tags={[]} />));
    const phrases = Array.from(bloc()!.querySelectorAll('[role="listitem"]')).map((li) => li.textContent);
    expect(phrases).toEqual(['Privé — rendez-le public pour le mettre en ligne.', 'Hors ligne.']);
  });

  it('rien pour un bien en ligne, même si une liste de motifs traîne dans la réponse', () => {
    render(withIntl(<PropertyDetailTabs property={bien({ is_online: true, offline_reasons: ['private'] })} tags={[]} />));
    expect(bloc()).toBeNull();
    expect(screen.queryByText(/rendez-le public/)).toBeNull();
  });
});
