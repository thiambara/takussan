/**
 * TCK-2592 — la page du pipeline, de bout en bout sur ses lectures et ses gestes :
 *  · l'agent ouvre sur « Moi » (`scope=mine`), l'admin sur « Agence » (`scope=agency`), le bailleur sans
 *    portée ni sélecteur de référent ;
 *  · la carte d'une étape ne dit « Dernier contact » que d'un contact noté (sinon « Créé … ») ;
 *  · Perdu demande un motif AVANT l'appel, et le motif part avec l'étape ;
 *  · « Plus tard » écarte l'étape proposée par son fait ;
 *  · la tuile « Conversion » ouvre les sorties (AC4).
 *
 * Puis ce que l'ancien kanban éprouvait (PipelineKanban, PipelineStatsBar, PipelineCard), repris sur la
 * nouvelle page : le compte vient de `stage_counts` et « Charger plus » ajoute la page 2 (TCK-591) ;
 * une relecture garde les pages chargées (P199.01) ; un refus du motif garde le texte et s'y lit
 * (P244.01) ; l'alerte se pose sur la base du dock (TCK-2481) ; une fiche sans nom se lit « #id »
 * (P220.03) ; sans statistiques, des tirets ; un pipeline vide se dit en français.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import type { LecteurDuPipeline } from '@/lib/crm/pipeline';
import { withIntl } from '@/test/intl';
import type { PipelineCustomerCard } from '@/types/pipeline';

import { PageDuPipeline } from '../PageDuPipeline';

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  fetchPipelineStats: vi.fn(),
  fetchPipelineColumn: vi.fn(),
  fetchPipelineList: vi.fn(),
  patchCustomerPipelineStage: vi.fn(),
  dismissSuggestedStage: vi.fn(),
  noter: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mocks.params,
  usePathname: () => '/app/crm/pipeline',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: null }),
}));

vi.mock('@/lib/queries/agent-crm', () => ({
  fetchAgencyAgents: vi.fn(() => Promise.resolve([{ id: 7, name: 'Khady Diallo' }])),
}));

vi.mock('@/lib/queries/customer-gestures', () => ({
  useEnregistrerContactClient: () => ({ mutate: mocks.noter }),
}));

vi.mock('@/lib/queries/pipeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/pipeline')>()),
  fetchPipelineStats: mocks.fetchPipelineStats,
  fetchPipelineColumn: mocks.fetchPipelineColumn,
  fetchPipelineList: mocks.fetchPipelineList,
  patchCustomerPipelineStage: mocks.patchCustomerPipelineStage,
  dismissSuggestedStage: mocks.dismissSuggestedStage,
  updateTask: mocks.updateTask,
}));

const IL_Y_A = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString();

const carte = (id: number, prenom: string, autre: Partial<PipelineCustomerCard> = {}): PipelineCustomerCard => ({
  id,
  first_name: prenom,
  last_name: 'Ndiaye',
  phone: '+221770000000',
  pipeline_stage: 'negotiating',
  created_at: IL_Y_A(3),
  updated_at: IL_Y_A(3),
  added_by_id: null,
  tasks_count: 0,
  last_contacted_at: null,
  next_action: null,
  follow_up: null,
  referent: null,
  suggested_stage: null,
  ...autre,
});

const STATS = {
  scope: 'mine',
  stage_counts: { lead: 3, prospect: 1, qualified: 0, negotiating: 2, converted: 4, lost: 3 },
  stage_changes_last_30d: 5,
  avg_time_in_stage: {},
  median_days_in_stage: { lead: 2, prospect: 6, qualified: null, negotiating: 14 },
  conversion_rate: 0.57,
  exits_last_30d: { converted: 4, lost: 3 },
};

const AGENT: LecteurDuPipeline = { personnel: true, admin: false, agence: true };
const ADMIN: LecteurDuPipeline = { personnel: true, admin: true, agence: true };
const BAILLEUR: LecteurDuPipeline = { personnel: false, admin: false, agence: false };

function rendu(lecteur: LecteurDuPipeline, requete = '') {
  mocks.params = new URLSearchParams(requete);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <PageDuPipeline lecteur={lecteur} moi="Sokhna Sène" agence={lecteur.personnel ? { id: 1, nom: 'Dakar Immo' } : null} crmTags={[]} />
      </QueryClientProvider>,
    ),
  );
  return queryClient;
}

const telephone = () => document.querySelector<HTMLElement>('[data-slot="pipeline-telephone"]') as HTMLElement;
const bureau = () => document.querySelector<HTMLElement>('[data-slot="pipeline-bureau"]') as HTMLElement;

describe('<PageDuPipeline> (TCK-2592)', () => {
  beforeEach(() => {
    for (const m of [mocks.replace, mocks.fetchPipelineStats, mocks.fetchPipelineColumn, mocks.fetchPipelineList, mocks.patchCustomerPipelineStage, mocks.dismissSuggestedStage, mocks.noter]) m.mockReset();
    mocks.fetchPipelineStats.mockResolvedValue(STATS);
    mocks.fetchPipelineList.mockResolvedValue({ lignes: [], total: 0 });
    mocks.fetchPipelineColumn.mockImplementation((_t: string, { stage }: { stage: string }) =>
      Promise.resolve(
        stage === 'negotiating'
          ? [
              carte(11, 'Awa'),
              carte(12, 'Moussa', { last_contacted_at: IL_Y_A(2), suggested_stage: { to: 'converted', reason: 'offer_created', at: IL_Y_A(1) } }),
            ]
          : [],
      ),
    );
    mocks.patchCustomerPipelineStage.mockImplementation((_t: string, id: number, stage: string) => Promise.resolve({ id, pipeline_stage: stage }));
    mocks.dismissSuggestedStage.mockResolvedValue(undefined);
  });

  it('l’agent ouvre sur « Moi » : statistiques et relances lues avec scope=mine', async () => {
    rendu(AGENT);
    await waitFor(() => expect(mocks.fetchPipelineStats).toHaveBeenCalled());
    expect(mocks.fetchPipelineStats.mock.calls.every(([, p]) => p.scope === 'mine')).toBe(true);
    await waitFor(() => expect(mocks.fetchPipelineList).toHaveBeenCalled());
    const relances = mocks.fetchPipelineList.mock.calls.map(([, p]) => p.filtres).filter((f) => f.follow_up === '1');
    expect(relances.length).toBeGreaterThan(0);
    // Les listes portent « Moi » par le référent (`filter[referent]=me`), les statistiques par `scope`.
    expect(relances.every((f) => f.referent === 'me')).toBe(true);
    expect(within(telephone()).getAllByText('Moi').length).toBeGreaterThan(0);
  });

  it('l’admin ouvre sur « Agence » : scope=agency, jamais mine', async () => {
    rendu(ADMIN);
    await waitFor(() => expect(mocks.fetchPipelineStats).toHaveBeenCalled());
    expect(mocks.fetchPipelineStats.mock.calls.every(([, p]) => p.scope === 'agency')).toBe(true);
    await waitFor(() => expect(mocks.fetchPipelineList).toHaveBeenCalled());
    expect(mocks.fetchPipelineList.mock.calls.every(([, p]) => p.filtres.referent === undefined)).toBe(true);
  });

  it('le bailleur n’a ni portée ni sélecteur de référent, et ouvre sur les étapes', async () => {
    rendu(BAILLEUR);
    await waitFor(() => expect(mocks.fetchPipelineStats).toHaveBeenCalled());
    expect(mocks.fetchPipelineStats.mock.calls.every(([, p]) => p.scope === undefined)).toBe(true);
    expect(within(bureau()).queryByText('Référent')).not.toBeInTheDocument();
    expect(within(bureau()).queryByText('À relancer seulement')).not.toBeInTheDocument();
    expect(within(bureau()).getByRole('button', { name: 'Étapes', pressed: true })).toBeInTheDocument();
  });

  it('au téléphone, « Dernier contact » ne se dit que d’un contact noté ; sinon la création', async () => {
    rendu(AGENT, 'vue=etapes&etape=negotiating');
    const awa = (await within(telephone()).findByText('Awa Ndiaye')).closest('[data-slot="carte-etape"]') as HTMLElement;
    expect(within(awa).getByText('Créé il y a 3 j')).toBeInTheDocument();
    expect(within(awa).queryByText(/Dernier contact/)).not.toBeInTheDocument();
    const moussa = within(telephone()).getByText('Moussa Ndiaye').closest('[data-slot="carte-etape"]') as HTMLElement;
    expect(within(moussa).getByText('Dernier contact : il y a 2 j')).toBeInTheDocument();
  });

  it('Perdu demande un motif d’abord, et le motif part avec l’étape', async () => {
    const user = userEvent.setup();
    rendu(AGENT, 'vue=etapes&etape=negotiating');
    const awa = (await within(telephone()).findByText('Awa Ndiaye')).closest('[data-slot="carte-etape"]') as HTMLElement;
    await user.click(within(awa).getByRole('button', { name: /Changer d’étape/ }));
    await user.click(within(awa).getByRole('button', { name: 'Perdu' }));

    const dialogue = await screen.findByRole('dialog', { name: 'Pourquoi Awa ne donne pas suite ?' });
    expect(mocks.patchCustomerPipelineStage).not.toHaveBeenCalled();
    const enregistrer = within(dialogue).getByRole('button', { name: 'Enregistrer' });
    expect(enregistrer).toBeDisabled();
    await user.click(within(dialogue).getByRole('button', { name: 'Ne répond plus' }));
    expect(enregistrer).toBeEnabled();
    await user.click(enregistrer);

    await waitFor(() => expect(mocks.patchCustomerPipelineStage).toHaveBeenCalledWith('jeton', 11, 'lost', 'Ne répond plus'));
  });

  it('Gagné (décision 7) : « Ce qui a décidé Awa », sans puces, le texte exigé', async () => {
    const user = userEvent.setup();
    rendu(AGENT, 'vue=etapes&etape=negotiating');
    const awa = (await within(telephone()).findByText('Awa Ndiaye')).closest('[data-slot="carte-etape"]') as HTMLElement;
    await user.click(within(awa).getByRole('button', { name: /Changer d’étape/ }));
    await user.click(within(awa).getByRole('button', { name: 'Gagné' }));

    const dialogue = await screen.findByRole('dialog', { name: 'Ce qui a décidé Awa' });
    expect(within(dialogue).queryByRole('group', { name: 'Motif' })).not.toBeInTheDocument();
    const enregistrer = within(dialogue).getByRole('button', { name: 'Enregistrer' });
    expect(enregistrer).toBeDisabled();
    await user.type(within(dialogue).getByRole('textbox'), 'Bail signé le 10 mai');
    expect(enregistrer).toBeEnabled();
    await user.click(enregistrer);
    await waitFor(() => expect(mocks.patchCustomerPipelineStage).toHaveBeenCalledWith('jeton', 11, 'converted', 'Bail signé le 10 mai'));
  });

  it('un geste que l’API n’a pas noté se dit en alerte, sans retenir l’appel (P228.06)', async () => {
    const user = userEvent.setup();
    mocks.noter.mockImplementation((_v: unknown, o?: { onError?: (e: Error) => void }) => o?.onError?.(new Error('refus')));
    rendu(AGENT, 'vue=etapes&etape=negotiating');
    const awa = (await within(telephone()).findByText('Awa Ndiaye')).closest('[data-slot="carte-etape"]') as HTMLElement;
    const appeler = within(awa).getByRole('link', { name: 'Appeler Awa Ndiaye' });
    expect(appeler.getAttribute('href')).toMatch(/^tel:/);
    await user.click(appeler);
    expect(mocks.noter).toHaveBeenCalledWith({ id: 11, channel: 'call' }, expect.anything());
    expect(await screen.findByText('Le contact n’a pas été noté sur la fiche du client.')).toBeInTheDocument();
  });

  it('« Reporter » écrit l’échéance de la tâche en retard : demain, 9 h à Dakar, puis relit le pipeline', async () => {
    const user = userEvent.setup();
    mocks.updateTask.mockReset().mockResolvedValue({});
    const enRetard = carte(21, 'Fatou', {
      follow_up: { reason: 'overdue_task', since: IL_Y_A(2), days: 2 },
      next_action: { type: 'task', id: 40, at: IL_Y_A(2), label: 'Rappeler', overdue: true, manage: true },
    });
    const sansTache = carte(22, 'Ibou', { follow_up: { reason: 'no_contact', since: IL_Y_A(9), days: 9 } });
    // Décision 4 — la tâche en retard d'un collègue : lue, pas modifiable (`TaskPolicy::update`).
    const duCollegue = carte(23, 'Awa', {
      follow_up: { reason: 'overdue_task', since: IL_Y_A(3), days: 3 },
      next_action: { type: 'task', id: 41, at: IL_Y_A(3), label: null, overdue: true, manage: false },
    });
    mocks.fetchPipelineList.mockImplementation((_t: string, { filtres }: { filtres: Record<string, string> }) =>
      Promise.resolve(filtres.follow_up === '1' ? { lignes: [enRetard, sansTache, duCollegue], total: 3 } : { lignes: [], total: 0 }),
    );
    rendu(AGENT);
    const fatou = (await within(telephone()).findByText('Fatou Ndiaye')).closest('[data-slot="ligne-relance"]') as HTMLElement;
    const ibou = within(telephone()).getByText('Ibou Ndiaye').closest('[data-slot="ligne-relance"]') as HTMLElement;
    const awa = within(telephone()).getByText('Awa Ndiaye').closest('[data-slot="ligne-relance"]') as HTMLElement;
    // Rien ne se reporte sans tâche en retard, ni la tâche qu'on ne peut pas modifier.
    expect(within(ibou).queryByRole('button', { name: 'Reporter', hidden: true })).not.toBeInTheDocument();
    expect(within(awa).queryByRole('button', { name: 'Reporter', hidden: true })).not.toBeInTheDocument();
    const lectures = mocks.fetchPipelineList.mock.calls.length;

    await user.click(within(fatou).getByRole('button', { name: 'Reporter', hidden: true }));
    // Dakar vit en UTC toute l'année : « demain, 9 h » est le jour UTC de maintenant, plus un, à 09:00Z.
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const demain = new Date(Date.parse(`${aujourdhui}T09:00:00Z`) + 86_400_000).toISOString();
    await waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith('jeton', 40, { due_at: demain }));
    expect(mocks.updateTask).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.fetchPipelineList.mock.calls.length).toBeGreaterThan(lectures));
  });

  it('« Plus tard » écarte l’étape proposée par son fait, sans changer l’étape', async () => {
    const user = userEvent.setup();
    rendu(AGENT, 'vue=etapes&etape=negotiating');
    const moussa = (await within(telephone()).findByText('Moussa Ndiaye')).closest('[data-slot="carte-etape"]') as HTMLElement;
    await user.click(within(moussa).getByRole('button', { name: 'Plus tard' }));
    await waitFor(() => expect(mocks.dismissSuggestedStage).toHaveBeenCalledWith('jeton', 12, 'offer_created'));
    expect(mocks.patchCustomerPipelineStage).not.toHaveBeenCalled();
  });

  it('la tuile « Conversion des sorties » ouvre les sorties (AC4)', async () => {
    const user = userEvent.setup();
    rendu(ADMIN, 'vue=etapes');
    const tuile = await within(bureau()).findByRole('button', { name: /Conversion des sorties/ });
    await waitFor(() => expect(tuile).toHaveTextContent('57 %'));
    await user.click(tuile);
    // Décision 1b — la tuile ouvre les sorties qu'elle compte : celles des 30 derniers jours.
    expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining('sorties=30'), { scroll: false });
  });

  it('sous `sorties=30`, Gagné et Perdu ne lisent que les sorties de la période, comptées comme la tuile (AC4)', async () => {
    mocks.fetchPipelineStats.mockResolvedValue({ ...STATS, stage_counts: { ...STATS.stage_counts, converted: 40, lost: 30 } });
    rendu(ADMIN, 'vue=etapes&sorties=30');
    const gagne = (await within(bureau()).findByTestId('pipeline-column-converted')) as HTMLElement;
    const perdu = within(bureau()).getByTestId('pipeline-column-lost');
    await waitFor(() => expect(within(gagne).getByText('4')).toBeInTheDocument());
    expect(within(perdu).getByText('3')).toBeInTheDocument();
    const filtresDe = (stage: string) =>
      mocks.fetchPipelineColumn.mock.calls.filter(([, p]) => (p as { stage: string }).stage === stage).map(([, p]) => (p as { filtres: Record<string, string> }).filtres);
    await waitFor(() => expect(filtresDe('converted').length).toBeGreaterThan(0));
    expect(filtresDe('converted').every((f) => f.exited_within_days === '30')).toBe(true);
    expect(filtresDe('lost').every((f) => f.exited_within_days === '30')).toBe(true);
    // Les étapes vivantes ne sont pas bornées.
    expect(filtresDe('lead').some((f) => 'exited_within_days' in f)).toBe(false);
    expect(within(bureau()).getByRole('button', { name: /Conversion des sorties/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('« Déplier » (`sorties=1`) montre Gagné et Perdu entiers, comptés par étape', async () => {
    mocks.fetchPipelineStats.mockResolvedValue({ ...STATS, stage_counts: { ...STATS.stage_counts, converted: 40, lost: 30 } });
    rendu(ADMIN, 'vue=etapes&sorties=1');
    const gagne = (await within(bureau()).findByTestId('pipeline-column-converted')) as HTMLElement;
    await waitFor(() => expect(within(gagne).getByText('40')).toBeInTheDocument());
    const appels = mocks.fetchPipelineColumn.mock.calls.filter(([, p]) => (p as { stage: string }).stage === 'converted');
    expect(appels.some(([, p]) => 'exited_within_days' in (p as { filtres: Record<string, string> }).filtres)).toBe(false);
    expect(within(bureau()).getByRole('button', { name: /Conversion des sorties/ })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('<PageDuPipeline> — ce que l’ancien kanban éprouvait (TCK-2592)', () => {
  const lead = (id: number) => carte(id, 'Client', { last_name: `n°${id}`, pipeline_stage: 'lead' });

  beforeEach(() => {
    for (const m of [mocks.replace, mocks.fetchPipelineStats, mocks.fetchPipelineColumn, mocks.fetchPipelineList, mocks.patchCustomerPipelineStage, mocks.dismissSuggestedStage, mocks.noter]) m.mockReset();
    mocks.fetchPipelineStats.mockResolvedValue({ ...STATS, stage_counts: { ...STATS.stage_counts, lead: 73 } });
    mocks.fetchPipelineList.mockResolvedValue({ lignes: [], total: 0 });
    mocks.fetchPipelineColumn.mockImplementation((_t: string, { stage, page }: { stage: string; page?: number }) => {
      if (stage === 'negotiating') return Promise.resolve([carte(11, 'Awa')]);
      if (stage !== 'lead') return Promise.resolve([]);
      if (page === 2) return Promise.resolve(Array.from({ length: 23 }, (_, i) => lead(51 + i)));
      return Promise.resolve(Array.from({ length: 50 }, (_, i) => lead(1 + i)));
    });
  });

  const colonneLead = async () => (await within(bureau()).findByTestId('pipeline-column-lead')) as HTMLElement;

  it('le compte vient de stage_counts (73), et « Charger plus » ajoute la page 2', async () => {
    const user = userEvent.setup();
    rendu(ADMIN, 'vue=etapes');
    const colonne = await colonneLead();
    await waitFor(() => expect(within(colonne).getByText('73')).toBeInTheDocument());
    expect(within(colonne).queryByText('Client n°51')).not.toBeInTheDocument();
    await user.click(within(colonne).getByRole('button', { name: 'Charger plus (50/73)' }));
    expect(await within(colonne).findByText('Client n°51')).toBeInTheDocument();
    expect(mocks.fetchPipelineColumn).toHaveBeenCalledWith('jeton', expect.objectContaining({ stage: 'lead', page: 2 }));
    expect(within(colonne).queryByRole('button', { name: /Charger plus/ })).not.toBeInTheDocument();
  });

  it('une relecture garde les cartes de « Charger plus » (P199.01)', async () => {
    const user = userEvent.setup();
    const queryClient = rendu(ADMIN, 'vue=etapes');
    const colonne = await colonneLead();
    await user.click(await within(colonne).findByRole('button', { name: 'Charger plus (50/73)' }));
    await within(colonne).findByText('Client n°73');
    mocks.fetchPipelineColumn.mockClear();
    await queryClient.invalidateQueries();
    await waitFor(() => expect(mocks.fetchPipelineColumn).toHaveBeenCalledWith('jeton', expect.objectContaining({ stage: 'lead', page: 2 })));
    expect(within(colonne).getByText('Client n°73')).toBeInTheDocument();
  });

  it('un refus du motif garde le dialogue, le texte, et dit l’erreur de l’API (P244.01) ; un succès ferme', async () => {
    const user = userEvent.setup();
    mocks.patchCustomerPipelineStage.mockRejectedValueOnce(new ApiError(422, { message: 'Le motif est trop long.', errors: { reason: ['Le motif est trop long.'] } }));
    rendu(AGENT, 'vue=etapes&etape=negotiating');
    const awa = (await within(telephone()).findByText('Awa Ndiaye')).closest('[data-slot="carte-etape"]') as HTMLElement;
    await user.click(within(awa).getByRole('button', { name: /Changer d’étape/ }));
    await user.click(within(awa).getByRole('button', { name: 'Perdu' }));
    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('button', { name: 'Prix' }));
    await user.type(within(dialogue).getByTestId('reason-input'), 'Budget insuffisant');
    await user.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mocks.patchCustomerPipelineStage).toHaveBeenCalledWith('jeton', 11, 'lost', 'Prix — Budget insuffisant'));
    expect(await within(dialogue).findByRole('alert')).toHaveTextContent('Le motif est trop long.');
    expect(within(dialogue).getByTestId('reason-input')).toHaveValue('Budget insuffisant');

    mocks.patchCustomerPipelineStage.mockImplementation((_t: string, id: number, stage: string) => Promise.resolve({ id, pipeline_stage: stage }));
    await user.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('l’alerte d’une panne se pose sur la base du dock sous md, à 16 px dès md (TCK-2481)', async () => {
    const user = userEvent.setup();
    rendu(AGENT, 'vue=etapes&etape=lead');
    mocks.fetchPipelineColumn.mockImplementation((_t: string, { stage, page }: { stage: string; page?: number }) =>
      page === 2 ? Promise.reject(new ApiError(500, { message: 'Panne' })) : Promise.resolve(stage === 'lead' ? Array.from({ length: 50 }, (_, i) => lead(1 + i)) : []),
    );
    const plus = await within(telephone()).findByRole('button', { name: /Charger plus/ });
    await user.click(plus);
    const alerte = (await screen.findAllByRole('alert')).find((a) => !a.closest('[role="dialog"]')) as HTMLElement;
    expect(alerte.className).toContain('bottom-[var(--floating-dock-base)]');
    expect(alerte.className).toContain('md:bottom-4');
    expect(within(telephone()).getByText('Client n°50')).toBeInTheDocument();
  });

  it('au bureau, la panne d’un « Charger plus » du kanban se dit en alerte, puis s’efface seule après 4 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mocks.fetchPipelineColumn.mockImplementation((_t: string, { stage, page }: { stage: string; page?: number }) =>
        page === 2 ? Promise.reject(new ApiError(500, { message: 'Panne' })) : Promise.resolve(stage === 'lead' ? Array.from({ length: 50 }, (_, i) => lead(1 + i)) : []),
      );
      rendu(ADMIN, 'vue=etapes');
      const colonne = await colonneLead();
      await user.click(await within(colonne).findByRole('button', { name: 'Charger plus (50/73)' }));
      const alerte = await within(bureau()).findByRole('alert');
      expect(alerte).toHaveTextContent(/.+/);
      act(() => {
        vi.advanceTimersByTime(3900);
      });
      expect(within(bureau()).getByRole('alert')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(200);
      });
      await waitFor(() => expect(within(bureau()).queryByRole('alert')).not.toBeInTheDocument());
      expect(within(colonne).getByText('Client n°50')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('une fiche sans nom se lit « #id » sur la carte (P220.03)', async () => {
    mocks.fetchPipelineColumn.mockImplementation((_t: string, { stage }: { stage: string }) =>
      Promise.resolve(stage === 'negotiating' ? [carte(13, '', { last_name: '', phone: null })] : []),
    );
    rendu(AGENT, 'vue=etapes&etape=negotiating');
    expect(await within(telephone()).findByText('#13')).toBeInTheDocument();
  });

  it('ce que le prospect cherche se lit sur la carte d’une étape (la démo n’en a aucun)', async () => {
    mocks.fetchPipelineColumn.mockImplementation((_t: string, { stage }: { stage: string }) =>
      Promise.resolve(
        stage === 'negotiating'
          ? [carte(14, 'Yacine', { seeking_contract_type: 'sale', budget_max: '85000000', seeking_property_types: ['villa'], seeking_neighborhoods: ['Almadies'] })]
          : [],
      ),
    );
    rendu(AGENT, 'vue=etapes&etape=negotiating');
    const tel = (await within(telephone()).findByText('Yacine Ndiaye')).closest('[data-slot="carte-etape"]') as HTMLElement;
    const ligne = within(tel).getByText(/Almadies/);
    expect(ligne.textContent).toMatch(/^Villa · Almadies · /);
    expect(ligne.textContent).toMatch(/85/);
    expect(ligne.textContent).not.toMatch(/property\.|nav\.|crm\./);
  });

  it('sans statistiques, des tirets dans les tuiles', async () => {
    mocks.fetchPipelineStats.mockReturnValue(new Promise(() => {}));
    rendu(ADMIN, 'vue=etapes');
    const tuile = await within(bureau()).findByRole('button', { name: /Prospects actifs/ });
    expect(tuile).toHaveTextContent('—');
  });

  it('un pipeline vide se dit en français, sans repli anglais ni clé brute', async () => {
    mocks.fetchPipelineColumn.mockResolvedValue([]);
    mocks.fetchPipelineStats.mockResolvedValue({ ...STATS, stage_counts: { lead: 0, prospect: 0, qualified: 0, negotiating: 0, converted: 0, lost: 0 } });
    rendu(ADMIN, 'vue=etapes');
    const colonne = await colonneLead();
    expect(await within(colonne).findByText('Déposer une carte ici')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/crm\.pipeline\.|No customers|Load more|Drop here/);
  });
});
