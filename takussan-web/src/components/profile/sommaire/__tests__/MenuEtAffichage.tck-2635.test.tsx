import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { PreferencesDuMenuProvider } from '@/components/layout/PreferencesDuMenu';
import { MenuEtAffichage } from '../MenuEtAffichage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/profile',
}));
vi.mock('@/app/actions/locale', () => ({ setLocaleAction: vi.fn() }));

/**
 * TCK-2635 — « Menu et affichage » de la vue d'ensemble (bureau) : les gestes de leurs pages, réunis.
 * Le mode de la barre est un réglage de l'appareil (aucune requête) ; le menu par défaut ne se
 * réinitialise que s'il a été changé ; hors de la coque, seules la langue et le fuseau restent.
 */
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function rendre(navigationInitiale?: unknown) {
  return render(
    withIntl(
      <ToastProvider>
        <PreferencesDuMenuProvider navigationInitiale={navigationInitiale} persona="agent" modeIconesInitial="auto">
          <MenuEtAffichage timezone="Africa/Dakar" />
        </PreferencesDuMenuProvider>
      </ToastProvider>,
    ),
  );
}

describe('MenuEtAffichage (TCK-2635)', () => {
  it('choisit le mode de la barre sur cet appareil, sans écrire sur le compte', async () => {
    const user = userEvent.setup();
    rendre();

    const groupe = screen.getByRole('radiogroup', { name: 'Barre latérale sur cet appareil' });
    expect(within(groupe).getByRole('radio', { name: 'Automatique' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(groupe).getByRole('radio', { name: 'Icônes' }));
    expect(within(groupe).getByRole('radio', { name: 'Icônes' })).toHaveAttribute('aria-checked', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('« Revenir au menu par défaut » est inerte sur le menu par défaut', () => {
    rendre();
    expect(screen.getByRole('button', { name: 'Revenir au menu par défaut' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('hors de la coque, garde la langue et le fuseau seuls', () => {
    render(withIntl(<MenuEtAffichage timezone="Africa/Dakar" />));
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revenir au menu par défaut' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Langue' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Fuseau horaire' })).toHaveTextContent('Dakar (GMT)');
  });
});
