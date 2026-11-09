import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';

const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/app/actions/admin-agency', () => ({
  updateAgencyAction: vi.fn(),
  uploadAgencyLogoAction: vi.fn(),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

import { updateAgencyAction } from '@/app/actions/admin-agency';
import { AgencyConfigForm } from '../AgencyConfigForm';

/**
 * TCK-2536 — les moyens de paiement hors ligne de l'agence (contrat de TCK-2504) :
 * `settings.offline_payment_wave_number`, `settings.offline_payment_orange_money_number` (rendus en
 * E.164 par l'API) et `settings.offline_payment_bank_details` (500 caractères au plus).
 *
 * L'API FUSIONNE `settings` clé par clé : une clé absente est conservée, une clé à `null` est effacée.
 * Le formulaire n'envoie donc que les clés modifiées — un `null` parti par mégarde effacerait le
 * numéro qu'un locataire lit sur son lien de paiement.
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

const DECLAREE: Agency = {
  ...AGENCE,
  settings: {
    offline_payment_wave_number: '+221771234567',
    offline_payment_orange_money_number: '+221781112233',
    offline_payment_bank_details: 'BICIS Dakar\nSN012 01001 000123456789 21',
  },
};

const L = fr.admin.agencyConfig.offlinePayment;

const wave = () => screen.getByRole('textbox', { name: L.wave });
const orange = () => screen.getByRole('textbox', { name: L.orangeMoney });
const banque = () => screen.getByRole('textbox', { name: L.bankDetails });

beforeEach(() => {
  vi.mocked(updateAgencyAction).mockReset();
  vi.mocked(updateAgencyAction).mockResolvedValue({ ok: true, data: AGENCE });
});

async function enregistrer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: fr.common.actions.save }));
  await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(1));
  return vi.mocked(updateAgencyAction).mock.calls[0][1];
}

describe('AgencyConfigForm — paiement hors ligne (TCK-2536)', () => {
  it('lit les trois réglages tels que l’API les rend, sans reformatage local', () => {
    render(withIntl(<AgencyConfigForm agency={DECLAREE} />));
    expect(wave()).toHaveValue('+221771234567');
    expect(orange()).toHaveValue('+221781112233');
    expect(banque()).toHaveValue('BICIS Dakar\nSN012 01001 000123456789 21');
  });

  it('une agence sans réglage a trois champs vides', () => {
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));
    expect(wave()).toHaveValue('');
    expect(orange()).toHaveValue('');
    expect(banque()).toHaveValue('');
  });

  it('les trois champs paraissent aussi pour une agence individuelle (l’API ne les lui refuse pas)', () => {
    render(withIntl(<AgencyConfigForm agency={{ ...DECLAREE, kind: 'individual' }} />));
    expect(wave()).toHaveValue('+221771234567');
    expect(banque()).toBeInTheDocument();
  });

  it('rien de touché : aucune des trois clés ne part', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={DECLAREE} />));
    expect(await enregistrer(user)).not.toHaveProperty('settings');
  });

  it('AC1 — la saisie libre part telle quelle, SEULE, et le champ affiche ensuite le numéro normalisé rendu par l’API', async () => {
    vi.mocked(updateAgencyAction).mockResolvedValue({
      ok: true,
      data: { ...DECLAREE, settings: { ...DECLAREE.settings, offline_payment_wave_number: '+221771234500' } },
    });
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={DECLAREE} />));

    await user.clear(wave());
    await user.type(wave(), '77 123 45 00');
    const payload = await enregistrer(user);

    expect(payload.settings).toEqual({ offline_payment_wave_number: '77 123 45 00' });
    await waitFor(() => expect(wave()).toHaveValue('+221771234500'));
    expect(screen.getByText(fr.admin.agencyConfig.successSaved)).toBeInTheDocument();
  });

  // Revue de TCK-2536 — Orange Money a sa propre relecture : la tester par Wave ne disait rien d'elle.
  it('AC1 — Orange Money, seul touché : la saisie part seule, le champ relit l’E.164 de l’API, et un second envoi ne le renvoie pas', async () => {
    vi.mocked(updateAgencyAction).mockResolvedValue({
      ok: true,
      data: { ...DECLAREE, settings: { ...DECLAREE.settings, offline_payment_orange_money_number: '+221781112234' } },
    });
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={DECLAREE} />));

    await user.clear(orange());
    await user.type(orange(), '78 111 22 34');
    const payload = await enregistrer(user);

    expect(payload.settings).toEqual({ offline_payment_orange_money_number: '78 111 22 34' });
    await waitFor(() => expect(orange()).toHaveValue('+221781112234'));
    expect(wave()).toHaveValue('+221771234567');

    await user.click(screen.getByRole('button', { name: fr.common.actions.save }));
    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(updateAgencyAction).mock.calls[1][1]).not.toHaveProperty('settings');
  });

  it('AC1 — relu après l’enregistrement, un second envoi ne renvoie pas le numéro (la référence suit la réponse)', async () => {
    vi.mocked(updateAgencyAction).mockResolvedValue({
      ok: true,
      data: { ...AGENCE, settings: { offline_payment_wave_number: '+221771234567' } },
    });
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    await user.type(wave(), '77 123 45 67');
    await enregistrer(user);
    await waitFor(() => expect(wave()).toHaveValue('+221771234567'));

    await user.click(screen.getByRole('button', { name: fr.common.actions.save }));
    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(updateAgencyAction).mock.calls[1][1]).not.toHaveProperty('settings');
  });

  it('AC2 — l’erreur 422 de l’API s’affiche sous le bon champ, et pas dans le bandeau', async () => {
    vi.mocked(updateAgencyAction).mockResolvedValue({
      ok: false,
      status: 422,
      message: 'Les données fournies sont invalides.',
      errors: { 'settings.offline_payment_orange_money_number': ['Ce numéro de téléphone n’est pas valide.'] },
    });
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    await user.type(orange(), 'abc');
    await enregistrer(user);

    await waitFor(() => expect(orange()).toHaveAttribute('aria-invalid', 'true'));
    expect(orange()).toHaveAccessibleDescription('Ce numéro de téléphone n’est pas valide.');
    expect(wave()).not.toHaveAttribute('aria-invalid');
    expect(banque()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Les données fournies sont invalides.')).not.toBeInTheDocument();
    expect(screen.queryByText(fr.admin.agencyConfig.successSaved)).not.toBeInTheDocument();
  });

  it('AC2 — l’erreur de longueur des coordonnées bancaires va sous la zone de texte', async () => {
    vi.mocked(updateAgencyAction).mockResolvedValue({
      ok: false,
      status: 422,
      message: 'Les données fournies sont invalides.',
      errors: { 'settings.offline_payment_bank_details': ['Le texte ne peut pas dépasser 500 caractères.'] },
    });
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    await user.type(banque(), 'BICIS');
    await enregistrer(user);

    await waitFor(() => expect(banque()).toHaveAttribute('aria-invalid', 'true'));
    expect(banque()).toHaveAccessibleDescription('Le texte ne peut pas dépasser 500 caractères.');
  });

  it('AC3 — vider un champ envoie null pour LUI seul ; les deux autres ne partent pas', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={DECLAREE} />));

    await user.clear(orange());
    const payload = await enregistrer(user);

    expect(payload.settings).toEqual({ offline_payment_orange_money_number: null });
  });

  it('AC3 — un champ réduit à des blancs vaut vide : null', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={DECLAREE} />));

    await user.clear(banque());
    await user.type(banque(), '   ');
    expect((await enregistrer(user)).settings).toEqual({ offline_payment_bank_details: null });
  });

  it('des blancs ajoutés autour d’une valeur inchangée ne la font pas partir (l’API les retire)', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={DECLAREE} />));

    await user.type(banque(), '  ');
    expect(await enregistrer(user)).not.toHaveProperty('settings');
  });

  it('les sauts de ligne des coordonnées bancaires partent tels quels', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    await user.type(banque(), 'CBAO{Enter}SN08 1234');
    expect((await enregistrer(user)).settings).toEqual({ offline_payment_bank_details: 'CBAO\nSN08 1234' });
  });

  it('la zone de texte est bornée à 500 caractères, comme l’API', () => {
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));
    expect(banque()).toHaveAttribute('maxLength', '500');
  });
});
