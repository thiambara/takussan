import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
import { TagsManager } from '../TagsManager';

const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/app/actions/admin-tags', () => ({
  createTagAction: (...args: unknown[]) => createMock(...args),
  updateTagAction: (...args: unknown[]) => updateMock(...args),
  deleteTagAction: (...args: unknown[]) => deleteMock(...args),
}));

const initialTags = [
  {
    id: 1,
    name: 'Piscine',
    slug: 'piscine',
    type: 'amenity' as const,
    icon: null,
    color: '#2563eb',
    description: null,
  },
  {
    id: 2,
    name: 'Meublé',
    slug: 'meuble',
    type: 'feature' as const,
    icon: null,
    color: null,
    description: null,
  },
];

function renderTagsManager() {
  return render(withIntl(<TagsManager initialTags={initialTags} />));
}

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<TagsManager />', () => {
  it('renders the initial tags in the table', () => {
    renderTagsManager();
    expect(screen.getByText('Piscine')).toBeInTheDocument();
    expect(screen.getByText('Meublé')).toBeInTheDocument();
  });

  it('filters by type via the tabs', async () => {
    const user = userEvent.setup();
    renderTagsManager();
    await user.click(screen.getByRole('tab', { name: 'Caractéristiques' }));
    expect(screen.queryByText('Piscine')).not.toBeInTheDocument();
    expect(screen.getByText('Meublé')).toBeInTheDocument();
  });

  it('surfaces a 409 from delete with a clear fallback message', async () => {
    const user = userEvent.setup();
    deleteMock.mockResolvedValue({ ok: false, status: 409, message: 'Tag in use' });

    renderTagsManager();
    const row = screen.getByText('Piscine').closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole('button', { name: /Supprimer/ }));

    expect(deleteMock).toHaveBeenCalledWith(1);
    expect(await screen.findByText(/utilisé par un ou plusieurs biens/i)).toBeInTheDocument();
  });

  it('opens the create dialog and calls createTagAction on submit', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      ok: true,
      data: {
        id: 3,
        name: 'Climatisation',
        slug: 'climatisation',
        type: 'amenity',
        icon: null,
        color: null,
        description: null,
      },
    });

    renderTagsManager();
    await user.click(screen.getByRole('button', { name: 'Nouveau tag' }));

    const nameInput = await screen.findByLabelText(/Libellé/);
    await user.type(nameInput, 'Climatisation');
    await user.click(screen.getByRole('button', { name: 'Créer le tag' }));

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0];
    expect(payload).toMatchObject({ name: 'Climatisation', type: 'amenity' });
  });
  /**
   * TCK-292 (lot L) — les cinq messages de `tagFormSchema` partaient en CLÉ BRUTE.
   *
   * Le test voisin (« opens the create dialog and calls createTagAction ») ne pouvait pas le voir :
   * il ne passe QUE par le chemin valide. Rien dans cette suite n'avait jamais regardé ce que le
   * formulaire affiche quand il refuse — d'où une régression invisible à la CI.
   *
   * Les libellés attendus sont ceux d'AVANT la conversion, au caractère près (apostrophe typographique
   * de « Nom d’icône » comprise) — relevés par `git show HEAD:takussan-web/src/lib/schemas/tag.ts`.
   *
   * ⚠️ **Quatre des cinq messages, pas cinq.** `tagFormSchema` valide `description` (max 500), mais
   * le dialogue ne rend AUCUN champ description : `validation.tag.descriptionTooLong` est
   * inatteignable depuis cette interface. Il n'est donc pas assertable ici — et le balayage
   * `attendAucuneCleBrute` le couvre le jour où un champ description apparaîtra.
   */
  it('rend les libellés FRANÇAIS de validation, jamais la clé (les 5 messages de tagFormSchema)', async () => {
    const user = userEvent.setup();
    renderTagsManager();
    await user.click(screen.getByRole('button', { name: 'Nouveau tag' }));

    const nom = await screen.findByLabelText(/Libellé/);
    const icone = screen.getByLabelText(/Icône/);
    const couleur = screen.getByLabelText(/Couleur/);

    // `fireEvent.change` plutôt que `user.type` pour les champs longs : `userEvent` coûte ~4,5 ms
    // par caractère, soit ~4,5 s pour 1000 caractères — et jusqu'à 17× cela sous charge.
    fireEvent.change(icone, { target: { value: 'x'.repeat(61) } });
    fireEvent.change(couleur, { target: { value: 'pas-une-couleur' } });
    // `name` reste VIDE → `nameRequired`. Le formulaire porte `noValidate` : la soumission passe.
    await user.click(screen.getByRole('button', { name: 'Créer le tag' }));

    expect(await screen.findByText('Le libellé est requis.')).toBeInTheDocument();
    expect(screen.getByText('Nom d’icône trop long.')).toBeInTheDocument();
    expect(screen.getByText('Couleur hexadécimale invalide (ex : #2563eb).')).toBeInTheDocument();
    attendAucuneCleBrute();
    expect(createMock).not.toHaveBeenCalled();

    // Second passage : le message de LONGUEUR du libellé, que le premier ne pouvait pas déclencher
    // (`min` court-circuite `max` sur le même champ).
    fireEvent.change(nom, { target: { value: 'n'.repeat(101) } });
    fireEvent.change(couleur, { target: { value: '#2563eb' } });
    await user.click(screen.getByRole('button', { name: 'Créer le tag' }));

    expect(await screen.findByText('Le libellé est trop long (100 caractères max).')).toBeInTheDocument();
    attendAucuneCleBrute();
    expect(createMock).not.toHaveBeenCalled();
  });
});
