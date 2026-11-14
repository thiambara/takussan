/**
 * TCK-2632 (AC4) — « Nouvelle conversation » → une personne : son fil existant s'ouvre, sans aucun
 * `POST` ; sans fil, un brouillon ; si la vérification échoue, on le dit au lieu d'ouvrir un
 * brouillon qui créerait un second fil. Le premier envoi du brouillon crée le fil en UNE requête.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { NouvelleConversation } from '../NouvelleConversation';
import { BrouillonDirect } from '../BrouillonDirect';

const trouver = vi.fn();
const creer = vi.fn();
let pending = false;
const PERSONNES = [
  { id: 9, name: 'Awa Ndiaye', avatar_url: null },
  { id: 12, name: 'Malick Seck', avatar_url: null },
];
// TCK-2830 — sans recherche, chaque section lit sa requête : ces deux personnes sans relation ne
// sont rendues que par la section « autre », comme le ferait le serveur.
// TCK-2830 — la ligne de détail lit l'espace actif (nom de l'agence de l'équipe) ; non exercée ici.
vi.mock('@/hooks/useNomDeLAgenceActive', () => ({ useNomDeLAgenceActive: () => null }));
vi.mock('@/lib/queries/conversations', () => ({
  useMessagingContacts: (_terme: string, options: { section?: string } = {}) => {
    const data = options.section === undefined || options.section === 'autre' ? PERSONNES : [];
    return { data: { data, meta: { total: data.length } }, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useTrouverLeFilDirect: () => trouver,
  useCreateDirectConversation: () => ({ mutateAsync: creer, isPending: pending }),
  // TCK-2748 — le mode « groupe » du bureau monte la création ; non exercée ici.
  useCreateGroupConversation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function monter(extra: { onNouveauGroupe?: () => void } = {}) {
  const props = { onClose: vi.fn(), onOuvrir: vi.fn(), onBrouillon: vi.fn(), ...extra };
  render(withIntl(<NouvelleConversation open {...props} />));
  return props;
}

beforeEach(() => {
  trouver.mockReset();
  creer.mockReset();
  pending = false;
});

describe('<NouvelleConversation> (TCK-2632)', () => {
  it('AC4 — une personne qui a déjà un fil : il s’ouvre, et aucun brouillon', async () => {
    trouver.mockResolvedValue(77);
    const p = monter();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Awa Ndiaye' }));
    });
    expect(trouver).toHaveBeenCalledWith(PERSONNES[0]);
    expect(p.onOuvrir).toHaveBeenCalledWith(77);
    expect(p.onBrouillon).not.toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalled();
  });

  it('sans fil : le brouillon de cette personne', async () => {
    trouver.mockResolvedValue(null);
    const p = monter();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Malick Seck' }));
    });
    expect(p.onBrouillon).toHaveBeenCalledWith(PERSONNES[1]);
    expect(p.onOuvrir).not.toHaveBeenCalled();
  });

  it('la vérification échoue : on le dit, sans brouillon ni fil', async () => {
    trouver.mockRejectedValue(new Error('boom'));
    const p = monter();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Awa Ndiaye' }));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(p.onBrouillon).not.toHaveBeenCalled();
    expect(p.onOuvrir).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('« Créer un groupe » n’existe que si l’espace le propose', () => {
    monter();
    expect(screen.queryByRole('button', { name: /Créer un groupe/ })).not.toBeInTheDocument();
  });

  // Maquette a/3 : « ✕ » en tête au téléphone (avant le titre), en fin de ligne au bureau.
  it('« Fermer » précède le titre au téléphone, le suit au bureau, et ferme', () => {
    const p = monter();
    const fermer = screen.getByRole('button', { name: 'Fermer' });
    const titre = screen.getByRole('heading', { name: 'Nouvelle conversation' });
    expect(fermer.compareDocumentPosition(titre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fermer).toHaveClass('lg:order-last');
    // Un seul « Fermer » : celui du dialogue par défaut, en haut à droite, n'est plus rendu.
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(1);
    fireEvent.click(fermer);
    expect(p.onClose).toHaveBeenCalled();
  });

  it('« Créer un groupe » ferme ce dialogue et ouvre la création', () => {
    const onNouveauGroupe = vi.fn();
    const p = monter({ onNouveauGroupe });
    fireEvent.click(screen.getByRole('button', { name: /Créer un groupe/ }));
    expect(onNouveauGroupe).toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalled();
  });
});

describe('<BrouillonDirect> (TCK-2632, AC4)', () => {
  const awa = PERSONNES[0]!;

  it('le premier envoi crée le fil en une requête, puis l’ouvre', async () => {
    creer.mockResolvedValue({ data: { id: 55 } });
    const onCreated = vi.fn();
    render(withIntl(<BrouillonDirect personne={awa} onCreated={onCreated} />));
    expect(screen.getByRole('heading', { name: 'Awa Ndiaye' })).toBeInTheDocument();
    const envoyer = screen.getByRole('button', { name: 'Envoyer' });
    expect(envoyer).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message à Awa Ndiaye' }), { target: { value: '  Bonjour Awa ' } });
    await act(async () => {
      fireEvent.click(envoyer);
    });
    expect(creer).toHaveBeenCalledTimes(1);
    expect(creer).toHaveBeenCalledWith({ participants: [9], initial_message: 'Bonjour Awa' });
    expect(onCreated).toHaveBeenCalledWith(55);
  });

  it('un refus se dit dans le composeur, et le texte reste', async () => {
    creer.mockRejectedValue(new Error('refus'));
    const onCreated = vi.fn();
    render(withIntl(<BrouillonDirect personne={awa} onCreated={onCreated} />));
    const champ = screen.getByRole('textbox', { name: 'Message à Awa Ndiaye' });
    fireEvent.change(champ, { target: { value: 'Bonjour' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(champ).toHaveValue('Bonjour');
    expect(onCreated).not.toHaveBeenCalled();
  });
});
