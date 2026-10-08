import { describe, expect, it, vi } from 'vitest';
import { confirmPayoutThresholdAction, updateAgencyAction } from '@/app/actions/admin-agency';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { Agency } from '@/types/agency';

/**
 * Des mocks à IDENTITÉ STABLE, comme les vrais hooks : un objet neuf à chaque appel casserait le
 * cache du React Compiler et rendrait un FAUX VERT sous compilation (mesuré, TCK-564 E-repair-1).
 */
const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/app/actions/admin-agency', () => ({
  updateAgencyAction: vi.fn(),
  uploadAgencyLogoAction: vi.fn(),
  confirmPayoutThresholdAction: vi.fn(),
}));
const MOI = vi.hoisted(() => ({ current: { user: { id: 11 } as { id: number } | null } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => MOI.current }));
const CAN = vi.hoisted(() => ({ current: { can: false, isLoading: false } }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => CAN.current }));

import { AgencyConfigForm } from '../AgencyConfigForm';

/**
 * TCK-571 — l'aperçu de la devise et l'avertissement SUIVENT le choix.
 *
 * Le formulaire lisait `form.watch('currency')` PENDANT LE RENDU : compilé par le React Compiler
 * (`reactCompiler: true`), l'aperçu « 100 000 sera affiché : … » restait dans la devise d'origine
 * et l'avertissement de changement de devise n'apparaissait jamais. Mesuré en rejouant ce fichier
 * sous le compilateur (configuration de mesure hors dépôt, cf. le ticket) : rouge avec `watch()`,
 * vert avec `useWatch`. La revue adverse de TCK-564 l'avait déjà relevé par exécution le
 * 2026-09-23.
 *
 * ⚠ Sans le compilateur, ce fichier est vert AVEC OU SANS le correctif : il décrit le comportement,
 * la garde du motif est `src/test/__tests__/watch-pendant-le-rendu.test.ts`.
 */

const AGENCE: Agency = {
  id: 7,
  name: 'Dakar Immo',
  slug: 'dakar-immo',
  license_number: null,
  description: null,
  email: null,
  phone: null,
  website: null,
  commission_rate: 5,
  currency: 'XOF',
  is_verified: true,
  status: 'active',
  logo_url: null,
  settings: null,
  primary_admin_id: null,
};

const sansEspaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]/g, '');

describe('AgencyConfigForm — la devise choisie se reflète tout de suite (TCK-571)', () => {
  it('l’aperçu passe à la devise choisie, et l’avertissement apparaît', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    const apercu = () => screen.getByText(/sera affiché/);
    expect(sansEspaces(apercu().textContent)).toBe('100000seraaffiché:100000FCFA');
    expect(screen.queryByText(/Le changement de devise/)).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'EUR (€)' }));

    expect(sansEspaces(apercu().textContent)).toBe('100000seraaffiché:100000,00€');
    expect(screen.getByRole('alert')).toHaveTextContent(/Le changement de devise/);
  });

  it('revenir à la devise d’origine retire l’avertissement', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'USD ($)' }));
    expect(screen.getByText(/Le changement de devise/)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'XOF (F CFA)' }));
    expect(screen.queryByText(/Le changement de devise/)).toBeNull();
  });
});

/**
 * TCK-594 (ADR-0039 §4, §7) — la section « Mentions légales et paiements ».
 *
 * Le champ du seuil n'est proposé qu'au détenteur de `payouts.approve` (le serveur refuse les
 * autres) ; les mentions légales ne le sont jamais à une agence `individual` (le serveur les
 * refuse). Ces tests gardent l'accord entre l'écran et le serveur, pas une sécurité.
 */
