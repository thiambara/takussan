/**
 * TCK-2748 (AC1) — au bureau, « Nouvelle conversation » bascule en « groupe » DANS le même dialogue
 * (maquette a-3) : destinataires en puces, nom, bien et bail rattachés, puis `POST` groupe ; le fil
 * créé s'ouvre. Au téléphone, la rangée « Créer un groupe » mène toujours à `NewGroupDialog`
 * (TCK-2632). Sans `onNouveauGroupe` (l'espace ne propose pas de groupe), ni rangée ni interrupteur.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { NouvelleConversation } from '../NouvelleConversation';

const creerGroupe = vi.fn();
const PERSONNES = [
  { id: 9, name: 'Awa Ndiaye', avatar_url: null },
  { id: 12, name: 'Malick Seck', avatar_url: null },
  { id: 15, name: 'Astou Sy', avatar_url: null },
];
const BIENS = [{ id: 31, title: 'F3 · Sacré-Cœur 3', reference_number: 'PR-0031' }];
const vide = { data: { data: [], meta: { total: 0 } }, isFetching: false, isError: false, refetch: vi.fn() };

// TCK-2830 — la ligne de détail lit l'espace actif (nom de l'agence de l'équipe) ; non exercée ici.
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: undefined }) }));
vi.mock('@/lib/queries/conversations', () => ({
  useMessagingContacts: () => ({
    data: { data: PERSONNES, meta: { total: PERSONNES.length } },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useTrouverLeFilDirect: () => vi.fn(),
  useCreateGroupConversation: () => ({ mutateAsync: creerGroupe, isPending: false }),
  useGroupPropertyOptions: () => ({ ...vide, data: { data: BIENS, meta: { total: 1 } } }),
  useGroupLeaseOptions: () => vide,
}));

function monter(extra: { bureau?: boolean; onNouveauGroupe?: () => void } = {}) {
  const props = { onClose: vi.fn(), onOuvrir: vi.fn(), onBrouillon: vi.fn(), ...extra };
  render(withIntl(<NouvelleConversation open {...props} />));
  return props;
}

async function choisirUnePersonne(user: ReturnType<typeof userEvent.setup>, nom: string) {
  const champ = screen.getByLabelText('À');
  await user.click(champ);
  await user.click(await screen.findByRole('option', { name: nom }));
}

beforeEach(() => {
  creerGroupe.mockReset();
});

describe('<NouvelleConversation> — le groupe en un formulaire (TCK-2748)', () => {
  it('au bureau, « Créer un groupe » est un interrupteur du dialogue, pas un passage à un autre', async () => {
    const user = userEvent.setup();
    const p = monter({ bureau: true, onNouveauGroupe: vi.fn() });
    const interrupteur = screen.getByRole('switch', { name: /Créer un groupe/ });
    expect(interrupteur).toHaveAttribute('aria-checked', 'false');
    await user.click(interrupteur);
    expect(p.onNouveauGroupe).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('groupe-en-un-formulaire')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Créer un groupe/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Nom du groupe')).toBeInTheDocument();
    expect(screen.getByLabelText('Bien rattaché')).toBeInTheDocument();
    expect(screen.getByLabelText('Bail rattaché')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer le groupe' })).toBeInTheDocument();
  });

  it('crée le groupe par un POST groupe, bien rattaché compris, et ouvre le fil', async () => {
    creerGroupe.mockResolvedValue({ data: { id: 404 } });
    const user = userEvent.setup();
    const p = monter({ bureau: true, onNouveauGroupe: vi.fn() });
    await user.click(screen.getByRole('switch', { name: /Créer un groupe/ }));
    await choisirUnePersonne(user, 'Awa Ndiaye');
    await choisirUnePersonne(user, 'Astou Sy');
    // Les destinataires, en puces retirables.
    expect(screen.getByRole('button', { name: /Retirer Awa Ndiaye/ })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nom du groupe'), 'Travaux · F3');
    await user.click(screen.getByLabelText('Bien rattaché'));
    await user.click(await screen.findByRole('option', { name: /F3 · Sacré-Cœur 3/ }));
    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));

    await waitFor(() => expect(p.onOuvrir).toHaveBeenCalledWith(404));
    expect(creerGroupe).toHaveBeenCalledWith({ type: 'group', subject: 'Travaux · F3', participants: [9, 15], property_id: 31 });
    expect(p.onClose).toHaveBeenCalled();
  });

  it('refuse un groupe de moins de trois personnes, sans appel', async () => {
    const user = userEvent.setup();
    const p = monter({ bureau: true, onNouveauGroupe: vi.fn() });
    await user.click(screen.getByRole('switch', { name: /Créer un groupe/ }));
    await choisirUnePersonne(user, 'Awa Ndiaye');
    await user.type(screen.getByLabelText('Nom du groupe'), 'Deux');
    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/3/);
    expect(creerGroupe).not.toHaveBeenCalled();
    expect(p.onOuvrir).not.toHaveBeenCalled();
  });

  it('Entrée dans le champ « À » ne soumet pas le formulaire du groupe', async () => {
    const user = userEvent.setup();
    const p = monter({ bureau: true, onNouveauGroupe: vi.fn() });
    await user.click(screen.getByRole('switch', { name: /Créer un groupe/ }));
    await user.type(screen.getByLabelText('Nom du groupe'), 'Travaux');
    await user.click(screen.getByLabelText('À'));
    await user.keyboard('Awa{Enter}');
    expect(creerGroupe).not.toHaveBeenCalled();
    expect(p.onOuvrir).not.toHaveBeenCalled();
    expect(screen.getByTestId('groupe-en-un-formulaire')).toBeInTheDocument();
  });

  it('au téléphone, la rangée mène toujours à la création en deux étapes (TCK-2632)', async () => {
    const user = userEvent.setup();
    const p = monter({ bureau: false, onNouveauGroupe: vi.fn() });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Créer un groupe/ }));
    expect(p.onNouveauGroupe).toHaveBeenCalled();
  });

  it('au bureau, sans groupe proposé par l’espace : ni rangée ni interrupteur', () => {
    monter({ bureau: true });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Créer un groupe')).not.toBeInTheDocument();
  });
});
