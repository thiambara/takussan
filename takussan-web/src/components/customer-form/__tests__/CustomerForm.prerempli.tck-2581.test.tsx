/**
 * TCK-2581 — « Créer sa fiche » depuis « Et maintenant ? » : le visiteur sans fiche arrive sur
 * `/app/customers/new?visite=<id>`, la page RELIT la visite au serveur, et le formulaire part du nom
 * et du numéro qu'elle porte (création seulement ; un champ vide ne masque pas le défaut).
 *
 * L'URL ne porte que l'identifiant de la visite (vérification du 2026-11-11) : `?telephone=` mettait
 * le numéro du visiteur dans l'historique, les journaux et l'en-tête `Referer`. La page ne lit plus
 * aucun nom ni numéro dans l'URL.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CustomerForm } from '../CustomerForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/customers/new',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const serveur = vi.hoisted(() => ({ lire: vi.fn(), jeton: 'jeton' as string | undefined }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: serveur.lire,
}));
vi.mock('@/lib/session', () => ({ getToken: async () => serveur.jeton }));

const createCustomerAction = vi.fn();
vi.mock('@/app/actions/dashboard-customers', () => ({
  createCustomerAction: (...args: unknown[]) => createCustomerAction(...args),
  updateCustomerAction: vi.fn(),
}));

const { default: NouveauClient } = await import('@/app/(dashboard)/app/customers/new/page');

/** La visite telle que l'API la rend au personnel de l'agence du bien (`PropertyVisitResource`). */
const VISITE_SANS_FICHE = {
  id: 228,
  property_id: 40,
  customer: null,
  visitor_name: 'Mouhamed Fall',
  visitor_phone: '+221770001122',
  visitor_display: { name: 'Mouhamed Fall', phone: '+221770001122', kind: 'anonymous', visits_on_property: 1 },
};

async function page(recherche: Record<string, string>) {
  render(withIntl(await NouveauClient({ searchParams: Promise.resolve(recherche) })));
}

describe('CustomerForm — prérempli depuis la visite (TCK-2581)', () => {
  beforeEach(() => {
    createCustomerAction.mockReset();
    serveur.lire.mockReset();
    serveur.jeton = 'jeton';
  });

  it('part du prénom, du nom et du numéro du visiteur, et les envoie', async () => {
    createCustomerAction.mockResolvedValueOnce({ ok: true, data: { id: 9 } });
    const user = userEvent.setup();
    render(withIntl(<CustomerForm mode="create" initial={{ first_name: 'Mouhamed', last_name: 'Fall', phone: '+221770001122' }} onSuccess={vi.fn()} />));

    expect(screen.getByLabelText(/Prénom/)).toHaveValue('Mouhamed');
    expect(screen.getByLabelText(/^Nom/)).toHaveValue('Fall');
    await user.click(screen.getByRole('button', { name: 'Créer le client' }));
    await waitFor(() => expect(createCustomerAction).toHaveBeenCalledTimes(1));
    expect(createCustomerAction.mock.calls[0][0]).toMatchObject({ first_name: 'Mouhamed', last_name: 'Fall' });
    expect(String((createCustomerAction.mock.calls[0][0] as { phone?: string }).phone).replace(/\D/g, '')).toBe('221770001122');
  });

  it('un champ vide ne masque pas le défaut', () => {
    render(withIntl(<CustomerForm mode="create" initial={{ first_name: 'Mouhamed', last_name: '' }} onSuccess={vi.fn()} />));
    expect(screen.getByLabelText(/Prénom/)).toHaveValue('Mouhamed');
    expect(screen.getByLabelText(/^Nom/)).toHaveValue('');
  });

  it('`?visite=228` : la page relit la visite avec le jeton du lecteur, et le formulaire en part', async () => {
    serveur.lire.mockResolvedValueOnce({ data: VISITE_SANS_FICHE });
    createCustomerAction.mockResolvedValueOnce({ ok: true, data: { id: 9 } });
    await page({ visite: '228' });

    expect(serveur.lire).toHaveBeenCalledWith('/api/property-visits/228', expect.objectContaining({ token: 'jeton' }));
    expect(screen.getByLabelText(/Prénom/)).toHaveValue('Mouhamed');
    expect(screen.getByLabelText(/^Nom/)).toHaveValue('Fall');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Créer le client' }));
    await waitFor(() => expect(createCustomerAction).toHaveBeenCalledTimes(1));
    expect(String((createCustomerAction.mock.calls[0][0] as { phone?: string }).phone).replace(/\D/g, '')).toBe('221770001122');
  });

  it('un nom et un numéro posés dans l’URL ne préremplissent RIEN', async () => {
    await page({ prenom: 'Mouhamed', nom: 'Fall', telephone: '+221770001122' });
    expect(serveur.lire).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Prénom/)).toHaveValue('');
    expect(screen.getByLabelText(/^Nom/)).toHaveValue('');
  });

  it('une visite illisible (403, 404) ou un identifiant invalide : une fiche vierge, sans erreur', async () => {
    serveur.lire.mockRejectedValueOnce(new Error('API error 403'));
    await page({ visite: '228' });
    expect(screen.getByLabelText(/Prénom/)).toHaveValue('');

    serveur.lire.mockClear();
    await page({ visite: '1 OR 1' });
    expect(serveur.lire).not.toHaveBeenCalled();
  });

  it('une visite qui a déjà sa fiche ne préremplit rien', async () => {
    serveur.lire.mockResolvedValueOnce({ data: { ...VISITE_SANS_FICHE, customer: { id: 37, first_name: 'Aliou', last_name: 'Sow' } } });
    await page({ visite: '228' });
    expect(screen.getByLabelText(/Prénom/)).toHaveValue('');
  });
});
