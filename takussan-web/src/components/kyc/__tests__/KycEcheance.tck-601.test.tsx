import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { KycDecisionPanel } from '@/components/admin/super/kyc-queue';
import { KycDocumentUploader } from '../kyc-components';
import type { KycDocument, KycDossier } from '@/types/super-admin';

/**
 * TCK-601 (C) — l'échéance des pièces KYC d'agence, et les identifiants légaux partagés.
 *
 * Direction UX : l'échéance de la pièce du dirigeant est visible ; une pièce qui expire dans
 * moins de trente jours se signale sans alarmer ; une pièce expirée se lit comme un état à
 * traiter. ⚠ `documents[].expires_at` est l'expiration du LIEN signé (quelques minutes) : il ne
 * doit JAMAIS être lu comme l'échéance de la pièce.
 */

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    value,
    onValueChange,
    min,
    'aria-label': ariaLabel,
  }: {
    value?: string;
    onValueChange: (v: string) => void;
    min?: string;
    'aria-label'?: string;
  }) => (
    <input
      type="date"
      aria-label={ariaLabel}
      value={value ?? ''}
      min={min}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

/** `YYYY-MM-DD` local, à `n` jours d'aujourd'hui. */
function dansJours(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function piece(type: string, overrides: Partial<KycDocument> = {}): KycDocument {
  return {
    id: type.length,
    file_name: `${type}.pdf`,
    mime_type: 'application/pdf',
    size: 1000,
    document_type: type,
    signed_url: `https://api.test/kyc/${type}?signature=x`,
    // Le LIEN expire dans quinze minutes — c'est toujours « bientôt », et ce n'est pas la pièce.
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    document_expires_at: null,
    ...overrides,
  };
}

function dossier(overrides: Partial<KycDossier> = {}): KycDossier {
  return {
    id: 5,
    subject_type: 'Agency',
    subject_id: 12,
    subject: { id: 12, type: 'Agency', name: 'Dakar Immo', slug: 'dakar-immo' },
    status: 'submitted',
    submitted_at: '2026-10-01T10:00:00Z',
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
    metadata: {},
    documents: [piece('rccm'), piece('ninea'), piece('director_id', { document_expires_at: dansJours(200) })],
    expires_at: null,
    created_at: '2026-09-30T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

function avecDirigeant(echeance: string | null): KycDossier {
  return dossier({
    documents: [piece('rccm'), piece('ninea'), piece('director_id', { document_expires_at: echeance })],
  });
}

function monter(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

function ligneDirigeant(): HTMLElement {
  const panneau = screen.getByTestId('kyc-decision-panel');
  return within(panneau).getByText('Pièce dirigeant').closest('li') as HTMLElement;
}

describe('Échéance de la pièce du dirigeant — file super-admin (TCK-601 · C)', () => {
  it('une échéance lointaine se lit, sans pastille', () => {
    monter(<KycDecisionPanel dossier={avecDirigeant(dansJours(200))} onDone={() => {}} />);
    const ligne = ligneDirigeant();
    expect(within(ligne).getByTestId('kyc-echeance-valid')).toHaveTextContent(/^Expire le /);
    expect(within(ligne).queryByText('Expire bientôt')).not.toBeInTheDocument();
    expect(within(ligne).queryByText('Expirée')).not.toBeInTheDocument();
  });

  it('moins de trente jours : signalée sans alarmer', () => {
    monter(<KycDecisionPanel dossier={avecDirigeant(dansJours(10))} onDone={() => {}} />);
    const ligne = ligneDirigeant();
    expect(within(ligne).getByTestId('kyc-echeance-soon')).toHaveTextContent('Expire bientôt');
  });

  it('expirée : un état à traiter', () => {
    monter(<KycDecisionPanel dossier={avecDirigeant(dansJours(-3))} onDone={() => {}} />);
    const ligne = ligneDirigeant();
    expect(within(ligne).getByTestId('kyc-echeance-expired')).toHaveTextContent('Expirée');
    expect(within(ligne).getByTestId('kyc-echeance-expired')).toHaveTextContent('à renouveler');
  });

  it('l’expiration du LIEN signé n’est jamais lue comme celle de la pièce', () => {
    // Aucune échéance de pièce : le lien, lui, expire dans quinze minutes.
    monter(<KycDecisionPanel dossier={avecDirigeant(null)} onDone={() => {}} />);
    const panneau = screen.getByTestId('kyc-decision-panel');
    expect(within(panneau).queryByTestId('kyc-echeance-soon')).not.toBeInTheDocument();
    expect(within(panneau).queryByTestId('kyc-echeance-expired')).not.toBeInTheDocument();
    expect(within(panneau).queryByTestId('kyc-echeance-valid')).not.toBeInTheDocument();
  });

  it('un dossier vérifié dit jusqu’à quand', () => {
    monter(
      <KycDecisionPanel
        dossier={dossier({ status: 'verified', expires_at: `${dansJours(120)}T00:00:00Z` })}
        onDone={() => {}}
      />,
    );
    expect(screen.getByText(/^Vérification valable jusqu'au /)).toBeInTheDocument();
  });
});

describe('Identifiants légaux partagés (TCK-601 · C)', () => {
  it('un encart sobre nomme les agences qui portent le même identifiant, sans bloquer la décision', () => {
    monter(
      <KycDecisionPanel
        dossier={dossier({
          shared_identifiers: {
            ninea: [{ id: 31, name: 'Thiès Habitat' }, { id: 32, name: 'Saly Location' }],
            rib_pro: [],
          },
        })}
        onDone={() => {}}
      />,
    );
    const encart = screen.getByTestId('kyc-shared-identifiers');
    expect(encart).toHaveTextContent('NINEA');
    expect(encart).toHaveTextContent('identifiant déjà porté par :');
    expect(within(encart).getByRole('link', { name: 'Thiès Habitat' })).toHaveAttribute('href', '/super-admin/agencies/31');
    expect(within(encart).getByRole('link', { name: 'Saly Location' })).toBeInTheDocument();
    expect(encart).not.toHaveTextContent('RIB professionnel');
    // Un signal, pas un refus : la vérification reste possible.
    expect(screen.getByRole('button', { name: 'Vérifier' })).toBeEnabled();
  });

  it('absent (lecteur non super-admin) ou vide : rien n’est rendu', () => {
    const { unmount } = monter(<KycDecisionPanel dossier={dossier()} onDone={() => {}} />);
    expect(screen.queryByTestId('kyc-shared-identifiers')).not.toBeInTheDocument();
    unmount();
    monter(
      <KycDecisionPanel dossier={dossier({ shared_identifiers: { ninea: [], rib_pro: [] } })} onDone={() => {}} />,
    );
    expect(screen.queryByTestId('kyc-shared-identifiers')).not.toBeInTheDocument();
  });
});

describe('Dépôt de la pièce du dirigeant — page KYC de l’agence (TCK-601 · C)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    toastAdd.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: dossier({ status: 'pending' }) }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function carteDirigeant(): HTMLElement {
    return screen.getByText('Pièce dirigeant').closest('div.grid') as HTMLElement;
  }

  it('l’échéance est exigée avant d’ajouter la pièce, puis part en `expires_at`', async () => {
    const user = userEvent.setup();
    monter(<KycDocumentUploader agencyId={12} dossier={dossier({ status: 'pending', documents: [] })} />);

    const carte = carteDirigeant();
    const fichier = new File(['%PDF'], 'cni.pdf', { type: 'application/pdf' });
    await user.upload(carte.querySelector('input[type="file"]') as HTMLInputElement, fichier);

    const ajouter = within(carte).getByRole('button', { name: 'Ajouter' });
    expect(ajouter).toBeDisabled();

    const date = within(carte).getByLabelText('Date d\'expiration : Pièce dirigeant');
    // Pas de date passée ni du jour : le premier jour recevable est demain.
    expect(date).toHaveAttribute('min', dansJours(1));
    await user.type(date, dansJours(400));
    expect(ajouter).toBeEnabled();

    await user.click(ajouter);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/agencies/12/kyc/documents');
    const corps = init.body as FormData;
    expect(corps.get('document_type')).toBe('director_id');
    expect(corps.get('expires_at')).toBe(dansJours(400));
  });

  it('les autres pièces ne demandent pas d’échéance', async () => {
    monter(<KycDocumentUploader agencyId={12} dossier={dossier({ status: 'pending', documents: [] })} />);
    const carteRccm = screen.getByText('RCCM').closest('div.grid') as HTMLElement;
    expect(within(carteRccm).queryByLabelText(/Date d'expiration/)).not.toBeInTheDocument();
  });

  it('une pièce du dirigeant déposée affiche son échéance', () => {
    monter(<KycDocumentUploader agencyId={12} dossier={avecDirigeant(dansJours(5))} />);
    expect(within(carteDirigeant()).getByTestId('kyc-echeance-soon')).toBeInTheDocument();
  });
});
