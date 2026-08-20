import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
import { IntegrationsManager } from '../IntegrationsManager';

const createMock = vi.fn();
const updateMock = vi.fn();
const testMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/app/actions/admin-settings', () => ({
  createIntegrationAction: (...args: unknown[]) => createMock(...args),
  updateIntegrationAction: (...args: unknown[]) => updateMock(...args),
  testIntegrationAction: (...args: unknown[]) => testMock(...args),
  deleteIntegrationAction: (...args: unknown[]) => deleteMock(...args),
}));

const initial = [
  {
    id: 42,
    provider: 'wave',
    agency_id: 1,
    is_active: true,
    last_used_at: null,
    metadata: null,
    created_at: null,
    updated_at: null,
  },
];

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  testMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(withIntl(ui));
}

describe('<IntegrationsManager />', () => {
  it('renders the integration card with provider + status', () => {
    renderWithIntl(<IntegrationsManager initialIntegrations={initial} />);
    expect(screen.getByText(/wave/i)).toBeInTheDocument();
    expect(screen.getByText(/Active/)).toBeInTheDocument();
  });

  it('runs the test action and shows a success message', async () => {
    testMock.mockResolvedValue({
      ok: true,
      data: { ok: true, message: 'Connexion vérifiée.' },
    });
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={initial} />);

    await user.click(screen.getByRole('button', { name: /Tester la connexion/ }));
    expect(testMock).toHaveBeenCalledWith(42);
    expect(await screen.findByText('Connexion vérifiée.')).toBeInTheDocument();
  });

  it('surfaces the backend failure message when the test fails', async () => {
    testMock.mockResolvedValue({
      ok: true,
      data: { ok: false, message: 'Clé API invalide.' },
    });
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={initial} />);

    await user.click(screen.getByRole('button', { name: /Tester la connexion/ }));
    expect(await screen.findByText('Clé API invalide.')).toBeInTheDocument();
  });

  it('masks the secret input until the reveal toggle is pressed', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const secret = await screen.findByLabelText('Secret');
    expect(secret).toHaveAttribute('type', 'password');

    // "Afficher" toggle flips the input to text.
    await user.click(screen.getAllByRole('button', { name: 'Afficher' })[1]);
    expect(secret).toHaveAttribute('type', 'text');
  });

  it('renders Orange SMS specific fields when provider = sms_orange (TCK-102)', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const providerInput = await screen.findByLabelText(/Fournisseur/);
    await user.clear(providerInput);
    await user.type(providerInput, 'sms_orange');

    expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Client secret')).toBeInTheDocument();
    expect(screen.getByLabelText(/Sender address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sender name/)).toBeInTheDocument();
    // ARTP banner present.
    expect(screen.getByText(/Conformité ARTP/i)).toBeInTheDocument();
    // Generic "Clé API" / "Secret" fields are hidden.
    expect(screen.queryByLabelText('Clé API')).not.toBeInTheDocument();
  });

  it('renders LAfricaMobile specific fields when provider = sms_lafricamobile (TCK-102)', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const providerInput = await screen.findByLabelText(/Fournisseur/);
    await user.clear(providerInput);
    await user.type(providerInput, 'sms_lafricamobile');

    expect(screen.getByLabelText('Account ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText(/Sender ID/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Host LAMPUSH/)).toBeInTheDocument();
  });

  it('submits Orange credentials in the right shape (TCK-102)', async () => {
    createMock.mockResolvedValue({ ok: true, data: { id: 99, provider: 'sms_orange' } });
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const providerInput = await screen.findByLabelText(/Fournisseur/);
    await user.clear(providerInput);
    await user.type(providerInput, 'sms_orange');
    await user.type(screen.getByLabelText('Client ID'), 'cid-123');
    await user.type(screen.getByLabelText('Client secret'), 'csec-456');
    await user.type(screen.getByLabelText(/Sender address/), 'tel:+221771234567');
    await user.type(screen.getByLabelText(/Sender name/), 'TAKUSSAN');
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      provider: 'sms_orange',
      is_active: true,
      credentials: { client_id: 'cid-123', client_secret: 'csec-456' },
      metadata: { sender_address: 'tel:+221771234567', sender_name: 'TAKUSSAN' },
    });
    // Generic credentials must not leak.
    expect(payload.credentials).not.toHaveProperty('api_key');
  });
  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * TCK-292 (lot L) — les messages d'`integrationFormSchema` partaient en CLÉ BRUTE
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   *
   * Les sept tests ci-dessus n'auraient jamais pu le voir : tous passent par le chemin VALIDE.
   * Aucun ne regardait ce que ce dialogue affiche quand il refuse — et c'est très exactement
   * pourquoi neuf messages ont pu casser sans qu'un seul test ne rougisse.
   *
   * Les libellés attendus sont ceux d'AVANT la conversion, au caractère près (les `≤`, les espaces
   * avant `:`, les guillemets droits de `keyPattern`) — relevés par
   * `git show HEAD:takussan-web/src/lib/schemas/setting.ts`.
   */
  it('rend les libellés FRANÇAIS de validation générique, jamais la clé', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const fournisseur = await screen.findByLabelText(/Fournisseur/);

    // `fireEvent.change` pour les champs longs : `user.type` coûte ~4,5 ms par caractère.
    fireEvent.change(screen.getByLabelText(/URL de webhook/), { target: { value: 'pas-une-url' } });
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: 'n'.repeat(501) } });
    // `provider` reste VIDE → `providerRequired`. Le formulaire porte `noValidate`.
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));

    expect(await screen.findByText('Le fournisseur est requis.')).toBeInTheDocument();
    expect(screen.getByText('URL invalide. Exemple : https://exemple.sn/webhook')).toBeInTheDocument();
    expect(screen.getByText('Note trop longue.')).toBeInTheDocument();
    attendAucuneCleBrute();
    expect(createMock).not.toHaveBeenCalled();

    // `providerTooLong` : le `min` court-circuite le `max` sur le même champ, d'où un 2e passage.
    fireEvent.change(fournisseur, { target: { value: 'p'.repeat(81) } });
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));
    expect(await screen.findByText('Le nom du fournisseur est trop long.')).toBeInTheDocument();
    attendAucuneCleBrute();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rend les libellés FRANÇAIS de validation SMS Orange, jamais la clé', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const fournisseur = await screen.findByLabelText(/Fournisseur/);
    fireEvent.change(fournisseur, { target: { value: 'sms_orange' } });

    fireEvent.change(screen.getByLabelText(/Sender address/), { target: { value: 'pas-un-tel' } });
    fireEvent.change(screen.getByLabelText(/Sender name/), { target: { value: 'nom-trop-long-et-non-alphanum' } });
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));

    expect(await screen.findByText('Format attendu : tel:+221XXXXXXXXX (numéro Orange SN).')).toBeInTheDocument();
    expect(screen.getByText('Sender name ≤ 11 caractères alphanumériques (whitelist Orange).')).toBeInTheDocument();
    attendAucuneCleBrute();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rend les libellés FRANÇAIS de validation LAfricaMobile, jamais la clé', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const fournisseur = await screen.findByLabelText(/Fournisseur/);
    fireEvent.change(fournisseur, { target: { value: 'sms_lafricamobile' } });

    fireEvent.change(screen.getByLabelText(/Host LAMPUSH/), { target: { value: 'pas-une-url' } });
    // Un sender ID QUI COMMENCE PAR UN CHIFFRE : c'est le seul message posé par `superRefine`,
    // donc le seul dont le chemin de traduction passe par `ctx.addIssue` et non par un `refine`.
    fireEvent.change(screen.getByLabelText(/Sender ID/), { target: { value: '9ABC' } });
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));

    expect(await screen.findByText('Host invalide. Exemple : https://lampush-tls.lafricamobile.com')).toBeInTheDocument();
    expect(
      screen.getByText('LAfricaMobile : le sender ID ne doit pas commencer par un chiffre.'),
    ).toBeInTheDocument();
    attendAucuneCleBrute();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rend le libellé FRANÇAIS de `sms_sender_id` non alphanumérique (Mtarget)', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsManager initialIntegrations={[]} />);

    await user.click(screen.getByRole('button', { name: /Ajouter une intégration/ }));
    const fournisseur = await screen.findByLabelText(/Fournisseur/);
    fireEvent.change(fournisseur, { target: { value: 'sms_mtarget' } });
    fireEvent.change(screen.getByLabelText(/Sender ID/), { target: { value: 'id-avec-tirets' } });
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));

    expect(await screen.findByText('Sender ID ≤ 11 caractères alphanumériques.')).toBeInTheDocument();
    attendAucuneCleBrute();
    expect(createMock).not.toHaveBeenCalled();
  });
});
