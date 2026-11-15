/**
 * TCK-590 — la boîte « Demandes de contact » : une demande se lit EN ENTIER (la notification
 * d'avant tronquait le message à 80 caractères et omettait le téléphone) et se traite en un geste.
 *
 * TCK-2584 — la boîte de réception : lignes compactes à trois gestes, la demande ouverte (plein écran
 * au téléphone, panneau de droite dès `lg`), le geste de contact enregistré au toucher et la barre
 * « Vous avez répondu ? » au retour, « Visite ▸ » préremplie, le bandeau des délais de l'admin. Les
 * tests de TCK-590 sont PORTÉS sur la nouvelle structure : ils sont la liste de non-régression.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ContactLeadsInbox } from '../ContactLeadsInbox';
import type { ContactLead, DelaisDeReponse } from '@/lib/queries/contact-leads';
import { ApiError } from '@/lib/api';
import fr from '@/messages/fr.json';

const etat = vi.hoisted(() => ({
  leads: [] as ContactLead[],
  filtres: [] as string[],
  affinages: [] as unknown[],
  roles: ['agent'] as string[],
  capacites: ['crm.assign'] as string[],
  recherche: '',
  large: true,
  erreur: false,
  chargement: false,
  designe: null as { data?: ContactLead; isError?: boolean } | null,
  lues: [] as (number | null)[],
  membres: [{ id: 21, first_name: 'Moussa', last_name: 'Fall' }] as { id: number; first_name: string; last_name: string }[],
  delais: null as DelaisDeReponse | null,
  delaisActives: [] as boolean[],
  planifier: null as Record<string, unknown> | null,
}));
const handle = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const convert = { mutateAsync: vi.fn().mockResolvedValue({ customer: { id: 88 } }), isPending: false };
const assign = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const contact = { mutate: vi.fn() };
const refetch = vi.fn();
const toastAdd = vi.fn();

vi.mock('@/lib/queries/contact-leads', () => ({
  useContactLeads: (filtre: string, _page: number, affinage: unknown) => {
    etat.filtres.push(filtre);
    etat.affinages.push(affinage);
    return {
      data: etat.erreur || etat.chargement ? undefined : { data: etat.leads, meta: { total: etat.leads.length, last_page: 1 } },
      isLoading: etat.chargement,
      isError: etat.erreur,
      isFetching: false,
      refetch,
    };
  },
  // Deux lecteurs : la demande désignée (`?lead=`) et une demande ouverte absente de la page.
  useContactLead: (id: number | null) => {
    etat.lues.push(id);
    if (id === null || !etat.designe) return { data: undefined, isError: false };
    return { data: etat.designe.data ? { data: etat.designe.data } : undefined, isError: etat.designe.isError ?? false };
  },
  useHandleLead: () => handle,
  useConvertLead: () => convert,
  useAssignLead: () => assign,
  useEnregistrerContact: () => contact,
  useUnhandledLeadsCount: () => ({ data: { meta: { total: etat.leads.filter((l) => !l.handled_at).length } } }),
  useCompteDeLaVue: () => ({ data: { meta: { total: 1 } } }),
  useDemandesEnRetard: () => ({ data: { meta: { total: 1 } } }),
  useDelaisDeReponse: ({ enabled }: { enabled: boolean }) => {
    etat.delaisActives.push(enabled);
    return { data: enabled && etat.delais ? { data: etat.delais } : undefined };
  },
  useBienDeLaDemande: (id: number | null) => ({
    data: id === null ? undefined : { data: { id, title: 'Villa à Almadies', price: 85000, currency: 'XOF', contract_type: 'rent', main_photo_url: null } },
    isPending: false,
  }),
}));

vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.large }));

const remplacer = vi.hoisted(() => vi.fn());
const pousser = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.recherche),
  useRouter: () => ({ replace: remplacer, push: pousser }),
  usePathname: () => '/app/leads',
}));

const lecturesDesMembres = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    const chemin = args[1] as string;
    if (chemin.includes('/members')) {
      lecturesDesMembres.push(args);
      return { data: { data: etat.membres }, isLoading: false };
    }
    return { data: { data: [] }, isLoading: false, isFetching: false };
  },
}));

// P152.05 — « Attribuer » se juge par `crm.assign` dans l'agence de la demande.
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

// L'en-tête du téléphone est rendu PAR LA COQUE : on retient ce que la boîte y déclare.
const declarations = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({
  DeclarerEnTete: (d: Record<string, unknown>) => (declarations.push(d), null),
}));

vi.mock('@/components/visits/PlanifierUneVisite', () => ({
  PlanifierDialog: (props: Record<string, unknown>) => {
    etat.planifier = props;
    return <div data-testid="planifier" />;
  },
}));

const MESSAGE =
  'Bonjour, je cherche un appartement de trois pièces pour ma famille, disponible dès janvier, avec parking si possible.';

/** L'horloge figée : mardi 10 novembre 2026, 12:00 à Dakar (UTC). */
const MAINTENANT = new Date('2026-11-10T12:00:00Z');

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
    known_customer: null,
    created_at: '2026-11-10T11:35:00Z',
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
    recipient: { id: 7, first_name: 'Fatou', last_name: 'Ndiaye' },
    ...overrides,
  };
}

