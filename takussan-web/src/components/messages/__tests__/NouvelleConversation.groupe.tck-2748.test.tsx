/**
 * TCK-2748 (AC1) — au bureau, « Nouvelle conversation » bascule en « groupe » DANS le même dialogue
 * (maquette a-3) : destinataires en puces, nom, bien et bail rattachés, puis `POST` groupe ; le fil
 * créé s'ouvre. Sans `onNouveauGroupe` (l'espace ne propose pas de groupe), ni rangée ni interrupteur.
 *
 * TCK-2861 — ce test change d'attentes, et c'est voulu : les personnes ne se choisissent plus dans le
 * menu d'un sélecteur mais dans la liste sous le champ « À » (une puce par personne) ; au téléphone,
 * « Créer un groupe » n'ouvre plus `NewGroupDialog` : c'est l'interrupteur de la feuille (maquette e3).
 * Les cas neufs du ticket (bascule automatique, retour au direct, « Écrire », « À : », pied) suivent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { NouvelleConversation } from '../NouvelleConversation';

const creerGroupe = vi.fn();
const trouver = vi.fn();
let agence: string | null = null;
const PERSONNES = [
  { id: 9, name: 'Awa Ndiaye', avatar_url: null },
  { id: 12, name: 'Malick Seck', avatar_url: null },
  { id: 15, name: 'Astou Sy', avatar_url: null },
];
const BIENS = [{ id: 31, title: 'F3 · Sacré-Cœur 3', reference_number: 'PR-0031' }];
const vide = { data: { data: [], meta: { total: 0 } }, isFetching: false, isError: false, refetch: vi.fn() };

// TCK-2830 — la ligne de détail lit l'espace actif (nom de l'agence de l'équipe) ; non exercée ici.
// TCK-2861 — la recherche sans délai : sous le debounce réel, les quatre sections (même double)
// montreraient la même personne quatre fois le temps qu'il passe.
vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: <T,>(v: T) => v }));
vi.mock('@/hooks/useNomDeLAgenceActive', () => ({ useNomDeLAgenceActive: () => agence }));
vi.mock('@/lib/queries/conversations', () => ({
  useMessagingContacts: () => ({
    data: { data: PERSONNES, meta: { total: PERSONNES.length } },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useTrouverLeFilDirect: () => trouver,
  useCreateGroupConversation: () => ({ mutateAsync: creerGroupe, isPending: false }),
  useGroupPropertyOptions: () => ({ ...vide, data: { data: BIENS, meta: { total: 1 } } }),
  useGroupLeaseOptions: () => vide,
}));

function monter(extra: { bureau?: boolean; onNouveauGroupe?: () => void } = {}) {
  const props = { onClose: vi.fn(), onOuvrir: vi.fn(), onBrouillon: vi.fn(), ...extra };
  render(withIntl(<NouvelleConversation open {...props} />));
  return props;
}

/** TCK-2861 — chercher dans « À », puis toucher la personne dans la liste : elle devient une puce. */
async function choisirUnePersonne(user: ReturnType<typeof userEvent.setup>, nom: string, champ = 'À') {
  await user.type(screen.getByLabelText(champ), nom.slice(0, 3));
  await user.click(await screen.findByRole('button', { name: nom }));
}

beforeEach(() => {
  creerGroupe.mockReset();
  trouver.mockReset();
  agence = null;
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

  it('au téléphone aussi, « Créer un groupe » est l’interrupteur de la feuille (TCK-2861)', async () => {
    const user = userEvent.setup();
    const p = monter({ bureau: false, onNouveauGroupe: vi.fn() });
    const interrupteur = screen.getByRole('switch', { name: /Créer un groupe/ });
    await user.click(interrupteur);
    expect(p.onNouveauGroupe).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: /Créer un groupe/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Nom du groupe')).toBeInTheDocument();
  });

  it('au bureau, sans groupe proposé par l’espace : ni rangée ni interrupteur', () => {
    monter({ bureau: true });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Créer un groupe')).not.toBeInTheDocument();
  });
});

