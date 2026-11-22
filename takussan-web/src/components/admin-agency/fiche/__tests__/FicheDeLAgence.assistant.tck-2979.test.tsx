import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', async () => (await import('./doublures')).navigation);
vi.mock('@/app/actions/admin-agency', async () => (await import('./doublures')).ACTIONS);
vi.mock('@/context/AuthContext', async () => (await import('./doublures')).auth);
vi.mock('@/hooks/useCan', async () => (await import('./doublures')).can);
vi.mock('@/lib/queries/kyc', async () => (await import('./doublures')).KYC);
vi.mock('@/lib/queries/admin-users', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).EQUIPE }));
vi.mock('@/lib/queries/agency-queues', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).fileDeModeration }));

import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';

import { ACTIONS, reinitialiserLesDoublures } from './doublures';
import { AGENCE, enregistrer, rendreLaFiche } from './outils';

/**
 * TCK-2979 (ADR-0131 § 8) — « Assistant de la messagerie » dans les règles de l'agence : deux interrupteurs, vrais par
 * défaut, que l'agence ne peut qu'éteindre. Quand la plateforme coupe (ou qu'aucun fournisseur ne transcrit),
 * l'interrupteur est grisé, sa raison est dite, et rien ne part.
 */

const A = fr.admin.agencyConfig.assistant;
const interrupteur = (libelle: string) => screen.getByRole('switch', { name: new RegExp(`^${libelle}`) });
const copilote = () => interrupteur(A.copilote.label);
const transcription = () => interrupteur(A.transcription.label);
const ouvrir = (autre: Partial<Agency> = {}) => rendreLaFiche({ ...AGENCE, settings: null, ...autre }, { section: 'regles' });

beforeEach(() => {
  reinitialiserLesDoublures();
  ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: AGENCE });
});

describe('Assistant de la messagerie (TCK-2979)', () => {
  it('allumés par défaut ; couper l’assistant envoie `copilot_enabled: false`, seul', async () => {
    const user = userEvent.setup();
    ouvrir({ ai_platform: { copilot: true, transcription: true, transcription_configured: true } });
    expect(copilote()).toBeChecked();
    expect(transcription()).toBeChecked();
    expect(copilote()).not.toHaveAttribute('data-disabled');
    await user.click(copilote());
    expect(await enregistrer(user)).toEqual({ settings: { copilot_enabled: false } });
  });

  it('coupé par la plateforme : grisé, la raison dite, et un clic ne change rien', async () => {
    const user = userEvent.setup();
    ouvrir({ ai_platform: { copilot: false, transcription: true, transcription_configured: true } });
    expect(copilote()).toHaveAttribute('data-disabled');
    expect(screen.getByText(A.raison.plateforme)).toBeInTheDocument();
    await user.click(copilote());
    expect(copilote()).toBeChecked();
    // La transcription, elle, reste réglable.
    expect(transcription()).not.toHaveAttribute('data-disabled');
  });

  it('aucun fournisseur de transcription : la transcription est grisée avec sa raison', () => {
    ouvrir({ ai_platform: { copilot: true, transcription: true, transcription_configured: false } });
    expect(transcription()).toHaveAttribute('data-disabled');
    expect(screen.getByText(A.raison.nonConfiguree)).toBeInTheDocument();
    expect(copilote()).not.toHaveAttribute('data-disabled');
  });

  it('sans `ai_platform` (lecteur qui ne règle pas l’agence), rien n’est grisé', () => {
    ouvrir();
    expect(copilote()).not.toHaveAttribute('data-disabled');
    expect(transcription()).not.toHaveAttribute('data-disabled');
  });
});
