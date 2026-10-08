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

const etat = vi.hoisted(() => ({
  leads: [] as ContactLead[],
  filtres: [] as string[],
  roles: ['agent'] as string[],
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
  useHandleLead: () => handle,
  useConvertLead: () => convert,
  useAssignLead: () => assign,
}));

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: () => ({
    data: { data: [{ id: 21, first_name: 'Moussa', last_name: 'Fall' }] },
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

  it('attribuer : l’administrateur de l’agence choisit un collègue', async () => {
    etat.roles = ['agency_admin'];
    const user = userEvent.setup();
    render(withIntl(<ContactLeadsInbox />));

    await user.click(screen.getByRole('button', { name: 'Attribuer' }));
    await user.selectOptions(await screen.findByLabelText('Collègue'), '21');
    await user.click(screen.getAllByRole('button', { name: 'Attribuer' }).at(-1)!);

    await waitFor(() => expect(assign.mutateAsync).toHaveBeenCalledWith({ id: 1, user_id: 21 }));
  });

  it.each([['owner'], ['agent']])('%s lit ses demandes mais n’a pas « Attribuer » (liste des membres réservée à l’admin)', (role) => {
    etat.roles = [role];
    render(withIntl(<ContactLeadsInbox />));

    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attribuer' })).not.toBeInTheDocument();
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
});
