import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CustomerListFilters } from '../CustomerListFilters';
import { withIntl } from '@/test/intl';

/**
 * Les filtres de la liste des clients (TCK-042, TCK-093 ; refaits par TCK-2590) : Étape, Statut,
 * Étiquettes (menu à cases, compteur, « Tout effacer ») ; chacun passe par l'URL et ramène en page 1.
 */

const mockReplace = vi.fn();
let params = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => params,
}));

const derniere = () => String(mockReplace.mock.calls.at(-1)?.[0] ?? '');

describe('CustomerListFilters', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    params = new URLSearchParams();
  });

  it('renders without tag filter when no crmTags provided', () => {
    render(withIntl(<CustomerListFilters />));
    expect(screen.queryByRole('button', { name: /Étiquettes/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Étape/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Statut/ })).toBeTruthy();
  });

  it('opens the tag menu and toggles a tag into the URL, back to page 1', () => {
    params = new URLSearchParams('page=4');
    render(withIntl(<CustomerListFilters crmTags={[{ id: 1, name: 'vip', color: null }, { id: 2, name: 'prospect', color: null }]} />));
    fireEvent.click(screen.getByRole('button', { name: /Étiquettes/ }));
    expect(screen.getByText('Étiquettes des clients')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'vip' }));
    expect(derniere()).toContain('tags=vip');
    expect(derniere()).not.toContain('page=');
  });

  it('shows the active tag count, the checked boxes and « Tout effacer »', () => {
    params = new URLSearchParams('tags=vip,prospect');
    render(withIntl(<CustomerListFilters crmTags={[{ id: 1, name: 'vip', color: null }, { id: 2, name: 'prospect', color: null }]} />));
    fireEvent.click(screen.getByRole('button', { name: 'Étiquettes · 2' }));
    expect(screen.getByRole('button', { name: 'vip' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Tout effacer' }));
    expect(derniere()).not.toContain('tags=');
  });

  it('l’étape choisie part dans l’URL et quitte la vue « Négociation »', () => {
    params = new URLSearchParams('vue=negociation&page=2');
    render(withIntl(<CustomerListFilters />));
    fireEvent.click(screen.getByRole('button', { name: /Étape/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Qualifié' }));
    expect(derniere()).toContain('pipeline_stage=qualified');
    expect(derniere()).not.toContain('vue=');
    expect(derniere()).not.toContain('page=');
  });

  // TCK-2596 (AC2) — « Prospects » de « Ma journée » arrive avec stage_group=active : le filtre se
  // lit sur « Étape », se compte, et une étape précise ou « Toutes les étapes » le retire.
  it('les étapes en cours (stage_group=active) se lisent sur « Étape » et se retirent', () => {
    params = new URLSearchParams('vue=mes-clients&stage_group=active');
    const { unmount } = render(withIntl(<CustomerListFilters />));
    fireEvent.click(screen.getByRole('button', { name: 'Étape · Prospects actifs' }));
    expect(screen.getByRole('button', { name: 'Prospects actifs' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Qualifié' }));
    expect(derniere()).toContain('pipeline_stage=qualified');
    expect(derniere()).not.toContain('stage_group=');
    expect(derniere()).toContain('vue=mes-clients');
    unmount();

    render(withIntl(<CustomerListFilters />));
    fireEvent.click(screen.getByRole('button', { name: 'Étape · Prospects actifs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toutes les étapes' }));
    expect(derniere()).not.toContain('stage_group=');
    expect(derniere()).not.toContain('pipeline_stage=');
  });

  it('« Prospects actifs » se choisit, et retire l’étape précise', () => {
    params = new URLSearchParams('pipeline_stage=lost&page=3');
    render(withIntl(<CustomerListFilters />));
    fireEvent.click(screen.getByRole('button', { name: /Étape/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Prospects actifs' }));
    expect(derniere()).toContain('stage_group=active');
    expect(derniere()).not.toContain('pipeline_stage=');
    expect(derniere()).not.toContain('page=');
  });

  it('le statut posé se lit sur le filtre, et « Tous les statuts » le retire', () => {
    params = new URLSearchParams('status=inactive');
    render(withIntl(<CustomerListFilters />));
    fireEvent.click(screen.getByRole('button', { name: 'Statut · Inactif' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tous les statuts' }));
    expect(derniere()).not.toContain('status=');
  });
});
