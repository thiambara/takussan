import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

/**
 * TCK-2988 (décision 2b du porteur, 2026-11-21) — l'en-tête de `/app/properties/new` au téléphone, compacté comme
 * celui de `/publish` (maquette « L'écran économe ») :
 *
 * - sous `sm`, l'intention et le résumé de l'annonce dessous prennent la place de la marque ;
 * - « Aperçu » y est un œil de 44 px, et la barre d'aperçu sous l'en-tête n'y est plus rendue (`max-sm:hidden`) ;
 * - « Enregistrer et quitter » se lit « Quitter » au téléphone (l'intention tenait en 124 px à 390), son nom
 *   accessible reste entier ;
 * - dès `sm`, rien ne change.
 *
 * Harnais de `PropertyWizard.test.tsx`.
 */

const routeur = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));
vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));
vi.mock('@/components/map/LocationPickerMapLoader', () => ({ LocationPickerMapLoader: () => <div data-testid="carte" /> }));
vi.mock('@/components/providers/UserLocationProvider', () => ({ useUserLocation: () => ({ location: null, loading: false }) }));
const brouillon = vi.hoisted(() => ({
  etat: {
    isLoading: false,
    isSaving: false,
    error: null as Error | null,
    draft: null as { step: number; data: Record<string, unknown> | null } | null,
    save: vi.fn(),
    flush: vi.fn(async () => ({ ok: true, ecrit: true })),
    clear: vi.fn(async () => undefined),
  },
}));
vi.mock('@/hooks/useWizardDraft', () => ({ useWizardDraft: () => brouillon.etat }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));
vi.mock('@/app/actions/publish-property', () => ({ publishPropertyAction: vi.fn() }));
vi.mock('@/app/actions/property-contacts', () => ({ replacePropertyContactsAction: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

import { PropertyWizard } from '../PropertyWizard';

const W = frMessages.property.wizard;

beforeEach(() => {
  brouillon.etat.draft = null;
});

function monter() {
  render(withIntl(<PropertyWizard tags={[]} />));
  return screen.getByRole('banner');
}

describe('TCK-2988 (2b) — l’en-tête de /app/properties/new au téléphone', () => {
  it('l’intention et le résumé dessous, sous `sm` ; la marque, dès `sm`', async () => {
    const user = userEvent.setup();
    const entete = monter();
    await user.click(screen.getByRole('radio', { name: /^studio$/i }));
    await user.click(screen.getByRole('radio', { name: /^louer$/i }));

    const ligne = entete.querySelector('[data-sous-titre-d-entree]')!;
    await waitFor(() => expect(ligne).toHaveTextContent('Studio · En location · Prix à venir'));
    const bloc = ligne.parentElement!;
    expect(bloc).toHaveClass('sm:hidden', 'flex-1', 'min-w-0');
    expect(bloc.firstElementChild).toHaveTextContent(W.header.publish);
    // ADR-0133 — en saisie, 44 px, sans la ligne du résumé.
    expect(entete).toHaveClass('h-14', 'max-sm:saisie:h-11');
    expect(ligne).toHaveClass('saisie:hidden');
    // La marque reste, au-delà du téléphone.
    expect(within(entete).getAllByText(frMessages.common.appName)[0]!.closest('.max-sm\\:hidden')).not.toBeNull();
  });

  it('« Aperçu » : un œil de 44 px dans l’en-tête, qui ouvre le tiroir ; la barre dessous ne paraît plus sous `sm`', async () => {
    const user = userEvent.setup();
    const entete = monter();
    const apercus = screen.getAllByTestId('barre-apercu');
    expect(apercus).toHaveLength(2);
    const oeil = within(entete).getByTestId('barre-apercu');
    expect(oeil).toHaveClass('size-11');
    expect(oeil.parentElement).toHaveClass('sm:hidden');
    const barre = apercus.find((a) => !entete.contains(a))!;
    expect(barre.parentElement).toHaveClass('max-sm:hidden');

    await user.click(oeil);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('« Enregistrer et quitter » se lit « Quitter » au téléphone, et garde son nom entier', () => {
    const entete = monter();
    const bouton = within(entete).getByRole('button', { name: W.resumeLater });
    expect(within(bouton).getByText(W.resumeLaterShort)).toHaveClass('sm:hidden');
    expect(within(bouton).getByText(W.resumeLater)).toHaveClass('max-sm:hidden');
  });
});
