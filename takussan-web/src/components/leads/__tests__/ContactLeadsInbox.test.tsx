/**
 * TCK-590 — la boîte « Demandes de contact » : une demande se lit EN ENTIER (la notification
 * d'avant tronquait le message à 80 caractères et omettait le téléphone) et se traite en un geste.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ContactLeadsInbox } from '../ContactLeadsInbox';
import type { ContactLead } from '@/lib/queries/contact-leads';
import { ApiError } from '@/lib/api';

const etat = vi.hoisted(() => ({
  leads: [] as ContactLead[],
  filtres: [] as string[],
  roles: ['agent'] as string[],
  capacites: ['crm.assign'] as string[],
  recherche: '',
  designe: null as { id: number | null; data?: ContactLead; isError?: boolean } | null,
}));
const handle = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const convert = { mutateAsync: vi.fn().mockResolvedValue({ customer: { id: 88 } }), isPending: false };
const assign = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const toastAdd = vi.fn();

vi.mock('@/lib/queries/contact-leads', () => ({
  useContactLeads: (filtre: string) => {
    etat.filtres.push(filtre);
    return {
      data: { data: etat.leads, meta: { total: etat.leads.length, last_page: 1 } },
      isLoading: false,
      isError: false,
    };
  },
  useContactLead: (id: number | null) => {
    etat.designe = { ...(etat.designe ?? {}), id };
    return id === null
      ? { data: undefined, isError: false }
      : { data: etat.designe.data ? { data: etat.designe.data } : undefined, isError: etat.designe.isError ?? false };
  },
  useHandleLead: () => handle,
  useConvertLead: () => convert,
  useAssignLead: () => assign,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.recherche),
}));

const lecturesDesMembres = vi.hoisted(() => [] as unknown[][]);

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => (lecturesDesMembres.push(args), {
    data: { data: [{ id: 21, first_name: 'Moussa', last_name: 'Fall' }] },
    isLoading: false,
  }),
}));

// P152.05 — « Attribuer » se juge aussi par `crm.assign` dans l'agence de la demande.
const lecturesDesCapacites = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/hooks/useCan', () => ({
  useCan: (capacite: string, ...reste: unknown[]) => (lecturesDesCapacites.push([capacite, ...reste]), {
    can: etat.capacites.includes(capacite),
    isLoading: false,
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, roles: etat.roles, agency_id: 3 } }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

const MESSAGE =
  'Bonjour, je cherche un appartement de trois pièces pour ma famille, disponible dès janvier, avec parking si possible.';

function lead(overrides: Partial<ContactLead> = {}): ContactLead {
  return {
    id: 1,
    property_id: 10,
    agency_id: 3,
    recipient_user_id: 7,
    channel: 'form',
    source: 'whatsapp',
    medium: 'share',
    name: 'Awa Diop',
    email: 'awa@example.sn',
    phone: '+221771234567',
    message: MESSAGE,
    handled_at: null,
    handled_by_id: null,
    customer_id: null,
    created_at: '2026-10-01T09:00:00Z',
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
    recipient: { id: 7, first_name: 'Fatou', last_name: 'Ndiaye' },
    ...overrides,
  };
}

describe('<ContactLeadsInbox> — TCK-590', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    etat.leads = [lead()];
    etat.filtres = [];
    etat.roles = ['agent'];
    etat.capacites = ['crm.assign'];
    etat.recherche = '';
    etat.designe = null;
  });

  it('le message se lit en entier, avec le téléphone, l’e-mail, le destinataire et la source', () => {
    render(withIntl(<ContactLeadsInbox />));

    expect(MESSAGE.length).toBeGreaterThan(80);
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.getByText('+221771234567')).toBeInTheDocument();
    expect(screen.getByText('awa@example.sn')).toBeInTheDocument();
    expect(screen.getByText('Pour Fatou Ndiaye')).toBeInTheDocument();
    expect(screen.getByText('Arrivé par whatsapp')).toBeInTheDocument();
    expect(etat.filtres[0]).toBe('todo');
  });

  it('répondre : WhatsApp pré-rempli, appel, e-mail', () => {
    render(withIntl(<ContactLeadsInbox />));

    const wa = screen.getByRole('link', { name: 'WhatsApp' });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221771234567\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href') ?? '')).toContain('« Villa à Almadies »');
    expect(wa).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:+221771234567');
    expect(screen.getByRole('link', { name: 'E-mail' })).toHaveAttribute('href', 'mailto:awa@example.sn');
  });

  it('marquer traitée et convertir appellent l’API ; la conversion mène à la fiche client', async () => {
    const user = userEvent.setup();
    render(withIntl(<ContactLeadsInbox />));

    await user.click(screen.getByRole('button', { name: 'Marquer traitée' }));
    expect(handle.mutateAsync).toHaveBeenCalledWith({ id: 1 });

    await user.click(screen.getByRole('button', { name: 'Convertir en client' }));
    expect(convert.mutateAsync).toHaveBeenCalledWith({ id: 1 });
    expect(await screen.findByRole('link', { name: 'Voir la fiche client' })).toHaveAttribute(
      'href',
      '/app/customers/88',
    );
  });

  it('TCK-1343 — un doublon (409 `customer.duplicate`) se présente comme dans le formulaire client, et « Convertir quand même » force', async () => {
    convert.mutateAsync.mockRejectedValueOnce(
      new ApiError(409, {
        code: 'customer.duplicate',
        existing: [
          { id: 55, name: 'Awa Diop', matched_on: 'phone' },
          { id: null, name: null, matched_on: 'email' },
        ],
      }),
    );
    const user = userEvent.setup();
    render(withIntl(<ContactLeadsInbox />));

    await user.click(screen.getByRole('button', { name: 'Convertir en client' }));

    expect(await screen.findByText('Ce client semble déjà exister dans l\'agence.')).toBeInTheDocument();
    expect(screen.getByText(/Awa Diop · même téléphone/)).toBeInTheDocument();
    expect(screen.getByText(/Une fiche que vous ne pouvez pas ouvrir · même e-mail/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir sa fiche' })).toHaveAttribute('href', '/app/customers/55');
    expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));

    await user.click(screen.getByRole('button', { name: 'Convertir quand même' }));
    expect(convert.mutateAsync).toHaveBeenLastCalledWith({ id: 1, allow_duplicate: true });
    expect(await screen.findByRole('link', { name: 'Voir la fiche client' })).toHaveAttribute(
      'href',
      '/app/customers/88',
    );
    expect(screen.queryByText('Ce client semble déjà exister dans l\'agence.')).not.toBeInTheDocument();
  });

  it('attribuer : l’administrateur de l’agence choisit un collègue', async () => {
    etat.roles = ['agency_admin'];
    const user = userEvent.setup();
    render(withIntl(<ContactLeadsInbox />));

    await user.click(screen.getByRole('button', { name: 'Attribuer' }));
    await user.selectOptions(await screen.findByLabelText('Collègue'), '21');
    await user.click(screen.getAllByRole('button', { name: 'Attribuer' }).at(-1)!);

    await waitFor(() => expect(assign.mutateAsync).toHaveBeenCalledWith({ id: 1, user_id: 21 }));
  });

  it('attribuer : la liste ne propose que les cibles que l’API accepte (P120.01, TCK-1246)', async () => {
    etat.roles = ['agency_admin'];
    const user = userEvent.setup();
    render(withIntl(<ContactLeadsInbox />));

    await user.click(screen.getByRole('button', { name: 'Attribuer' }));
    await screen.findByLabelText('Collègue');

    const [, chemin, options] = lecturesDesMembres.at(-1) as [unknown, string, { params: { filter?: unknown } }];
    expect(chemin).toBe('/api/agencies/3/members');
    expect(options.params.filter).toEqual({ assignable: 1 });
  });

  it('un bailleur sans crm.assign lit ses demandes mais n’a pas « Attribuer »', () => {
    etat.roles = ['owner'];
    etat.capacites = [];
    render(withIntl(<ContactLeadsInbox />));

    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attribuer' })).not.toBeInTheDocument();
  });

  it('P120.05 — l’agent qui détient crm.assign attribue, sur une liste triée par prénom', async () => {
    etat.roles = ['agent'];
    const user = userEvent.setup();
    render(withIntl(<ContactLeadsInbox />));

    await user.click(screen.getByRole('button', { name: 'Attribuer' }));
    await user.selectOptions(await screen.findByLabelText('Collègue'), '21');
    await user.click(screen.getAllByRole('button', { name: 'Attribuer' }).at(-1)!);

    await waitFor(() => expect(assign.mutateAsync).toHaveBeenCalledWith({ id: 1, user_id: 21 }));
    const [, , options] = lecturesDesMembres.at(-1) as [unknown, string, { params: { sort?: unknown } }];
    expect(options.params.sort).toBe('first_name');
  });

  it('sans téléphone : ni WhatsApp ni appel', () => {
    etat.leads = [lead({ phone: null })];
    render(withIntl(<ContactLeadsInbox />));

    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Appeler' })).not.toBeInTheDocument();
  });

  it('boîte vide', () => {
    etat.leads = [];
    render(withIntl(<ContactLeadsInbox />));
    expect(screen.getByText('Aucune demande en attente.')).toBeInTheDocument();
  });

  describe('P97.04 — la cible `lead` ouvre la boîte sur la demande (`?lead={id}`)', () => {
    it('la demande désignée, absente de la page, est rendue en tête et mise en avant', () => {
      etat.recherche = 'lead=42';
      etat.designe = { id: null, data: lead({ id: 42, name: 'Ousmane Sow', message: 'Demande du courriel' }) };
      render(withIntl(<ContactLeadsInbox />));

      expect(etat.designe?.id).toBe(42);
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Ousmane Sow');
      expect(items[0]).toHaveAttribute('aria-current', 'true');
      expect(items[1]).toHaveTextContent('Awa Diop');
      expect(items[1]).not.toHaveAttribute('aria-current');
    });

    it('la demande désignée déjà dans la page n’y est pas rendue deux fois', () => {
      etat.recherche = 'lead=1';
      etat.designe = { id: null, data: lead() };
      render(withIntl(<ContactLeadsInbox />));

      expect(screen.getAllByText('Awa Diop')).toHaveLength(1);
      expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'true');
    });

    it.each([['lead=abc'], ['lead=0'], ['lead=-3'], ['']])('« %s » : aucune lecture, la boîte se rend', (recherche) => {
      etat.recherche = recherche;
      render(withIntl(<ContactLeadsInbox />));

      expect(etat.designe?.id ?? null).toBeNull();
      expect(screen.getByText(MESSAGE)).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')[0]).not.toHaveAttribute('aria-current');
    });

    it('une lecture refusée est ignorée sans erreur', () => {
      etat.recherche = 'lead=99';
      etat.designe = { id: null, isError: true };
      render(withIntl(<ContactLeadsInbox />));

      expect(screen.getByText(MESSAGE)).toBeInTheDocument();
      expect(screen.queryByText('Les demandes n’ont pas pu être chargées.')).not.toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
  });

  it('P152.05 — un administrateur dont le rôle ne porte pas crm.assign n’a pas « Attribuer »', () => {
    etat.roles = ['agency_admin'];
    etat.capacites = ['agency.update'];
    render(withIntl(<ContactLeadsInbox />));

    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attribuer' })).not.toBeInTheDocument();
    // La capacité se lit dans l'agence de la demande.
    expect(lecturesDesCapacites.at(-1)?.slice(0, 2)).toEqual(['crm.assign', 3]);
  });
});
