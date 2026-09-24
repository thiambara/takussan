import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

// Mock the query layer so the form never hits the network.
const submitAgencyUpgradeRequest = vi.fn();
vi.mock('@/lib/queries/agency-upgrade', () => ({
  submitAgencyUpgradeRequest: (...args: unknown[]) =>
    submitAgencyUpgradeRequest(...args),
  revokeAgencyUpgradeRequest: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, roles: ['agency_admin'] },
    token: 'token',
    isLoading: false,
    setUser: vi.fn(),
    refreshUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: routerRefresh, prefetch: vi.fn() }),
}));

// `useWizardDraft` autosaves via fetch — short-circuit so we can hydrate
// instantly with empty state and assert on submit synchronously.
//
// TCK-482 — les doublures sont HOISTÉES et STABLES, et c'est ce qui rend le
// ticket testable : la fabrique rendait un objet neuf à chaque rendu, donc un
// `clear` neuf à chaque rendu. Assurer « le brouillon n'a pas été détruit »
// exigeait de tenir la MÊME référence d'un bout à l'autre du test.
const brouillon = vi.hoisted(() => ({
  save: vi.fn(),
  // TCK-475 — cette doublure rendait `undefined`, et c'était FAUX depuis
  // TCK-465 : `flush()` rend un `ResultatEcritureBrouillon`, plus
  // `Promise<void>`. Elle était verte *parce que* l'appelant ne lisait rien —
  // un test vert qui ne prouvait rien. `{ ok: true, ecrit: false }` est ce que
  // la production rend au repos : rien en attente, aucun échec antérieur
  // (`useWizardDraft.ts`, `flush()`). AC5 : jamais `undefined`.
  flush: vi.fn(),
  clear: vi.fn(),
  // TCK-566 — le brouillon serveur lu à l'ouverture, piloté par test.
  draft: null as { step: number; data: Record<string, unknown> } | null,
}));

vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: brouillon.draft,
    isLoading: false,
    isSaving: false,
    error: null,
    save: brouillon.save,
    flush: brouillon.flush,
    clear: brouillon.clear,
  }),
}));

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/toast')>();
  return {
    ...actual,
    useToast: () => ({ add: toastAdd }),
  };
});

import { UpgradeRequestForm } from '../UpgradeRequestForm';
import { ApiError } from '@/lib/api';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

function fillRequiredText() {
  fireEvent.change(screen.getByLabelText(/Numéro RC/i), { target: { value: 'RC-123' } });
  fireEvent.change(screen.getByLabelText(/^NINEA/i), { target: { value: '0123456789012' } });
  fireEvent.change(screen.getByLabelText(/RIB professionnel/i), {
    target: { value: 'SN012 01234 0123456789012 34' },
  });
  fireEvent.change(screen.getByLabelText(/Raison sociale/i), {
    target: { value: 'Takussan Immo SARL' },
  });
  fireEvent.change(screen.getByLabelText(/Adresse fiscale/i), {
    target: { value: '12 Avenue LSS, Dakar' },
  });
}