describe('<NouvelleConversation> — les puces et la bascule automatique (TCK-2861)', () => {
  it('AC4 — au bureau, Malick puis Awa : l’interrupteur s’allume sans geste de plus, et le groupe s’ouvre', async () => {
    const user = userEvent.setup();
    monter({ bureau: true, onNouveauGroupe: vi.fn() });
    const interrupteur = () => screen.getByRole('switch', { name: /Créer un groupe/ });
    expect(screen.getByText('Activé d’office à partir de deux destinataires.')).toBeInTheDocument();

    await choisirUnePersonne(user, 'Malick Seck');
    expect(screen.getByRole('button', { name: 'Retirer Malick Seck' })).toBeInTheDocument();
    expect(interrupteur()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Nom du groupe')).not.toBeInTheDocument();

    await choisirUnePersonne(user, 'Awa Ndiaye');
    expect(interrupteur()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Nom du groupe')).toBeInTheDocument();
    expect(screen.getByLabelText('Bien rattaché')).toBeInTheDocument();
    expect(screen.getByLabelText('Bail rattaché')).toBeInTheDocument();
    // Les puces déjà choisies restent.
    expect(screen.getByRole('button', { name: 'Retirer Malick Seck' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer Awa Ndiaye' })).toBeInTheDocument();
  });

  it('retirer une puce sous deux repasse en direct : plus de nom de groupe, « Écrire »', async () => {
    const user = userEvent.setup();
    monter({ bureau: true, onNouveauGroupe: vi.fn() });
    await choisirUnePersonne(user, 'Malick Seck');
    await choisirUnePersonne(user, 'Awa Ndiaye');
    await user.click(screen.getByRole('button', { name: 'Retirer Awa Ndiaye' }));
    expect(screen.getByRole('switch', { name: /Créer un groupe/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Nom du groupe')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Écrire' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer Malick Seck' })).toBeInTheDocument();
  });

  it('même allumé à la main, le groupe repasse en direct quand on retire une puce sous deux', async () => {
    const user = userEvent.setup();
    monter({ bureau: true, onNouveauGroupe: vi.fn() });
    await user.click(screen.getByRole('switch', { name: /Créer un groupe/ }));
    await choisirUnePersonne(user, 'Malick Seck');
    await choisirUnePersonne(user, 'Awa Ndiaye');
    await user.click(screen.getByRole('button', { name: 'Retirer Awa Ndiaye' }));
    expect(screen.getByRole('switch', { name: /Créer un groupe/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Nom du groupe')).not.toBeInTheDocument();
  });

  it('une seule puce + « Écrire » ouvre le fil direct de cette personne', async () => {
    trouver.mockResolvedValue(77);
    const user = userEvent.setup();
    const p = monter({ bureau: true, onNouveauGroupe: vi.fn() });
    await choisirUnePersonne(user, 'Malick Seck');
    expect(trouver).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Écrire' }));
    await waitFor(() => expect(p.onOuvrir).toHaveBeenCalledWith(77));
    expect(trouver).toHaveBeenCalledWith(PERSONNES[1]);
    expect(creerGroupe).not.toHaveBeenCalled();
  });

  it('une personne en puce n’est plus proposée', async () => {
    const user = userEvent.setup();
    monter({ bureau: true, onNouveauGroupe: vi.fn() });
    await choisirUnePersonne(user, 'Malick Seck');
    await user.type(screen.getByLabelText('À'), 'Mal');
    await screen.findByRole('button', { name: 'Awa Ndiaye' });
    expect(screen.queryByRole('button', { name: 'Malick Seck' })).not.toBeInTheDocument();
  });

  it('une personne en puce ne fait pas dire « précisez la recherche » à une liste complète', async () => {
    const user = userEvent.setup();
    monter({ bureau: true, onNouveauGroupe: vi.fn() });
    await choisirUnePersonne(user, 'Malick Seck');
    await user.type(screen.getByLabelText('À'), 'Awa');
    await screen.findByRole('button', { name: 'Awa Ndiaye' });
    expect(screen.queryByText(/précisez la recherche/)).not.toBeInTheDocument();
  });

  it('AC4 — au téléphone, le champ est précédé de « À : » et la phrase de pied nomme l’agence', async () => {
    agence = 'Dakar Immo';
    const user = userEvent.setup();
    monter({ bureau: false, onNouveauGroupe: vi.fn() });
    expect(screen.getByLabelText('À :')).toBeInTheDocument();
    expect(screen.getByText('Vous pouvez écrire aux clients, aux propriétaires et aux collègues de Dakar Immo.')).toBeInTheDocument();
    // Au téléphone aussi, la deuxième puce passe en groupe.
    await choisirUnePersonne(user, 'Malick Seck', 'À :');
    await choisirUnePersonne(user, 'Awa Ndiaye', 'À :');
    expect(screen.getByRole('switch', { name: /Créer un groupe/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('sans agence lue, pas de phrase de pied (elle serait fausse)', () => {
    monter({ bureau: false, onNouveauGroupe: vi.fn() });
    expect(screen.queryByText(/Vous pouvez écrire aux clients/)).not.toBeInTheDocument();
  });
});
