import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

import { PartagerLaFiche } from '../PartagerLaFiche';

/**
 * TCK-2522 / TCK-2523 — « Partager » dit toujours ce qu'il a fait : la feuille du système, ou le lien
 * copié, ou (revue du 2026-11-09) son échec quand il ne peut ni l'un ni l'autre — contexte non
 * sécurisé, presse-papiers refusé. Un bouton muet laisse croire qu'il a marché.
 */
function definirNavigateur(share: unknown, clipboard: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true, writable: true });
}

afterEach(() => {
  definirNavigateur(undefined, undefined);
});

describe('PartagerLaFiche', () => {
  it('sans feuille de partage : le lien est copié, et le bouton le dit', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    definirNavigateur(undefined, { writeText });
    render(withIntl(<PartagerLaFiche nom="Dakar Immo" />));

    await userEvent.click(screen.getByRole('button', { name: 'Partager la fiche de Dakar Immo' }));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByText('Lien copié')).toBeInTheDocument();
  });

  it('ni feuille ni presse-papiers : l’échec est dit, à l’écran et à la lecture', async () => {
    definirNavigateur(undefined, { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
    render(withIntl(<PartagerLaFiche nom="Dakar Immo" />));

    await userEvent.click(screen.getByRole('button', { name: 'Partager la fiche de Dakar Immo' }));

    const message = await screen.findByText('Partage impossible ici : copiez l’adresse de la page.');
    expect(message).toBeVisible();
    expect(message.closest('[aria-live]')).not.toBeNull();
  });

  it('presse-papiers absent (contexte non sécurisé) : même message', async () => {
    definirNavigateur(undefined, undefined);
    render(withIntl(<PartagerLaFiche nom="Dakar Immo" />));

    await userEvent.click(screen.getByRole('button', { name: 'Partager la fiche de Dakar Immo' }));

    expect(await screen.findByText('Partage impossible ici : copiez l’adresse de la page.')).toBeInTheDocument();
  });

  it('la feuille abandonnée n’est pas un échec : rien n’est dit, rien n’est copié', async () => {
    const writeText = vi.fn();
    const abandon = Object.assign(new Error('abandon'), { name: 'AbortError' });
    definirNavigateur(vi.fn().mockRejectedValue(abandon), { writeText });
    render(withIntl(<PartagerLaFiche nom="Dakar Immo" />));

    await userEvent.click(screen.getByRole('button', { name: 'Partager la fiche de Dakar Immo' }));

    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText(/Partage impossible/)).not.toBeInTheDocument();
    expect(screen.queryByText('Lien copié')).not.toBeInTheDocument();
  });
});
