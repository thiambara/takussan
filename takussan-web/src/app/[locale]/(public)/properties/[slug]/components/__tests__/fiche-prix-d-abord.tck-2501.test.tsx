/**
 * TCK-2501 — « Le prix d'abord » : la barre basse, le bloc de contact mobile et la carte de bureau.
 *
 *   · AC2 — location dont le contact a WhatsApp : la barre montre WhatsApp et Visiter ; sans numéro,
 *     Écrire et Visiter ; téléphone sans WhatsApp, Appeler et Visiter.
 *   · AC3 — un clic WhatsApp produit un `contact-click` (canal `whatsapp`) puis ouvre `wa.me`.
 *   · Barre sans montant (le prix y était tronqué).
 *   · Une seule porte « message » par palier ; plus aucun canal dans la carte de l'agent.
 *   · Vente : l'action primaire reste « Faire une offre » (3a ne touche que la location).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { PropertyDetail, PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from '../PropertyAgentCard';
import { PropertyBookingCard } from '../PropertyBookingCard';
import { PropertyMobileBottomBar } from '../PropertyMobileBottomBar';
import { PropertyMobileContact } from '../PropertyMobileContact';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const CONTACT: PropertyOwnerLite = {
  id: 2, name: 'Sokhna Gueye', slug: 'sokhna-gueye', avatar_url: null, is_agent: true, member_since: null,
};
const AVEC_WHATSAPP = { ...CONTACT, has_phone: true, has_whatsapp: true };
const TELEPHONE_SEUL = { ...CONTACT, has_phone: true, has_whatsapp: false };
const SANS_NUMERO = { ...CONTACT, has_phone: false, has_whatsapp: false };

function bien(contract_type: 'rent' | 'sale', extra: Partial<PropertyDetail> = {}): PropertyDetail {
  return {
    id: 7,
    slug: 'villa-liberte-6',
    title: 'Villa avec jardin',
    price: 2240000,
    currency: 'XOF',
    contract_type,
    contract_type_label: contract_type === 'rent' ? 'Location' : 'Vente',
    rent_period: contract_type === 'rent' ? 'monthly' : null,
    entry_cost: null,
    owner: CONTACT,
    primary_contact: CONTACT,
    agency: null,
    ...extra,
  } as unknown as PropertyDetail;
}

const rappels = () => ({ onMessage: vi.fn(), onRequestVisit: vi.fn(), onRequestBooking: vi.fn() });

function barre(property: PropertyDetail, contact: PropertyOwnerLite, canMessage = true) {
  const r = rappels();
  render(withIntl(<PropertyMobileBottomBar property={property} contact={contact} canMessage={canMessage} {...r} />));
  return { barre: screen.getByTestId('barre-d-actions-de-la-fiche'), ...r };
}

beforeEach(() => apiFetch.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('la barre basse (AC2)', () => {
  it('location, contact WhatsApp : WhatsApp et Visiter, rien d’autre', () => {
    const { barre: b } = barre(bien('rent'), AVEC_WHATSAPP);
    const boutons = within(b).getAllByRole('button');
    expect(boutons.map((x) => x.textContent?.trim())).toEqual(['WhatsApp', 'Visiter']);
  });

  it('location, téléphone sans WhatsApp : Appeler et Visiter', () => {
    const { barre: b } = barre(bien('rent'), TELEPHONE_SEUL);
    expect(within(b).getAllByRole('button').map((x) => x.textContent?.trim())).toEqual(['Appeler', 'Visiter']);
  });

  it('location, aucun numéro : Écrire et Visiter — Écrire ouvre la porte « message »', async () => {
    const { barre: b, onMessage } = barre(bien('rent'), SANS_NUMERO);
    expect(within(b).getAllByRole('button').map((x) => x.textContent?.trim())).toEqual(['Écrire', 'Visiter']);
    await userEvent.setup().click(within(b).getByRole('button', { name: 'Écrire' }));
    expect(onMessage).toHaveBeenCalledOnce();
  });

  it('Visiter ouvre la demande de visite, pas le dossier (décision 3a)', async () => {
    const { barre: b, onRequestVisit, onRequestBooking } = barre(bien('rent'), AVEC_WHATSAPP);
    await userEvent.setup().click(within(b).getByRole('button', { name: 'Visiter' }));
    expect(onRequestVisit).toHaveBeenCalledOnce();
    expect(onRequestBooking).not.toHaveBeenCalled();
  });

  it('vente : l’action primaire d’aujourd’hui, « Faire une offre »', async () => {
    const { barre: b, onRequestBooking } = barre(bien('sale'), AVEC_WHATSAPP);
    expect(within(b).getAllByRole('button').map((x) => x.textContent?.trim())).toEqual(['WhatsApp', 'Faire une offre']);
    await userEvent.setup().click(within(b).getByRole('button', { name: 'Faire une offre' }));
    expect(onRequestBooking).toHaveBeenCalledOnce();
  });

  it('soi-même destinataire, sans numéro : la seule action du contrat', () => {
    const { barre: b } = barre(bien('rent'), SANS_NUMERO, false);
    expect(within(b).getAllByRole('button').map((x) => x.textContent?.trim())).toEqual(['Visiter']);
  });

  it('sans montant : le prix n’y figure plus', () => {
    const { barre: b } = barre(bien('rent'), AVEC_WHATSAPP);
    expect(b.textContent).not.toMatch(/2\s?240\s?000/);
  });

  it('aucun libellé n’y est tronqué', () => {
    const { barre: b } = barre(bien('rent'), AVEC_WHATSAPP);
    for (const el of b.querySelectorAll('*')) {
      expect(el.getAttribute('class') ?? '').not.toMatch(/\btruncate\b|\btext-ellipsis\b/);
    }
  });
});

describe('le clic WhatsApp (AC3)', () => {
  it('compte le clic (contact-click, canal whatsapp) puis ouvre wa.me avec le message prérempli', async () => {
    const fenetre = { location: { href: '' }, opener: {} as unknown, close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => fenetre));
    apiFetch.mockImplementation((path: unknown) =>
      String(path).endsWith('/contact')
        ? Promise.resolve({ data: [{ phone: '+221 77 000 08 01', whatsapp: true, label: null, kind: 'primary' }] })
        : Promise.resolve(undefined),
    );
    const { barre: b } = barre(bien('rent'), AVEC_WHATSAPP);

    await userEvent.setup().click(within(b).getByRole('button', { name: /whatsapp/i }));

    const clic = apiFetch.mock.calls.find(([p]) => String(p).endsWith('/contact-click'));
    expect(clic?.[0]).toBe('/public/properties/villa-liberte-6/contact-click');
    expect(JSON.parse(String(clic?.[1]?.body))).toMatchObject({ channel: 'whatsapp' });
    await waitFor(() => expect(fenetre.location.href).toMatch(/^https:\/\/wa\.me\/221770000801\?text=/));
    expect(decodeURIComponent(fenetre.location.href.split('?text=')[1]!)).toContain('« Villa avec jardin »');
  });

  it('un clic Appeler, lui aussi, passe par contact-click (canal call)', async () => {
    apiFetch.mockImplementation((path: unknown) =>
      String(path).endsWith('/contact') ? Promise.resolve({ data: [] }) : Promise.resolve(undefined),
    );
    const { barre: b } = barre(bien('rent'), TELEPHONE_SEUL);
    await userEvent.setup().click(within(b).getByRole('button', { name: 'Appeler' }));
    const clic = apiFetch.mock.calls.find(([p]) => String(p).endsWith('/contact-click'));
    expect(JSON.parse(String(clic?.[1]?.body))).toMatchObject({ channel: 'call' });
  });

  it('TCK-633 — plusieurs numéros derrière Appeler (barre) : la feuille les montre tous, composables', async () => {
    apiFetch.mockImplementation((path: unknown) =>
      String(path).endsWith('/contact')
        ? Promise.resolve({ data: [
            { phone: '+221770000801', whatsapp: false, label: null, kind: 'primary' },
            { phone: '+221770000803', whatsapp: false, label: 'Gardien', kind: 'on_site' },
          ] })
        : Promise.resolve(undefined),
    );
    const { barre: b } = barre(bien('rent'), TELEPHONE_SEUL);
    await userEvent.setup().click(within(b).getByRole('button', { name: 'Appeler' }));

    const liste = await screen.findByTestId('numeros-de-contact');
    expect(within(liste).getByRole('link', { name: /\+221770000801/ })).toHaveAttribute('href', 'tel:+221770000801');
    expect(within(liste).getByRole('link', { name: /\+221770000803/ })).toHaveAttribute('href', 'tel:+221770000803');
    expect(within(liste).getByText('Gardien')).toBeInTheDocument();
  });
});

describe('le bloc de contact mobile — ce que la barre ne porte pas', () => {
  function bloc(property: PropertyDetail, contact: PropertyOwnerLite, canMessage = true) {
    const r = rappels();
    render(withIntl(
      <PropertyMobileContact property={property} contact={contact} agency={null} canMessage={canMessage} {...r} />,
    ));
    return r;
  }

  it('contact WhatsApp : Appeler et la porte « message » ici, le dossier après la visite', async () => {
    const { onRequestBooking } = bloc(bien('rent'), AVEC_WHATSAPP);
    expect(screen.getByRole('button', { name: 'Appeler' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /message|écrire/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Déposer mon dossier' }));
    expect(onRequestBooking).toHaveBeenCalledOnce();
  });

  it('aucun numéro : la porte « message » est dans la barre, donc pas ici', () => {
    bloc(bien('rent'), SANS_NUMERO);
    expect(screen.queryByRole('button', { name: /message|écrire/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Appeler' })).not.toBeInTheDocument();
  });

  it('TCK-590 — has_phone ABSENT (repli sur le propriétaire) : pas d’Appeler dans le bloc', () => {
    bloc(bien('rent'), CONTACT);
    expect(screen.queryByRole('button', { name: 'Appeler' })).not.toBeInTheDocument();
  });

  it('le signal de confiance de la carte de bureau est rendu en mobile (« pas débité avant la confirmation »)', () => {
    bloc(bien('rent'), AVEC_WHATSAPP);
    expect(screen.getByText('Vous ne serez pas débité avant la confirmation.')).toBeInTheDocument();
  });

  it('nomme l’interlocuteur et, quand l’API le rend, le coût d’entrée', () => {
    bloc(
      bien('rent', {
        entry_cost: { advance_months: 3, deposit_months: 2, agency_fee_months: 0.5, monthly_charges: null, total: 12320000 },
      }),
      AVEC_WHATSAPP,
    );
    expect(screen.getByRole('link', { name: 'Sokhna Gueye' })).toBeInTheDocument();
    expect(screen.getByTestId('cout-d-entree-total').textContent?.replace(/\s/g, '')).toContain('12320000');
  });

  it('vente : la visite reste offerte, en second', () => {
    bloc(bien('sale'), AVEC_WHATSAPP);
    expect(screen.getByRole('button', { name: 'Demander une visite' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déposer mon dossier' })).not.toBeInTheDocument();
  });
});

describe('la carte de réservation (bureau)', () => {
  function carte(property: PropertyDetail, contact: PropertyOwnerLite) {
    const r = rappels();
    render(withIntl(<PropertyBookingCard property={property} contact={contact} {...r} />));
    return r;
  }

  it('location : « Demander une visite » d’abord, puis WhatsApp, Appeler, UNE porte « message », le dossier', () => {
    carte(bien('rent'), AVEC_WHATSAPP);
    const libelles = screen.getAllByRole('button').map((b) => b.textContent?.trim());
    expect(libelles).toEqual(['Demander une visite', 'WhatsApp', 'Appeler', 'Envoyer un message', 'Déposer mon dossier']);
  });

  it('vente : « Faire une offre » primaire, la visite ensuite', () => {
    carte(bien('sale'), TELEPHONE_SEUL);
    const libelles = screen.getAllByRole('button').map((b) => b.textContent?.trim());
    expect(libelles).toEqual(['Faire une offre', 'Demander une visite', 'Appeler', 'Envoyer un message']);
  });
});

describe('la carte de l’agent ne porte plus aucun canal', () => {
  it('ni Message, ni Appeler, ni WhatsApp — même quand le contact a tout', () => {
    render(withIntl(<PropertyAgentCard contact={AVEC_WHATSAPP} agency={null} />));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Sokhna Gueye')).toBeInTheDocument();
  });
});