describe('<UpgradeRequestForm>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brouillon.draft = null;
    // AC5 — la doublure rend un `ResultatEcritureBrouillon`, jamais `undefined`.
    brouillon.flush.mockResolvedValue({ ok: true, ecrit: false });
    brouillon.clear.mockResolvedValue(undefined);
  });

  it('blocks submission when no statuts file is attached', async () => {
    render(withIntl(<UpgradeRequestForm agencyId={42} />));

    fillRequiredText();
    const form = screen.getByRole('form', { name: /Formulaire de demande/i });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/scan des statuts est obligatoire/i)).toBeInTheDocument();
    });
    expect(submitAgencyUpgradeRequest).not.toHaveBeenCalled();
  });

  it('submits the multipart payload on happy path', async () => {
    submitAgencyUpgradeRequest.mockResolvedValue({
      data: {
        id: 1,
        agency_id: 42,
        submitted_by: 1,
        rc: 'RC-123',
        ninea: '0123456789012',
        rib_pro: 'SN012 01234 0123456789012 34',
        company_legal_name: 'Takussan Immo SARL',
        address_fiscale: '12 Avenue LSS, Dakar',
        planned_agents_count: null,
        status: 'pending',
        submitted_at: '2026-05-11T10:00:00Z',
        reviewed_by: null,
        reviewed_at: null,
        review_comment: null,
        created_at: '2026-05-11T10:00:00Z',
        updated_at: '2026-05-11T10:00:00Z',
      },
    });

    render(withIntl(<UpgradeRequestForm agencyId={42} />));
    fillRequiredText();

    const file = new File(['%PDF-1.4'], 'statuts.pdf', { type: 'application/pdf' });
    const fileInput = screen.getByLabelText(/Statuts juridiques/i) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.submit(screen.getByRole('form', { name: /Formulaire de demande/i }));

    await waitFor(() => {
      expect(submitAgencyUpgradeRequest).toHaveBeenCalledTimes(1);
    });

    const [, agencyId, fields, sentFile] = submitAgencyUpgradeRequest.mock.calls[0];
    expect(agencyId).toBe(42);
    expect(fields).toEqual(
      expect.objectContaining({
        rc: 'RC-123',
        ninea: '0123456789012',
        company_legal_name: 'Takussan Immo SARL',
      }),
    );
    expect(sentFile).toBe(file);

    await waitFor(() => {
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      );
    });
    expect(routerRefresh).toHaveBeenCalled();
    // TCK-482 / AC2 — le chemin nominal détruit toujours le brouillon : un
    // correctif qui éteindrait les DEUX chemins passerait un test qui ne
    // regarde que l'échec.
    expect(brouillon.clear).toHaveBeenCalledTimes(1);
  });

  // ── TCK-482 ────────────────────────────────────────────────────────────────
  // `flush()` NE LÈVE PAS : il rend `{ ok: false, error }`. Le `try/catch` de
  // `handleSubmit` a donc l'air d'être la parade et n'est branché sur rien —
  // le chemin d'échec le traversait sans jamais l'atteindre, soumettait, puis
  // `clear()` détruisait le brouillon serveur.
  it('TCK-482 — flush en échec : ni soumission, ni clear(), et un message qui dit quoi faire', async () => {
    brouillon.flush.mockResolvedValue({
      ok: false,
      ecrit: true,
      error: new Error('PUT wizard-drafts failed (503)'),
    });

    render(withIntl(<UpgradeRequestForm agencyId={42} />));
    fillRequiredText();
    const file = new File(['%PDF-1.4'], 'statuts.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Statuts juridiques/i), {
      target: { files: [file] },
    });

    fireEvent.submit(screen.getByRole('form', { name: /Formulaire de demande/i }));

    // AC1 — un message d'échec part, et il dit quoi faire (réseau / session),
    // jamais quoi que ce soit sur un quota : le chemin est un PUT réseau.
    await waitFor(() => {
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: frMessages.agency.upgrade.form.errors.draft_not_saved_title,
          description: frMessages.agency.upgrade.form.errors.draft_not_saved_body,
          type: 'error',
        }),
      );
    });

    // AC1 — la demande n'est pas partie.
    expect(submitAgencyUpgradeRequest).not.toHaveBeenCalled();
    // AC3 — et le brouillon est TOUJOURS LÀ : `clear()` est le DELETE serveur,
    // il ne doit pas avoir été appelé. On l'assert, pas seulement le toast.
    expect(brouillon.clear).not.toHaveBeenCalled();
    // Le bouton reste actionnable : la personne peut réessayer.
    expect(screen.getByRole('button', { name: /Envoyer la demande/i })).not.toBeDisabled();
    // La saisie est intacte à l'écran.
    expect(screen.getByLabelText(/Numéro RC/i)).toHaveValue('RC-123');
  });

  it('surfaces 422 validation errors inline', async () => {
    submitAgencyUpgradeRequest.mockRejectedValue(
      new ApiError(422, {
        message: 'Validation failed.',
        errors: { ninea: ['NINEA déjà utilisé.'] },
      }),
    );

    render(withIntl(<UpgradeRequestForm agencyId={42} />));
    fillRequiredText();
    const file = new File(['%PDF-1.4'], 'statuts.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Statuts juridiques/i), {
      target: { files: [file] },
    });

    fireEvent.submit(screen.getByRole('form', { name: /Formulaire de demande/i }));

    await waitFor(() => {
      expect(screen.getByText('NINEA déjà utilisé.')).toBeInTheDocument();
    });
    // Field-level errors don't trigger a toast.
    expect(toastAdd).not.toHaveBeenCalled();
  });

  // ── TCK-566 ────────────────────────────────────────────────────────────────
  // Retour testeur du 2026-09-23 : « J'ai seulement cliqué sur la notification
  // (passer en pro) ; je n'ai pas renseigné une seule ligne et on me dit
  // "reprendre là où j'en étais". » L'autosave écrivait le formulaire VIDE dès
  // l'hydratation — `save(0, EMPTY_FORM)` —, et ce brouillon vide devenait la
  // carte « Vous avez 1 démarche en cours — Passage en pro » du tableau de bord.
  describe('TCK-566 — pas de démarche sans saisie', () => {
    it('ouvrir le formulaire sans rien saisir n’écrit aucun brouillon', () => {
      render(withIntl(<UpgradeRequestForm agencyId={42} />));

      expect(screen.getByLabelText(/Numéro RC/i)).toBeInTheDocument();
      expect(brouillon.save).not.toHaveBeenCalled();
      expect(brouillon.clear).not.toHaveBeenCalled();
    });

    it('la première saisie écrit le brouillon', () => {
      render(withIntl(<UpgradeRequestForm agencyId={42} />));
      fireEvent.change(screen.getByLabelText(/Numéro RC/i), { target: { value: 'RC-1' } });

      expect(brouillon.save).toHaveBeenCalledWith(0, expect.objectContaining({ rc: 'RC-1' }));
    });

    it('effacer la saisie jusqu’au formulaire vide supprime le brouillon', () => {
      render(withIntl(<UpgradeRequestForm agencyId={42} />));
      const rc = screen.getByLabelText(/Numéro RC/i);
      fireEvent.change(rc, { target: { value: 'R' } });
      fireEvent.change(rc, { target: { value: '' } });

      expect(brouillon.clear).toHaveBeenCalledTimes(1);
      // L'état vide n'est pas réécrit par-dessus la suppression.
      expect(brouillon.save).toHaveBeenCalledTimes(1);
    });

    // ⚠ Ce que le SERVEUR rend, et non ce que le client a envoyé. Le formulaire
    // vide part avec des chaînes vides ; le middleware global
    // `ConvertEmptyStringsToNull` de l'API les enregistre en `null` (mesuré :
    // PUT `{ rc: '' … }` puis GET → `{ rc: null … }`). Une première version de
    // ce test lisait des `''` — une donnée que le serveur ne rend jamais — et
    // restait verte alors que le brouillon fantôme du testeur était RÉÉCRIT
    // à chaque ouverture au lieu d'être supprimé.
    const BROUILLON_VIDE_TEL_QUE_STOCKE = {
      rc: null,
      ninea: null,
      rib_pro: null,
      address_fiscale: null,
      company_legal_name: null,
      planned_agents_count: null,
    };

    it('un brouillon VIDE hérité, tel que le serveur le rend (champs à null), est supprimé à l’ouverture', () => {
      brouillon.draft = { step: 0, data: { ...BROUILLON_VIDE_TEL_QUE_STOCKE } };
      render(withIntl(<UpgradeRequestForm agencyId={42} />));

      expect(brouillon.clear).toHaveBeenCalledTimes(1);
      expect(brouillon.save).not.toHaveBeenCalled();
      // Les champs s'affichent vides, jamais « null ».
      expect(screen.getByLabelText(/Numéro RC/i)).toHaveValue('');
    });

    it('un brouillon vide hérité portant des clés inconnues est supprimé aussi', () => {
      brouillon.draft = { step: 0, data: { ...BROUILLON_VIDE_TEL_QUE_STOCKE, ancien_champ: 'x' } };
      render(withIntl(<UpgradeRequestForm agencyId={42} />));

      expect(brouillon.clear).toHaveBeenCalledTimes(1);
      expect(brouillon.save).not.toHaveBeenCalled();
    });

    it('un brouillon RÉEL est repris, jamais supprimé', () => {
      brouillon.draft = { step: 0, data: { ...BROUILLON_VIDE_TEL_QUE_STOCKE, rc: 'RC-9' } };
      render(withIntl(<UpgradeRequestForm agencyId={42} />));

      expect(screen.getByLabelText(/Numéro RC/i)).toHaveValue('RC-9');
      expect(screen.getByLabelText(/^NINEA/i)).toHaveValue('');
      expect(brouillon.clear).not.toHaveBeenCalled();
      expect(brouillon.save).not.toHaveBeenCalled();
    });

    it('un brouillon réel repris, puis entièrement effacé, est supprimé', () => {
      brouillon.draft = { step: 0, data: { ...BROUILLON_VIDE_TEL_QUE_STOCKE, rc: 'RC-9' } };
      render(withIntl(<UpgradeRequestForm agencyId={42} />));

      fireEvent.change(screen.getByLabelText(/Numéro RC/i), { target: { value: '' } });

      expect(brouillon.clear).toHaveBeenCalledTimes(1);
      expect(brouillon.save).not.toHaveBeenCalled();
    });

    it('un nombre d’agents repris du brouillon est conservé', () => {
      brouillon.draft = {
        step: 0,
        data: { ...BROUILLON_VIDE_TEL_QUE_STOCKE, planned_agents_count: 4 },
      };
      render(withIntl(<UpgradeRequestForm agencyId={42} />));

      expect(screen.getByLabelText(/Nombre estimé d.agents/i)).toHaveValue(4);
      expect(brouillon.clear).not.toHaveBeenCalled();
    });
  });
});
