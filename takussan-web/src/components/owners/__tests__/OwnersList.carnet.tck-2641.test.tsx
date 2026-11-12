import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { OwnerProfileSummary } from '@/lib/queries/owners';
import { withIntl } from '@/test/intl';
import { OwnersList, type OwnersListProps } from '../OwnersList';

/**
 * TCK-2641 — le carnet des bailleurs : le téléphone repris du compte (AC1), le lien de chaque ligne
 * vers la fiche pour l'admin seulement (AC2, 3a), les montants tels que l'API les rend, les gestes
 * d'une invitation en cours sous le pouce (AC4), et les vues écrites dans l'URL.
 */
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/owners',
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async () => donnees),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const base = {
  agency_id: 7, created_at: null,
  rib_masked: null, tax_id_masked: null, id_document_number_masked: null,
} as const;

/** owner1 de la démo : le numéro est sur le compte, pas sur l'invitation. */
const sene = {
  ...base, id: 1, user_id: 9, status: 'active',
  metadata: { owner_type: 'individual', first_name: 'Mouhamed', last_name: 'Sène', phone: null },
  user: { id: 9, first_name: 'Mouhamed', last_name: 'Sène', email: 'mouhamed.sene@example.test' },
  contact_phone: '+221703757526', contact_email: 'mouhamed.sene@example.test',
  properties_count: 7, occupied_properties_count: 6,
  remaining_to_pay: 3117369, collected_this_month: 11437597, last_payout_at: '2026-11-05T10:00:00+00:00',
};
const ndiaye = {
  ...base, id: 2, user_id: 10, status: 'active',
  metadata: { owner_type: 'individual', first_name: 'El Hadji', last_name: 'Ndiaye' },
  user: { id: 10, first_name: 'El Hadji', last_name: 'Ndiaye', email: 'eh@example.test' },
  contact_phone: '+221775124088', properties_count: 5, occupied_properties_count: 5,
  remaining_to_pay: 0, collected_this_month: 2480000, last_payout_at: '2026-10-15T10:00:00+00:00',
};
const faye = {
  ...base, id: 3, user_id: null, status: 'draft',
  metadata: { owner_type: 'individual', first_name: 'Khady', last_name: 'Faye', email: 'khady@example.test', phone: '+221772184530' },
  user: null, contact_phone: '+221772184530', properties_count: 0, occupied_properties_count: 0,
  remaining_to_pay: null, collected_this_month: null, last_payout_at: null,
  pending_invitation_id: 44,
  pending_invitation_sent_at: new Date(Date.now() - 3 * 86_400_000 - 3_600_000).toISOString(),
};

const donnees = {
  data: [sene, ndiaye, faye] as unknown as OwnerProfileSummary[],
  meta: { total: 3, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

function monter(props: Partial<OwnersListProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <OwnersList agencyId={7} canInvite initialData={donnees} lienVersLaFiche lectureArgent {...props} />
    </QueryClientProvider>,
  ));
}

const cartes = () => screen.getAllByRole('article').filter((a) => a.getAttribute('data-slot') === 'carte-du-bailleur');
const carteDe = (nom: string) => within(cartes().find((c) => within(c).queryByText(nom)) as HTMLElement);
const rangeeDe = (nom: string) => within(within(screen.getByRole('table')).getByText(nom).closest('tr') as HTMLElement);

beforeEach(() => replace.mockReset());