/** Le panneau de la demande ouverte (bureau) ou l'écran plein (téléphone). */
function panneau(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-slot="demande-ouverte"]');
  if (!el) throw new Error('aucune demande ouverte');
  return el;
}

function rendre() {
  return render(withIntl(<ContactLeadsInbox />));
}

describe('<ContactLeadsInbox> — TCK-590, TCK-2584', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MAINTENANT);
    etat.leads = [lead()];
    etat.filtres = [];
    etat.affinages = [];
    etat.roles = ['agent'];
    etat.capacites = ['crm.assign'];
    etat.recherche = '';
    etat.large = true;
    etat.erreur = false;
    etat.chargement = false;
    etat.designe = null;
    etat.lues = [];
    etat.membres = [{ id: 21, first_name: 'Moussa', last_name: 'Fall' }];
    etat.delais = null;
    etat.delaisActives = [];
    etat.planifier = null;
    declarations.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('la demande ouverte — la carte de TCK-590, portée', () => {
    it('P220.05 (TCK-2140) — un destinataire et un collègue sans nom ont un libellé', async () => {
      etat.roles = ['agency_admin'];
      etat.leads = [lead({ recipient: { id: 7, first_name: '', last_name: '' } })];
      etat.membres = [{ id: 21, first_name: '', last_name: '' }];
      const user = userEvent.setup();
      rendre();

      expect(within(panneau()).getByText('Arrivé par WhatsApp · pour #7')).toBeInTheDocument();
      await user.click(within(panneau()).getByRole('button', { name: 'Attribuer' }));
      await user.click(await screen.findByRole('combobox', { name: 'Collègue' }));
      expect(await screen.findByRole('option', { name: '#21' })).toBeInTheDocument();
    });

    it('le message se lit en entier, avec le téléphone, l’e-mail, le destinataire et la source', () => {
      rendre();
      const p = within(panneau());

      expect(MESSAGE.length).toBeGreaterThan(80);
      expect(p.getByText(`« ${MESSAGE} »`)).toBeInTheDocument();
      expect(p.getByText('+221 77 123 45 67')).toBeInTheDocument();
      expect(p.getByText('awa@example.sn')).toBeInTheDocument();
      expect(p.getByText('Arrivé par WhatsApp · pour Fatou Ndiaye')).toBeInTheDocument();
      expect(etat.filtres[0]).toBe('todo');
    });

    it('le bien mène à sa fiche publique ; sans bien, « Contact direct »', () => {
      const { unmount } = rendre();
      expect(within(panneau()).getByRole('link', { name: /^Villa à Almadies/ })).toHaveAttribute('href', '/properties/villa-almadies');
      unmount();

      etat.leads = [lead({ property_id: null, property: null })];
      rendre();
      expect(within(panneau()).getByText('Aucune annonce citée : la visite demandera de choisir un bien.')).toBeInTheDocument();
    });

    it('répondre : WhatsApp pré-rempli (aide commune `whatsappHref`), appel, e-mail', () => {
      rendre();
      const p = within(panneau());

      const wa = p.getByRole('link', { name: 'Répondre à Awa Diop par WhatsApp' });
      expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221771234567\?text=/);
      expect(decodeURIComponent(wa.getAttribute('href') ?? '')).toContain('« Villa à Almadies »');
      expect(wa).toHaveAttribute('rel', 'noopener noreferrer');
      expect(p.getByRole('link', { name: 'Appeler Awa Diop' })).toHaveAttribute('href', 'tel:+221771234567');
      expect(p.getByRole('link', { name: 'Écrire un e-mail à Awa Diop' })).toHaveAttribute('href', 'mailto:awa@example.sn');
    });

    it('marquer traitée et convertir appellent l’API ; la conversion mène à la fiche client', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      rendre();

      await user.click(within(panneau()).getByRole('button', { name: 'Marquer traitée' }));
      expect(handle.mutateAsync).toHaveBeenCalledWith({ id: 1 });

      await user.click(within(panneau()).getByRole('button', { name: 'Convertir en client' }));
      expect(convert.mutateAsync).toHaveBeenCalledWith({ id: 1 });
      expect(await within(panneau()).findByRole('link', { name: 'Voir la fiche client' })).toHaveAttribute('href', '/app/customers/88');
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
      rendre();

      await user.click(within(panneau()).getByRole('button', { name: 'Convertir en client' }));

      expect(await screen.findByText('Ce client semble déjà exister dans l\'agence.')).toBeInTheDocument();
      expect(screen.getByText(/Awa Diop · même téléphone/)).toBeInTheDocument();
      expect(screen.getByText(/Une fiche que vous ne pouvez pas ouvrir · même e-mail/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ouvrir sa fiche' })).toHaveAttribute('href', '/app/customers/55');
      expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));

      await user.click(screen.getByRole('button', { name: 'Convertir quand même' }));
      expect(convert.mutateAsync).toHaveBeenLastCalledWith({ id: 1, allow_duplicate: true });
      expect(await within(panneau()).findByRole('link', { name: 'Voir la fiche client' })).toHaveAttribute('href', '/app/customers/88');
      expect(screen.queryByText('Ce client semble déjà exister dans l\'agence.')).not.toBeInTheDocument();
    });

    it('P182.03 (TCK-1824) — une demande déjà convertie (409 `lead.already_converted`) montre la fiche, sans toast d’erreur', async () => {
      convert.mutateAsync.mockRejectedValueOnce(new ApiError(409, { code: 'lead.already_converted', customer: { id: 77 } }));
      const user = userEvent.setup();
      rendre();

      await user.click(within(panneau()).getByRole('button', { name: 'Convertir en client' }));

      expect(await within(panneau()).findByRole('link', { name: 'Voir la fiche client' })).toHaveAttribute('href', '/app/customers/77');
      expect(within(panneau()).queryByRole('button', { name: 'Convertir en client' })).not.toBeInTheDocument();
      expect(toastAdd).not.toHaveBeenCalled();
    });

    it('P182.03 (TCK-1824) — la demande suit `customer_id` relu, sans être remontée', () => {
      const { rerender } = rendre();
      expect(within(panneau()).getByRole('button', { name: 'Convertir en client' })).toBeInTheDocument();

      etat.leads = [lead({ customer_id: 66 })];
      rerender(withIntl(<ContactLeadsInbox />));

      expect(within(panneau()).getByRole('link', { name: 'Voir la fiche client' })).toHaveAttribute('href', '/app/customers/66');
      expect(within(panneau()).queryByRole('button', { name: 'Convertir en client' })).not.toBeInTheDocument();
    });

    it('sans téléphone : ni WhatsApp ni appel, ni dans la ligne ni dans la demande', () => {
      etat.leads = [lead({ phone: null })];
      rendre();

      expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^Appeler/ })).not.toBeInTheDocument();
    });
  });

  describe('Attribuer — l’agence DE LA DEMANDE', () => {
    it('l’administrateur de l’agence choisit un collègue', async () => {
      etat.roles = ['agency_admin'];
      const user = userEvent.setup();
      rendre();

      await user.click(within(panneau()).getByRole('button', { name: 'Attribuer' }));
      await user.click(await screen.findByRole('combobox', { name: 'Collègue' }));
      await user.click(await screen.findByRole('option', { name: 'Moussa Fall' }));
      await user.click(screen.getAllByRole('button', { name: 'Attribuer' }).at(-1)!);

      await waitFor(() => expect(assign.mutateAsync).toHaveBeenCalledWith({ id: 1, user_id: 21 }));
    });

    it('vérification adverse de TCK-2584 (B12) — « Attribuer » en échec garde le dialogue et le dit', async () => {
      etat.roles = ['agency_admin'];
      assign.mutateAsync.mockRejectedValueOnce(new Error('refus'));
      const user = userEvent.setup();
      rendre();

      await user.click(within(panneau()).getByRole('button', { name: 'Attribuer' }));
      await user.click(await screen.findByRole('combobox', { name: 'Collègue' }));
      await user.click(await screen.findByRole('option', { name: 'Moussa Fall' }));
      await user.click(screen.getAllByRole('button', { name: 'Attribuer' }).at(-1)!);

      await waitFor(() => expect(toastAdd).toHaveBeenCalledWith({ title: 'L’action n’a pas abouti.', type: 'error' }));
      expect(screen.getByRole('dialog', { name: 'Attribuer la demande' })).toBeInTheDocument();
      expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    });

    it('TCK-2584 — la liste des collègues est celle de l’agence de la demande, pas celle de l’utilisateur', async () => {
      etat.leads = [lead({ agency_id: 9 })];
      const user = userEvent.setup();
      rendre();

      await user.click(within(panneau()).getByRole('button', { name: 'Attribuer' }));
      await screen.findByRole('combobox', { name: 'Collègue' });

      const [, chemin, options] = lecturesDesMembres.at(-1) as [unknown, string, { params: { filter?: unknown; sort?: unknown } }];
      expect(chemin).toBe('/api/agencies/9/members');
      // P120.01 (TCK-1246) — les seules cibles que l'API accepte ; P120.05 — triées par prénom.
      expect(options.params.filter).toEqual({ assignable: 1 });
      expect(options.params.sort).toBe('first_name');
      // P152.05 — et la capacité se lit dans cette agence-là.
      expect(lecturesDesCapacites).toContainEqual(['crm.assign', 9, true]);
    });

    it('P152.05 — un administrateur dont le rôle ne porte pas crm.assign n’a pas « Attribuer »', () => {
      etat.roles = ['agency_admin'];
      etat.capacites = ['agency.update'];
      rendre();

      expect(within(panneau()).queryByRole('button', { name: 'Attribuer' })).not.toBeInTheDocument();
    });
  });

  describe('le bailleur destinataire — ses demandes, sans ce qui n’est pas à lui', () => {
    beforeEach(() => {
      etat.roles = ['owner'];
      etat.capacites = [];
      // Le bailleur lit la demande sans `known_customer` (TCK-2582) : la clé est absente.
      etat.leads = [{ ...lead(), known_customer: undefined }];
    });

    it('ni « Non attribuées », ni « Attribuer », ni bandeau, ni « Déjà connu ? »', () => {
      etat.delais = { period_days: 30, agency: { median_first_response_seconds: 600, responded_count: 1, open_over_24h_count: 0 }, agents: [] };
      rendre();

      expect(within(panneau()).getByText(`« ${MESSAGE} »`)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Non attribuées/ })).not.toBeInTheDocument();
      expect(within(panneau()).queryByRole('button', { name: 'Attribuer' })).not.toBeInTheDocument();
      expect(document.querySelector('[data-slot="bandeau-des-delais"]')).toBeNull();
      expect(etat.delaisActives.every((a) => a === false)).toBe(true);
      expect(document.querySelector('[data-slot="deja-connu"]')).toBeNull();
    });
  });

  describe('les vues — dans l’URL (TCK-2479)', () => {
    it('`?filtre=handled` ouvre « Traitées », et c’est la liste lue', () => {
      etat.recherche = 'filtre=handled';
      rendre();

      expect(screen.getByRole('button', { name: /Traitées/ })).toHaveAttribute('aria-pressed', 'true');
      expect(etat.filtres.at(-1)).toBe('handled');
    });

    it('sans paramètre « À traiter » ; un choix s’écrit dans l’URL, le défaut s’en retire', async () => {
      const user = userEvent.setup();
      rendre();
      expect(etat.filtres.at(-1)).toBe('todo');

      await user.click(screen.getByRole('button', { name: /Toutes/ }));
      expect(remplacer).toHaveBeenLastCalledWith('?filtre=all', { scroll: false });
    });

    it('revenir à « À traiter » retire `filtre` de l’URL et garde les autres clés', async () => {
      etat.recherche = 'filtre=handled&lead=4';
      const user = userEvent.setup();
      rendre();

      await user.click(screen.getByRole('button', { name: /À traiter/ }));
      expect(remplacer).toHaveBeenLastCalledWith('?lead=4', { scroll: false });
    });

    it('« Non attribuées » au personnel qui attribue ; la recherche et les filtres du bureau se lisent dans l’URL', () => {
      etat.recherche = 'filtre=unassigned&q=awa&bien=10&canal=whatsapp';
      rendre();

      expect(screen.getByRole('button', { name: /Non attribuées/ })).toHaveAttribute('aria-pressed', 'true');
      expect(etat.filtres.at(-1)).toBe('unassigned');
      expect(etat.affinages.at(-1)).toEqual({ recherche: 'awa', bien: 10, agent: null, canal: 'whatsapp' });
    });
  });

  describe('les lignes', () => {
    it('AC4 — une demande de 8 jours dit « il y a 8 j » en rouge, une de 25 min « il y a 25 min » sans rouge', () => {
      etat.large = false;
      etat.leads = [
        lead({ id: 1, name: 'Mouhamed Dieng', created_at: '2026-11-02T08:47:00Z' }),
        lead({ id: 2, name: 'Awa Ndiaye', created_at: '2026-11-10T11:35:00Z' }),
      ];
      rendre();

      const [vieille, recente] = screen.getAllByRole('listitem');
      const ageVieille = vieille.querySelector('[data-slot="age-de-la-demande"]')!;
      const ageRecente = recente.querySelector('[data-slot="age-de-la-demande"]')!;
      expect(ageVieille).toHaveTextContent('il y a 8 j');
      expect(ageVieille).toHaveClass('text-destructive');
      expect(vieille.querySelector('[data-slot="point-d-age"]')).toHaveAttribute('data-en-retard');
      expect(ageRecente).toHaveTextContent('il y a 25 min');
      expect(ageRecente).not.toHaveClass('text-destructive');
      expect(recente.querySelector('[data-slot="point-d-age"]')).not.toHaveAttribute('data-en-retard');
    });

    it('vérification adverse de TCK-2584 (B9) — une demande TRAITÉE de 8 jours n’est pas en rouge', () => {
      etat.large = false;
      etat.leads = [lead({ id: 1, name: 'Mouhamed Dieng', created_at: '2026-11-02T08:47:00Z', handled_at: '2026-11-03T09:00:00Z' })];
      rendre();

      const [ligne] = screen.getAllByRole('listitem');
      const age = ligne.querySelector('[data-slot="age-de-la-demande"]')!;
      expect(age).toHaveTextContent('il y a 8 j');
      expect(age).not.toHaveClass('text-destructive');
      expect(ligne.querySelector('[data-slot="point-d-age"]')).not.toHaveAttribute('data-en-retard');
    });

    it('chaque ligne porte ses trois gestes de 44 px : WhatsApp, Appeler, Visite', () => {
      etat.large = false;
      rendre();

      const ligne = within(screen.getByRole('listitem'));
      for (const nom of ['Répondre à Awa Diop par WhatsApp', 'Appeler Awa Diop']) {
        expect(ligne.getByRole('link', { name: nom })).toHaveClass('h-11');
      }
      expect(ligne.getByRole('button', { name: 'Proposer une visite à Awa Diop' })).toHaveClass('h-11');
    });

    it('`known_customer` rend « déjà client·e » sur la ligne, et l’encadré « Déjà client·e » mène à sa fiche', () => {
      etat.leads = [lead({ known_customer: { id: 35, name: 'Awa Diop', visits_count: 2 } })];
      rendre();

      expect(within(screen.getByRole('listitem')).getAllByText(/déjà client·e/).length).toBeGreaterThan(0);
      const encadre = document.querySelector<HTMLElement>('[data-slot="deja-connu"]')!;
      expect(encadre).toHaveTextContent('Déjà client·e · 2 visites');
      expect(within(encadre).getByRole('link', { name: 'Ouvrir' })).toHaveAttribute('href', '/app/customers/35');
    });

    it('au bureau, déjà client·e : « Voir la fiche » remplace « Convertir en client » ; sans e-mail, le geste E-mail est inactif', () => {
      etat.leads = [lead({ email: null, known_customer: { id: 35, name: 'Awa Diop', visits_count: 1 } })];
      rendre();

      const p = within(panneau());
      expect(p.getByRole('link', { name: 'Voir la fiche' })).toHaveAttribute('href', '/app/customers/35');
      expect(p.queryByRole('button', { name: 'Convertir en client' })).not.toBeInTheDocument();
      expect(p.getByRole('button', { name: 'E-mail' })).toBeDisabled();
    });

    it('une fiche que le lecteur ne voit pas se signale sans nom ni lien', () => {
      etat.leads = [lead({ known_customer: { id: null, name: null, visits_count: null } })];
      rendre();

      const encadre = document.querySelector<HTMLElement>('[data-slot="deja-connu"]')!;
      expect(encadre).toHaveTextContent('Une fiche de l’agence porte ce téléphone ou cet e-mail.');
      expect(within(encadre).queryByRole('link')).not.toBeInTheDocument();
    });

    it('au téléphone, toucher la ligne ouvre la demande par une entrée d’historique (`?ouverte=`)', async () => {
      etat.large = false;
      const user = userEvent.setup();
      rendre();

      expect(document.querySelector('[data-slot="demande-ouverte"]')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Ouvrir la demande de Awa Diop' }));
      expect(pousser).toHaveBeenCalledWith('?ouverte=1', { scroll: true });
    });

    it('au téléphone, `?ouverte=` montre la demande en plein écran, avec sa barre « Proposer une visite à … »', () => {
      etat.large = false;
      etat.recherche = 'ouverte=1';
      rendre();

      expect(panneau()).toHaveAttribute('data-regime', 'telephone');
      expect(screen.queryByRole('list', { name: 'Demandes' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Proposer une visite à Awa/ })).toBeInTheDocument();
    });

    it('au téléphone, une demande déjà cliente : « Plus » mène à SA fiche au lieu de convertir', () => {
      etat.large = false;
      etat.recherche = 'ouverte=1';
      etat.leads = [lead({ known_customer: { id: 35, name: 'Awa Diop', visits_count: 1 } })];
      rendre();

      const plus = within(document.querySelector<HTMLElement>('[data-slot="plus-de-la-demande"]')!);
      expect(plus.getByRole('link', { name: /Voir la fiche client/ })).toHaveAttribute('href', '/app/customers/35');
      expect(plus.queryByText('Convertir en client, sans visite')).not.toBeInTheDocument();
    });

    it('« Plus ▾ » de l’en-tête se rend hors du dictionnaire de la boîte (la coque ne sert pas `contactLeads`)', () => {
      etat.large = false;
      etat.recherche = 'ouverte=1';
      rendre();

      const plein = declarations.find((d) => d.forme === 'plein-ecran');
      expect(plein?.titre).toBe('Demande de contact');
      // Le dictionnaire de la coque, sans l'espace de la boîte : c'est ce que le navigateur reçoit.
      const { contactLeads: _absent, ...coque } = fr as Record<string, unknown>;
      render(
        <NextIntlClientProvider locale="fr" messages={coque} onError={() => undefined}>
          {plein?.droite as ReactNode}
        </NextIntlClientProvider>,
      );
      expect(screen.getByRole('button', { name: 'Plus' })).toBeInTheDocument();
    });
  });

  describe('le geste de contact et la barre de retour (décision 3b)', () => {
    function revenir() {
      act(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }

    it('AC2 — WhatsApp enregistre `POST …/contacts {whatsapp}`, puis au retour « Vous avez répondu à Awa ? »', async () => {
      etat.large = false;
      const user = userEvent.setup();
      rendre();

      expect(screen.queryByText('Vous avez répondu à Awa ?')).not.toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'Répondre à Awa Diop par WhatsApp' }));
      expect(contact.mutate).toHaveBeenCalledWith({ id: 1, channel: 'whatsapp' }, expect.anything());
      // Rien tant que l'onglet n'est pas revenu.
      expect(screen.queryByText('Vous avez répondu à Awa ?')).not.toBeInTheDocument();

      revenir();
      expect(await screen.findByText('Vous avez répondu à Awa ?')).toBeInTheDocument();
    });

    it('« Pas encore » ferme la barre et laisse la demande à traiter', async () => {
      etat.large = false;
      const user = userEvent.setup();
      rendre();
      await user.click(screen.getByRole('link', { name: 'Appeler Awa Diop' }));
      expect(contact.mutate).toHaveBeenCalledWith({ id: 1, channel: 'call' }, expect.anything());
      revenir();

      await user.click(await screen.findByRole('button', { name: 'Pas encore' }));
      expect(screen.queryByText('Vous avez répondu à Awa ?')).not.toBeInTheDocument();
      expect(handle.mutateAsync).not.toHaveBeenCalled();
    });

    it('« Oui, c’est traité » marque la demande traitée, toast « Demande traitée. »', async () => {
      const user = userEvent.setup();
      rendre();
      await user.click(within(panneau()).getByRole('link', { name: 'Répondre à Awa Diop par WhatsApp' }));
      revenir();

      await user.click(await screen.findByRole('button', { name: 'Oui, c’est traité' }));
      expect(handle.mutateAsync).toHaveBeenCalledWith({ id: 1 });
      expect(toastAdd).toHaveBeenCalledWith({ title: 'Demande traitée.', type: 'success' });
      await waitFor(() => expect(screen.queryByText('Vous avez répondu à Awa ?')).not.toBeInTheDocument());
    });

    it('vérification adverse de TCK-2584 (B8) — « Oui, c’est traité » en échec garde la barre et le dit', async () => {
      handle.mutateAsync.mockRejectedValueOnce(new Error('refus'));
      const user = userEvent.setup();
      rendre();
      await user.click(within(panneau()).getByRole('link', { name: 'Répondre à Awa Diop par WhatsApp' }));
      revenir();

      await user.click(await screen.findByRole('button', { name: 'Oui, c’est traité' }));
      await waitFor(() => expect(toastAdd).toHaveBeenCalledWith({ title: 'L’action n’a pas abouti.', type: 'error' }));
      expect(screen.getByText('Vous avez répondu à Awa ?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Oui, c’est traité' })).toBeInTheDocument();
    });

    it('vérification adverse de TCK-2584 (B5) — le geste sur une demande déjà traitée est enregistré, sans barre au retour', async () => {
      etat.large = false;
      etat.leads = [lead({ handled_at: '2026-11-10T11:50:00Z' })];
      const user = userEvent.setup();
      rendre();

      await user.click(screen.getByRole('link', { name: 'Répondre à Awa Diop par WhatsApp' }));
      expect(contact.mutate).toHaveBeenCalledWith({ id: 1, channel: 'whatsapp' }, expect.anything());
      revenir();
      expect(screen.queryByText('Vous avez répondu à Awa ?')).not.toBeInTheDocument();
    });

    it('un e-mail est enregistré, sans barre de retour', async () => {
      const user = userEvent.setup();
      rendre();
      await user.click(within(panneau()).getByRole('link', { name: 'Écrire un e-mail à Awa Diop' }));
      expect(contact.mutate).toHaveBeenCalledWith({ id: 1, channel: 'email' }, expect.anything());
      revenir();
      expect(screen.queryByText('Vous avez répondu à Awa ?')).not.toBeInTheDocument();
    });
  });

  it('AC3 — « Visite ▸ » ouvre la planification préremplie : le demandeur, son bien, la demande', async () => {
    etat.large = false;
    etat.leads = [lead({ name: 'Mouhamed Dieng', property: { id: 10, title: 'Pièce indépendante à Ouakam', slug: 'piece-ouakam' } })];
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole('button', { name: 'Proposer une visite à Mouhamed Dieng' }));

    expect(screen.getByTestId('planifier')).toBeInTheDocument();
    expect(etat.planifier?.demande).toEqual({ id: 1, nom: 'Mouhamed Dieng', prenom: 'Mouhamed', telephone: '+221771234567', ficheId: null });
    expect(etat.planifier?.property).toEqual(expect.objectContaining({ id: 10, libelle: 'Villa à Almadies' }));
  });

  it('« Visite ▸ » d’une demande déjà cliente : la visite se rattache à sa fiche', async () => {
    etat.large = false;
    etat.leads = [lead({ known_customer: { id: 35, name: 'Awa Diop', visits_count: 1 } })];
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole('button', { name: 'Proposer une visite à Awa Diop' }));
    expect(etat.planifier?.demande).toEqual(expect.objectContaining({ ficheId: 35 }));
  });

  describe('AC5 — le bandeau des délais : à l’administrateur, au bureau', () => {
    const DELAIS: DelaisDeReponse = {
      period_days: 30,
      agency: { median_first_response_seconds: 11_400, responded_count: 12, open_over_24h_count: 1 },
      agents: [
        { user: { id: 4, first_name: 'Sokhna', last_name: 'Sène' }, median_first_response_seconds: 6_000, responded_count: 5, open_over_24h_count: 1 },
        { user: { id: 5, first_name: 'Khady', last_name: 'Diallo' }, median_first_response_seconds: 10_500, responded_count: 4, open_over_24h_count: 0 },
      ],
    };

    it('l’admin voit deux panneaux et le bandeau ; « Par agent » détaille', async () => {
      etat.roles = ['agency_admin'];
      etat.delais = DELAIS;
      const user = userEvent.setup();
      rendre();

      expect(document.querySelector('[data-slot="panneaux-du-bureau"]')).not.toBeNull();
      const bandeau = document.querySelector<HTMLElement>('[data-slot="bandeau-des-delais"]')!;
      expect(bandeau).toHaveTextContent('Délai médian de première réponse');
      expect(bandeau).toHaveTextContent('3 h 10');
      expect(bandeau).toHaveTextContent('1 demande > 24 h');
      expect(bandeau).toHaveTextContent('Sokhna S. · 1 h 40');
      await user.click(within(bandeau).getByRole('button', { name: 'Par agent' }));
      expect(bandeau.querySelector('[data-slot="delais-par-agent"]')).not.toBeNull();
    });

    it('l’agent ne voit pas le bandeau, et sa lecture n’est pas faite', () => {
      etat.roles = ['agent'];
      etat.delais = DELAIS;
      rendre();

      expect(document.querySelector('[data-slot="bandeau-des-delais"]')).toBeNull();
      expect(etat.delaisActives.every((a) => a === false)).toBe(true);
    });
  });

  describe('les états', () => {
    it('boîte vide : « Aucune demande en attente » et « Voir les traitées »', async () => {
      etat.leads = [];
      etat.large = false;
      const user = userEvent.setup();
      rendre();

      expect(screen.getByText('Aucune demande en attente')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Voir les traitées' }));
      expect(remplacer).toHaveBeenLastCalledWith('?filtre=handled', { scroll: false });
    });

    it('erreur : le message, et « Réessayer » relance la lecture', async () => {
      etat.erreur = true;
      etat.large = false;
      const user = userEvent.setup();
      rendre();

      expect(screen.getByText('Les demandes n’ont pas pu être chargées')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(refetch).toHaveBeenCalled();
    });

    it('chargement : trois squelettes', () => {
      etat.chargement = true;
      etat.large = false;
      rendre();
      expect(document.querySelector('[data-slot="squelettes"]')?.children).toHaveLength(3);
    });
  });

  describe('P97.04 — la cible `lead` ouvre la boîte sur la demande (`?lead={id}`)', () => {
    it('AC6 — la demande désignée, absente de la page, est rendue en tête et mise en avant', () => {
      etat.recherche = 'lead=42';
      etat.designe = { data: lead({ id: 42, name: 'Ousmane Sow', message: 'Demande du courriel' }) };
      rendre();

      expect(etat.lues).toContain(42);
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Ousmane Sow');
      expect(items[0]).toHaveAttribute('aria-current', 'true');
      expect(items[1]).toHaveTextContent('Awa Diop');
      expect(items[1]).not.toHaveAttribute('aria-current');
    });

    it('au téléphone, ouverte depuis la notification, l’en-tête le dit avec son rang ; ouverte depuis la liste, le rang seul', () => {
      etat.large = false;
      etat.leads = [lead(), lead({ id: 2, name: 'Ousmane Sow' })];
      etat.recherche = 'lead=1&ouverte=1';
      etat.designe = { data: lead() };
      const { unmount } = rendre();
      expect(declarations.find((d) => d.forme === 'plein-ecran')?.sousTitre).toBe('Ouverte depuis la notification · 1 sur 2');
      unmount();

      declarations.length = 0;
      etat.recherche = 'lead=1&ouverte=2';
      rendre();
      expect(declarations.find((d) => d.forme === 'plein-ecran')?.sousTitre).toBe('2 sur 2 à traiter');
    });

    it('vérification adverse de TCK-2584 (d1) — la désignée hors de la page servie (traitée) ne décale pas les rangs, et se lit sans rang', () => {
      etat.large = false;
      etat.leads = [lead({ id: 1 }), lead({ id: 2, name: 'Ousmane Sow' }), lead({ id: 3, name: 'Fatou Ba' })];
      etat.designe = { data: lead({ id: 9, name: 'Mariama Sy', handled_at: '2026-11-10T11:50:00Z' }) };
      const sousTitre = (ouverte: number) => {
        declarations.length = 0;
        etat.recherche = `lead=9&ouverte=${ouverte}`;
        const { unmount } = rendre();
        const lu = declarations.find((d) => d.forme === 'plein-ecran')?.sousTitre;
        unmount();
        return lu;
      };

      expect([sousTitre(1), sousTitre(2), sousTitre(3)]).toEqual(['1 sur 3 à traiter', '2 sur 3 à traiter', '3 sur 3 à traiter']);
      expect(sousTitre(9)).toBe('Ouverte depuis la notification');
    });

    it('la demande désignée déjà dans la page n’y est pas rendue deux fois', () => {
      etat.large = false;
      etat.recherche = 'lead=1';
      etat.designe = { data: lead() };
      rendre();

      expect(screen.getAllByRole('listitem')).toHaveLength(1);
      expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'true');
    });

    it.each([['lead=abc'], ['lead=0'], ['lead=-3'], ['']])('« %s » : aucune lecture, la boîte se rend', (recherche) => {
      etat.large = false;
      etat.recherche = recherche;
      rendre();

      expect(etat.lues.every((id) => id === null)).toBe(true);
      expect(screen.getAllByRole('listitem')[0]).not.toHaveAttribute('aria-current');
    });

    it('une lecture refusée est ignorée sans erreur', () => {
      etat.large = false;
      etat.recherche = 'lead=99';
      etat.designe = { isError: true };
      rendre();

      expect(screen.queryByText('Les demandes n’ont pas pu être chargées')).not.toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
  });
});
