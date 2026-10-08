import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimModerationItem,
  postModerationDecision,
  postModerationDecisionBatch,
  releaseModerationItem,
} from '@/lib/queries/super-admin';
import type { AdminModerationItem } from '@/types/super-admin';
import { ModerationBatchBar, ModerationDecisionPanel, ModerationQueueTable } from '../moderation';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/super-admin', () => ({
  postModerationDecision: vi.fn(),
  postModerationDecisionBatch: vi.fn(),
  claimModerationItem: vi.fn(),
  releaseModerationItem: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));

function itemDe(overrides: Partial<AdminModerationItem> = {}): AdminModerationItem {
  return {
    id: 'review:12',
    type: 'review',
    source_type: 'review',
    decisions: ['approve', 'hide', 'remove'],
    status: 'flagged',
    subject_type: 'review',
    subject_id: 12,
    subject: {
      id: 12,
      title: 'Avis injurieux',
      subtitle: 'Villa Almadies',
      href: '/super-admin/moderation?filter%5Btype%5D=review',
    },
    reporter: { id: 4, name: 'Awa Ndiaye', email: 'awa@example.test' },
    agency: { id: 2, name: 'Dakar Immo', slug: 'dakar-immo' },
    reason: 'Spam',
    reported_count: 2,
    suspicious: false,
    duplicate: null,
    claim: null,
    reported_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    age_minutes: 90,
    ...overrides,
  };
}

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return withIntl(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

async function choisirMotif(user: ReturnType<typeof userEvent.setup>, scope: HTMLElement, motif: string) {
  await user.click(within(scope).getByRole('combobox', { name: 'Motif' }));
  await user.click(await screen.findByRole('option', { name: motif }));
}

beforeEach(() => {
  vi.mocked(postModerationDecision).mockReset();
  vi.mocked(postModerationDecisionBatch).mockReset();
  vi.mocked(claimModerationItem).mockReset();
  vi.mocked(releaseModerationItem).mockReset();
});

describe('<ModerationDecisionPanel>', () => {
  it('requires a reason code and posts the selected decision', async () => {
    vi.mocked(postModerationDecision).mockResolvedValue({
      data: { id: 'review:12', decision: 'hide', subject_type: 'review', subject_id: 12 },
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(wrap(<ModerationDecisionPanel item={itemDe()} onDone={onDone} />));
    const panneau = screen.getByTestId('moderation-decision-panel');

    const hide = screen.getByRole('button', { name: /masquer l’avis|masquer l'avis/i });
    expect(hide).toBeDisabled();
    // Approuver ne demande pas de motif.
    expect(screen.getByRole('button', { name: /approuver l'avis/i })).toBeEnabled();

    await choisirMotif(user, panneau, 'Propos injurieux');
    expect(hide).toBeEnabled();
    await user.click(hide);

    await waitFor(() => expect(postModerationDecision).toHaveBeenCalledWith('review:12', {
      decision: 'hide',
      reason_code: 'offensive',
      reason: undefined,
    }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // TCK-597 (ADR-0043 §4) — seules les décisions valides pour le type sont proposées, et
  // « Masquer l'annonce » dit ce qu'il fait.
  it('n’offre que les décisions du type, et explique « Masquer l’annonce »', () => {
    render(wrap(
      <ModerationDecisionPanel
        item={itemDe({ id: 'property_report:3', type: 'property', source_type: 'property_report', decisions: ['hide', 'remove', 'reject'] })}
        onDone={vi.fn()}
      />,
    ));

    const panneau = screen.getByTestId('moderation-decision-panel');
    const libelles = within(panneau).getAllByRole('button').map((b) => b.textContent?.trim());
    expect(libelles).toEqual(expect.arrayContaining(["Masquer l'annonce", "Supprimer l'annonce", 'Classer le signalement']));
    expect(within(panneau).queryByRole('button', { name: /approuver/i })).toBeNull();
    expect(panneau).toHaveTextContent(/retire du site et la verrouille/i);
  });

  it('un avis n’offre ni « refuser » ni l’explication du verrou d’annonce', () => {
    render(wrap(<ModerationDecisionPanel item={itemDe()} onDone={vi.fn()} />));

    const panneau = screen.getByTestId('moderation-decision-panel');
    const decisions = within(panneau).getAllByRole('button')
      .map((b) => b.textContent?.trim())
      .filter((libelle) => libelle && /l'avis$/.test(libelle));
    expect(decisions).toEqual(["Approuver l'avis", "Masquer l'avis", "Supprimer l'avis"]);
    expect(within(panneau).getAllByRole('button')).toHaveLength(4); // + « Prendre en charge »
    expect(panneau).not.toHaveTextContent(/verrouille/i);
  });

  it('« Autre motif » exige le complément libre', async () => {
    const user = userEvent.setup();
    render(wrap(<ModerationDecisionPanel item={itemDe()} onDone={vi.fn()} />));
    const panneau = screen.getByTestId('moderation-decision-panel');

    await choisirMotif(user, panneau, 'Autre motif');
    expect(screen.getByRole('button', { name: /supprimer l'avis/i })).toBeDisabled();
    await user.type(screen.getByLabelText(/précisez le motif/i), 'Hors charte');
    expect(screen.getByRole('button', { name: /supprimer l'avis/i })).toBeEnabled();
  });

  it('un élément tenu par un autre affiche son nom et l’heure, et ne se décide pas', () => {
    render(wrap(
      <ModerationDecisionPanel
        item={itemDe({
          claim: {
            by: { id: 9, name: 'Fatou Sow' },
            claimed_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          },
        })}
        onDone={vi.fn()}
      />,
    ));

    expect(screen.getByTestId('moderation-claim')).toHaveTextContent(/pris par fatou sow/i);
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).toBeNull();
    expect(screen.getByRole('button', { name: /approuver l'avis/i })).toBeDisabled();
  });

  it('prendre en charge, puis rendre sa prise', async () => {
    vi.mocked(claimModerationItem).mockResolvedValue({
      data: { id: 'review:12', by: { id: 1, name: 'Moi' }, claimed_at: '', expires_at: '' },
    });
    const user = userEvent.setup();
    const { rerender } = render(wrap(<ModerationDecisionPanel item={itemDe()} onDone={vi.fn()} />));

    await user.click(screen.getByRole('button', { name: 'Prendre en charge' }));
    await waitFor(() => expect(claimModerationItem).toHaveBeenCalledWith('review:12'));

    rerender(wrap(
      <ModerationDecisionPanel
        item={itemDe({
          claim: { by: { id: 1, name: 'Moi' }, claimed_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600_000).toISOString() },
        })}
        onDone={vi.fn()}
      />,
    ));
    expect(screen.getByTestId('moderation-claim')).toHaveTextContent(/vous l'avez pris en charge/i);
    await user.click(screen.getByRole('button', { name: 'Rendre' }));
    await waitFor(() => expect(releaseModerationItem).toHaveBeenCalledWith('review:12'));
  });

  it('montre le signal d’un doublon et l’annonce recopiée', () => {
    render(wrap(
      <ModerationDecisionPanel
        item={itemDe({
          id: 'suspected_duplicate:4',
          type: 'property',
          source_type: 'suspected_duplicate',
          decisions: ['hide', 'reject'],
          duplicate: { signal: 'photo', distance: 1, matched: { id: 7, title: 'Villa Ngor', subtitle: 'TK-7', agency: 'Ngor Immo' } },
        })}
        onDone={vi.fn()}
      />,
    ));

    expect(screen.getByTestId('moderation-duplicate')).toHaveTextContent(/même photo/i);
    expect(screen.getByTestId('moderation-duplicate')).toHaveTextContent('« Villa Ngor » (Ngor Immo)');
  });
});

describe('<ModerationQueueTable>', () => {
  it('affiche l’âge, la prise en charge et le drapeau « suspect »', () => {
    render(wrap(
      <ModerationQueueTable
        items={[
          itemDe({ suspicious: true, age_minutes: 3 * 1440 }),
          itemDe({
            id: 'review:13',
            age_minutes: 25,
            claim: { by: { id: 9, name: 'Fatou Sow' }, claimed_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() },
          }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
        checkedIds={new Set()}
        onToggleChecked={vi.fn()}
      />,
    ));

    const premiere = screen.getByTestId('moderation-item-review:12');
    expect(premiere).toHaveTextContent('3 jours');
    expect(premiere).toHaveTextContent('Avis suspect');
    const seconde = screen.getByTestId('moderation-item-review:13');
    expect(seconde).toHaveTextContent('25 min');
    expect(seconde).toHaveTextContent(/pris par fatou sow/i);
  });
});

describe('<ModerationBatchBar>', () => {
  it('ne propose que les décisions communes et rend un résultat par élément', async () => {
    vi.mocked(postModerationDecisionBatch).mockResolvedValue({
      data: [
        { id: 'review:12', ok: true },
        { id: 'review:13', ok: false, status: 409, code: 'moderation.already_decided' },
      ],
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(wrap(
      <ModerationBatchBar
        items={[itemDe(), itemDe({ id: 'review:13' }), itemDe({ id: 'property_report:2', source_type: 'property_report', decisions: ['hide', 'remove', 'reject'] })]}
        onDone={onDone}
        onClear={vi.fn()}
      />,
    ));
    const barre = screen.getByTestId('moderation-batch-bar');
    expect(barre).toHaveTextContent('3 éléments sélectionnés');

    await user.click(within(barre).getByRole('combobox', { name: 'Décision' }));
    const options = await screen.findAllByRole('option');
    // review : approve/hide/remove ; property_report : hide/remove/reject → hide, remove.
    expect(options.map((o) => o.textContent)).toEqual(['Masquer', 'Supprimer']);
    await user.click(screen.getByRole('option', { name: 'Masquer' }));
    await choisirMotif(user, barre, 'Spam');
    await user.click(within(barre).getByRole('button', { name: /appliquer à 3 éléments/i }));

    await waitFor(() => expect(postModerationDecisionBatch).toHaveBeenCalledWith(
      ['review:12', 'review:13', 'property_report:2'],
      { decision: 'hide', reason_code: 'spam', reason: undefined },
    ));
    expect(await within(barre).findByRole('status')).toHaveTextContent('1 traité(s), 1 en échec.');
    expect(within(barre).getByRole('status')).toHaveTextContent('review:13 — déjà tranché');
    expect(onDone).toHaveBeenCalled();
  });

  it('sans décision commune, rien ne s’applique', () => {
    render(wrap(
      <ModerationBatchBar
        items={[
          itemDe({ id: 'property:1', source_type: 'property', decisions: ['approve', 'reject'] }),
          itemDe({ id: 'suspected_duplicate:2', source_type: 'suspected_duplicate', decisions: ['hide', 'reject'] }),
          itemDe(),
        ]}
        onDone={vi.fn()}
        onClear={vi.fn()}
      />,
    ));

    expect(screen.getByTestId('moderation-batch-bar')).toHaveTextContent(/aucune décision n'est commune/i);
    expect(screen.getByRole('button', { name: /appliquer/i })).toBeDisabled();
  });
});