describe('AgencyConfigForm — mentions légales et seuil (TCK-594)', () => {
  it('propose le seuil au seul détenteur de payouts.approve', () => {
    CAN.current = { can: false, isLoading: false };
    const { unmount } = render(withIntl(<AgencyConfigForm agency={AGENCE} />));
    expect(screen.queryByLabelText(/Seuil d'approbation/)).toBeNull();
    expect(screen.getByLabelText(/TVA par défaut/)).toBeInTheDocument();
    unmount();

    CAN.current = { can: true, isLoading: false };
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));
    expect(screen.getByLabelText(/Seuil d'approbation/)).toBeInTheDocument();
  });

  it('ne montre aucune mention légale à une agence individual', () => {
    CAN.current = { can: true, isLoading: false };
    const { unmount } = render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, kind: 'standard' }} />));
    expect(screen.getByLabelText('NINEA')).toBeInTheDocument();
    unmount();

    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, kind: 'individual' }} />));
    expect(screen.queryByLabelText('NINEA')).toBeNull();
    expect(screen.queryByLabelText('Raison sociale')).toBeNull();
  });

  it("n'envoie pas le seuil inchangé, ni de mentions légales pour une agence individual", async () => {
    CAN.current = { can: true, isLoading: false };
    vi.mocked(updateAgencyAction).mockResolvedValue({ ok: true, data: AGENCE });
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, kind: 'individual', payout_approval_threshold: 500000 }} />));

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(updateAgencyAction).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(updateAgencyAction).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty('payout_approval_threshold');
    expect(payload).not.toHaveProperty('ninea');
  });
});

describe('AgencyConfigForm — relâcher le seuil attend un second approbateur (VERIF-594 M-2)', () => {
  const EN_ATTENTE: Agency = {
    ...AGENCE,
    payout_approval_threshold: 100000,
    pending_payout_threshold_change: { threshold: null, requested_by_id: 9, requested_at: '2026-10-08T09:00:00Z' },
  };
  const M = fr.admin.agencyConfig.moneyOut;

  it('montre la demande en attente, et laisse un autre approbateur la confirmer', async () => {
    CAN.current = { can: true, isLoading: false };
    MOI.current = { user: { id: 11 } };
    vi.mocked(confirmPayoutThresholdAction).mockResolvedValue({ ok: true, data: AGENCE });
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={EN_ATTENTE} />));

    expect(screen.getByText(M.thresholdPendingOff)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: M.thresholdConfirm }));
    // VERIF-594 passe 2, N-5 — la confirmation porte la valeur affichée (`null` : couper).
    expect(confirmPayoutThresholdAction).toHaveBeenCalledWith(7, null);
  });

  it('confirme la valeur relevée affichée, pas la demande en cours côté serveur (VERIF-594 passe 2, N-5)', async () => {
    CAN.current = { can: true, isLoading: false };
    MOI.current = { user: { id: 11 } };
    vi.mocked(confirmPayoutThresholdAction).mockResolvedValue({ ok: true, data: AGENCE });
    const user = userEvent.setup();
    render(
      withIntl(
        <AgencyConfigForm
          agency={{
            ...EN_ATTENTE,
            pending_payout_threshold_change: { threshold: 150000, requested_by_id: 9, requested_at: '2026-10-08T09:00:00Z' },
          }}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: M.thresholdConfirm }));
    expect(confirmPayoutThresholdAction).toHaveBeenCalledWith(7, 150000);
  });

  it('au demandeur, dit qu’un autre doit confirmer, sans bouton', () => {
    CAN.current = { can: true, isLoading: false };
    MOI.current = { user: { id: 9 } };
    render(withIntl(<AgencyConfigForm agency={EN_ATTENTE} />));

    expect(screen.getByText(M.thresholdPendingSelf)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: M.thresholdConfirm })).toBeNull();
  });

  it('un enregistrement qui demande un relâchement ne se dit pas « enregistré » tout court', async () => {
    CAN.current = { can: true, isLoading: false };
    MOI.current = { user: { id: 9 } };
    vi.mocked(updateAgencyAction).mockResolvedValue({ ok: true, data: EN_ATTENTE });
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={{ ...AGENCE, payout_approval_threshold: 100000 }} />));

    await user.clear(screen.getByLabelText(/Seuil d'approbation/));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(M.thresholdPendingSaved)).toBeInTheDocument();
  });
});

