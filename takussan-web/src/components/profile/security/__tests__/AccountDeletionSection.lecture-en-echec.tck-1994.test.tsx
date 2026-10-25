/**
 * TCK-1994 (P172.05) — une lecture de la demande de suppression en échec ne se rend plus comme
 * « aucune demande ».
 *
 * Mesuré le 2026-10-23 : `setRequest(result.ok ? result.data : null)` faisait proposer « Supprimer
 * mon compte » quand la lecture échouait, à un compte dont la suppression était peut-être déjà
 * programmée — et une nouvelle demande la reprogramme (`updateOrCreate`). Décision du porteur :
 * afficher le `result.message` existant, sans bouton, aucun texte neuf.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { AccountDeletionSection } from '../AccountDeletionSection';

const lire = vi.hoisted(() => vi.fn());

vi.mock('@/app/actions/account-deletion', () => ({
  getAccountDeletionRequestAction: () => lire(),
  cancelAccountDeletionAction: vi.fn(),
  requestAccountDeletionAction: vi.fn(),
  sendAccountDeletionStepUpCodeAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function monter() {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <AccountDeletionSection twoFactorEnabled={false} hasUsablePassword />
    </NextIntlClientProvider>,
  );
}

describe('AccountDeletionSection — lecture en échec (TCK-1994)', () => {
  it('affiche le message de l’action, sans bouton de demande ni d’annulation', async () => {
    lire.mockResolvedValue({ ok: false, message: 'Impossible de charger la demande.' });
    monter();

    expect(await screen.findByText('Impossible de charger la demande.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer mon compte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /annuler/i })).not.toBeInTheDocument();
  });

  it('sans demande en cours, le bouton reste proposé', async () => {
    lire.mockResolvedValue({ ok: true, data: null });
    monter();

    expect(await screen.findByRole('button', { name: 'Supprimer mon compte' })).toBeInTheDocument();
  });
});