describe('TCK-2641 — le carnet des bailleurs', () => {
  it('AC1 — le numéro du compte : affiché, « Appeler » en tel:+221…, « WhatsApp » en wa.me/221…', () => {
    monter();
    expect(rangeeDe('Mouhamed Sène').getByText('+221 70 375 75 26')).toBeInTheDocument();
    for (const portee of [carteDe('Mouhamed Sène'), rangeeDe('Mouhamed Sène')]) {
      expect(portee.getByRole('link', { name: 'Appeler Mouhamed Sène' })).toHaveAttribute('href', 'tel:+221703757526');
      expect(portee.getByRole('link', { name: 'Écrire à Mouhamed Sène sur WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221703757526\?text=/);
    }
  });

  it('AC2 — chaque bailleur actif mène à sa fiche ; une invitation en cours, non', () => {
    monter();
    for (const [nom, id] of [['Mouhamed Sène', 1], ['El Hadji Ndiaye', 2]] as const) {
      expect(carteDe(nom).getByRole('link', { name: nom })).toHaveAttribute('href', `/app/owners/${id}`);
      expect(rangeeDe(nom).getByRole('link', { name: nom })).toHaveAttribute('href', `/app/owners/${id}`);
    }
    expect(screen.queryAllByRole('link', { name: 'Khady Faye' })).toHaveLength(0);
  });

  it('3a — l’agent ne voit aucun lien vers la fiche', () => {
    monter({ lienVersLaFiche: false, lectureArgent: false });
    expect(document.querySelectorAll('[data-slot="lien-vers-la-fiche"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href^="/app/owners/"]')).toHaveLength(0);
    expect(screen.getAllByText('Mouhamed Sène').length).toBeGreaterThan(0);
  });

  it('les montants sont ceux de la ligne : reste à verser, encaissé du mois, « Tout est versé »', () => {
    monter();
    // `useFormatteurs().montant` sépare les milliers par une espace insécable étroite.
    const montant = (n: string) => new RegExp(n.replace(/ /g, '[\\s\\u202f\\u00a0]'));
    expect(carteDe('Mouhamed Sène').getByText(montant('3 117 369'))).toBeInTheDocument();
    expect(rangeeDe('Mouhamed Sène').getByText(montant('3 117 369'))).toBeInTheDocument();
    expect(rangeeDe('Mouhamed Sène').getByText(montant('11 437 597'))).toBeInTheDocument();
    expect(carteDe('El Hadji Ndiaye').getByText('Tout est versé')).toBeInTheDocument();
    expect(carteDe('Mouhamed Sène').getByText('7 biens · 6 occupés')).toBeInTheDocument();
    expect(carteDe('El Hadji Ndiaye').getByText('5 biens · tous occupés')).toBeInTheDocument();
  });

  it('sans lecture du relevé, aucune bande d’argent ni vue « Avec reste à verser »', () => {
    const sansArgent = {
      ...donnees as { data: OwnerProfileSummary[] },
      data: [{ ...sene, remaining_to_pay: null, collected_this_month: null, last_payout_at: null }],
    } as never;
    monter({ initialData: sansArgent, lectureArgent: false });
    expect(carteDe('Mouhamed Sène').queryByText('Reste à verser')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Avec reste à verser/ })).toHaveLength(0);
  });

  it('AC4 — l’invitation en cours : envoyée il y a 3 j, « Renvoyer » et « Révoquer » de 44 px au téléphone', () => {
    monter();
    const carte = within(screen.getAllByRole('article').find((a) => a.getAttribute('data-slot') === 'carte-d-invitation') as HTMLElement);
    expect(carte.getByText('invitation envoyée il y a 3 j')).toBeInTheDocument();
    for (const nom of [/^Renvoyer l’invitation/, /^Révoquer l’invitation/]) {
      expect(carte.getByRole('button', { name: nom }).className).toMatch(/\bh-11\b/);
    }
    expect(rangeeDe('Khady Faye').getByText('Invitation · 3 j')).toBeInTheDocument();
  });

  it('4a — le résumé du carnet entier : la ligne « N bailleurs · N biens · … à verser » et le compte de chaque vue', () => {
    const resume = { owners: 11, properties: 84, remaining_to_pay: 11991119, with_remaining: 5, invitations: 1 };
    monter({ initialData: { ...(donnees as object), meta: { ...(donnees as { meta: object }).meta, summary: resume } } as never });
    const montant = (n: string) => n.replace(/ /g, '[\\s\\u202f\\u00a0]');
    // Bureau : en sous-titre, avec le mois ; téléphone : en tête de la liste des bailleurs.
    expect(screen.getByText(new RegExp(`^11 bailleurs · 84 biens · ${montant('11 991 119 F')} à verser en \\p{L}+$`, 'u'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: new RegExp(`^11 bailleurs · 84 biens · ${montant('11 991 119 F')} à verser`) })).toBeInTheDocument();
    // « Tous » compte les bailleurs ET les invitations, comme la vue qui les montre tous.
    const compte = (nom: RegExp) => screen.getAllByRole('button', { name: nom })[0];
    expect(compte(/^Tous/)).toHaveTextContent('12');
    expect(compte(/Avec reste à verser/)).toHaveTextContent('5');
    expect(compte(/^Invitations/)).toHaveTextContent('1');
  });

  it('4a — sans lecture du relevé, le résumé ne dit rien de l’argent ; sans résumé, le sous-titre', () => {
    const resume = { owners: 11, properties: 84, remaining_to_pay: null, with_remaining: null, invitations: 1 };
    monter({ lectureArgent: false, initialData: { ...(donnees as object), meta: { ...(donnees as { meta: object }).meta, summary: resume } } as never });
    // En sous-titre au bureau et en tête de liste au téléphone, sans montant.
    expect(screen.getAllByText('11 bailleurs · 84 biens')).toHaveLength(2);
    expect(screen.queryAllByText(/biens · .*à verser/)).toHaveLength(0);
  });

  it('4a — sans résumé (super-admin hors agence), le sous-titre, et des vues sans compte', () => {
    monter();
    expect(screen.getByText('Gérez les bailleurs rattachés à votre agence.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^2 bailleurs/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Tous/ })[0]).toHaveTextContent(/^Tous$/);
  });

  it('une vue s’écrit dans l’URL et ramène à la première page', async () => {
    monter({ initialData: { ...(donnees as object), meta: { ...(donnees as { meta: object }).meta, summary: { owners: 11, properties: 84, remaining_to_pay: 1, with_remaining: 5, invitations: 1 } } } as never });
    const pastille = screen.getAllByRole('button', { name: /Avec reste à verser/ })[0];
    expect(pastille).toHaveTextContent('5');
    await userEvent.click(pastille);
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('vue=reste'), expect.anything());
  });
});
