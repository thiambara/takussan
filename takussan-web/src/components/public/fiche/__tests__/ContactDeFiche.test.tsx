import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

import { ContactDeFiche } from '../ContactDeFiche';
import type { FicheIdentifiee } from '../useFicheDeSoi';

/**
 * TCK-2575 — sa propre fiche publique ne propose pas de se contacter soi-même.
 *
 * La fiche est rendue par le serveur SANS la session du visiteur (la même pour tous) : la
 * reconnaissance est côté client, après l'hydratation. D'où deux sortes de preuves :
 * - `renderToString` : le HTML du serveur est IDENTIQUE pour la personne de la fiche et pour un
 *   anonyme (AC1, seconde moitié) — `AuthContext` porte pourtant l'utilisateur dès le serveur ;
 * - `render` (jsdom, monté) : la personne voit « C'est votre fiche » et le lien, jamais les canaux
 *   (AC1) ; un autre connecté et un anonyme voient les canaux inchangés (AC2).
 */

const etat = vi.hoisted(() => ({
  user: null as { id: number; roles: string[] } | null,
  activeProfileId: null as string | null,
  profils: undefined as { data: { id: string; agency_id: number | null }[]; meta: { active_profile_id: string | null } } | undefined,
  capacites: undefined as { data: { agency_id: number | null; capabilities: string[] } } | undefined,
  capacitesDemandees: [] as boolean[],
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: etat.user as unknown as User | null, activeProfileId: etat.activeProfileId }),
}));
vi.mock('@/components/navigation-publique/useEspacePublic', () => ({
  useEspacesDuComptePublic: (user: unknown) => ({ data: user ? etat.profils : undefined }),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: (_agencyId: unknown, enabled: boolean) => {
    etat.capacitesDemandees.push(enabled);
    return { data: enabled ? etat.capacites : undefined };
  },
}));
vi.mock('@/app/actions/property', () => ({ submitAgentContactLead: vi.fn() }));
// Le formulaire anonyme a ses propres tests ; ici, seulement s'il est monté (il exige un ToastProvider).
vi.mock('@/components/public/AnonymousLeadDialog', () => ({ AnonymousLeadDialog: () => <div data-formulaire-anonyme="" /> }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/fr/agents/moustapha-fall',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const MOUSTAPHA: FicheIdentifiee = { genre: 'personne', id: 12, role: 'agent' };
const AGENCE: FicheIdentifiee = { genre: 'agence', id: 7 };

function fichePersonne(fiche: FicheIdentifiee = MOUSTAPHA) {
  return (
    <ContactDeFiche
      nom="Moustapha Fall"
      telephone="+221770000000"
      message={{ genre: 'formulaire', slug: 'moustapha-fall', role: 'agent' }}
      fiche={fiche}
    />
  );
}

function ficheAgence() {
  return (
    <ContactDeFiche
      nom="Dakar Immo"
      telephone="+221330000000"
      message={{ genre: 'courriel', adresse: 'contact@dakar-immo.sn' }}
      fiche={AGENCE}
    />
  );
}

function canaux() {
  return document.querySelectorAll('[data-canal]');
}

beforeEach(() => {
  etat.user = null;
  etat.activeProfileId = null;
  etat.profils = undefined;
  etat.capacites = undefined;
  etat.capacitesDemandees = [];
});

describe('TCK-2575 · AC1 — la personne de la fiche', () => {
  it('ni « Appeler », ni « Message » : « C’est votre fiche publique » et le lien vers sa section', () => {
    etat.user = { id: 12, roles: ['agent'] };
    render(withIntl(fichePersonne()));

    expect(canaux()).toHaveLength(0);
    expect(screen.queryByText('Appeler')).not.toBeInTheDocument();
    expect(screen.queryByText('Message')).not.toBeInTheDocument();
    expect(screen.getAllByText("C'est votre fiche publique")).toHaveLength(2);
    const liens = screen.getAllByRole('link', { name: 'Modifier ma fiche' });
    expect(liens).toHaveLength(2); // carte de bureau + barre du téléphone
    for (const lien of liens) expect(lien).toHaveAttribute('href', '/app/profile/public-profile');
  });

  it('un propriétaire : le lien mène à son profil (la section « Fiche publique » est celle d’un agent)', () => {
    etat.user = { id: 12, roles: ['owner'] };
    render(withIntl(fichePersonne({ genre: 'personne', id: 12, role: 'owner' })));

    expect(canaux()).toHaveLength(0);
    for (const lien of screen.getAllByRole('link', { name: 'Modifier ma fiche' })) expect(lien).toHaveAttribute('href', '/app/profile');
  });

  it('le HTML du serveur est le même que celui d’un visiteur anonyme — canaux compris', () => {
    etat.user = { id: 12, roles: ['agent'] };
    const soi = renderToString(withIntl(fichePersonne()));
    etat.user = null;
    const visiteur = renderToString(withIntl(fichePersonne()));

    expect(soi).toBe(visiteur);
    expect(soi).toContain('data-canal="appel"');
    expect(soi).not.toContain('data-fiche-de-soi');
  });

  it('agence : même HTML serveur pour qui la configure et pour un anonyme', () => {
    etat.user = { id: 3, roles: ['agency_admin'] };
    etat.profils = { data: [{ id: 'agency_admin:1', agency_id: 7 }], meta: { active_profile_id: 'agency_admin:1' } };
    etat.capacites = { data: { agency_id: 7, capabilities: ['agency.update'] } };
    const soi = renderToString(withIntl(ficheAgence()));
    etat.user = null;
    const visiteur = renderToString(withIntl(ficheAgence()));

    expect(soi).toBe(visiteur);
    expect(soi).toContain('data-canal="courriel"');
  });
});

describe('TCK-2575 · AC2 — les autres voient les canaux, inchangés', () => {
  it('un autre utilisateur connecté', () => {
    etat.user = { id: 99, roles: ['agent'] };
    render(withIntl(fichePersonne()));

    expect([...canaux()].map((c) => c.getAttribute('data-canal'))).toEqual(['appel', 'formulaire', 'appel', 'formulaire']);
    expect(screen.queryByRole('link', { name: 'Modifier ma fiche' })).not.toBeInTheDocument();
  });

  it('un anonyme', () => {
    render(withIntl(fichePersonne()));

    expect(canaux()).toHaveLength(4);
    expect(document.querySelector('[data-fiche-de-soi]')).toBeNull();
  });
});

describe('TCK-2575 — la fiche d’agence : à la capacité, dans l’agence ACTIVE', () => {
  const admin = (agenceActive: number, capacites: string[], agenceDesCapacites = agenceActive) => {
    etat.user = { id: 3, roles: ['agency_admin'] };
    etat.profils = { data: [{ id: 'agency_admin:1', agency_id: agenceActive }], meta: { active_profile_id: 'agency_admin:1' } };
    etat.capacites = { data: { agency_id: agenceDesCapacites, capabilities: capacites } };
  };

  it('qui tient `agency.update` dans l’agence active = celle de la fiche : le lien vers /app/agency, aucun canal', () => {
    admin(7, ['agency.update']);
    render(withIntl(ficheAgence()));

    expect(canaux()).toHaveLength(0);
    expect(screen.getAllByText("C'est la fiche publique de votre agence")).toHaveLength(2);
    for (const lien of screen.getAllByRole('link', { name: "Modifier la fiche de l'agence" })) expect(lien).toHaveAttribute('href', '/app/agency');
  });

  it('un membre de l’agence SANS la capacité : les canaux, comme un visiteur', () => {
    admin(7, ['properties.view']);
    render(withIntl(ficheAgence()));

    expect(canaux()).toHaveLength(4);
  });

  it('la capacité, mais dans une AUTRE agence active : les canaux — et les capacités ne sont pas lues', () => {
    admin(8, ['agency.update']);
    render(withIntl(ficheAgence()));

    expect(canaux()).toHaveLength(4);
    expect(etat.capacitesDemandees.every((demande) => !demande)).toBe(true);
  });

  it('des capacités rendues pour une autre agence que la fiche : les canaux', () => {
    admin(7, ['agency.update'], 8);
    render(withIntl(ficheAgence()));

    expect(canaux()).toHaveLength(4);
  });
});

/**
 * TCK-2576 — WhatsApp au premier rang, puis Appeler, puis Message ; et seulement sur le numéro que
 * l'API a dit sur WhatsApp (`whatsapp`), jamais déduit de `telephone`.
 */
describe('TCK-2576 — WhatsApp au premier rang des fiches', () => {
  function avecWhatsApp(whatsapp: string | null, telephone: string | null = '+221770000000') {
    return (
      <ContactDeFiche
        nom="Moustapha Fall"
        telephone={telephone}
        whatsapp={whatsapp}
        message={{ genre: 'formulaire', slug: 'moustapha-fall', role: 'agent' }}
        fiche={MOUSTAPHA}
      />
    );
  }

  it('AC1 — la barre commence par WhatsApp, lien `wa.me` sur ce numéro ; puis Appeler, puis Message', () => {
    render(withIntl(avecWhatsApp('+221770000000')));

    expect([...canaux()].map((c) => c.getAttribute('data-canal'))).toEqual([
      'whatsapp', 'appel', 'formulaire', // carte de bureau
      'whatsapp', 'appel', 'formulaire', // barre du téléphone
    ]);
    const liens = screen.getAllByRole('link', { name: 'Écrire à Moustapha Fall sur WhatsApp' });
    expect(liens).toHaveLength(2);
    for (const lien of liens) {
      const href = new URL(lien.getAttribute('href') ?? '');
      expect(`${href.origin}${href.pathname}`).toBe('https://wa.me/221770000000');
      expect(href.searchParams.get('text')).toContain('Moustapha Fall');
      expect(lien).toHaveAttribute('target', '_blank');
      expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
    }
    // Au téléphone, trois canaux : Appeler et Message gardent leur nom accessible, en carré.
    const barre = document.querySelector('[data-contact-fiche="barre"]');
    expect(barre?.querySelector('[data-canal="appel"]')).toHaveAccessibleName('Appeler');
    expect(barre?.querySelector('[data-canal="formulaire"]')).toHaveAccessibleName('Message');
  });

  it('AC2 — sans numéro WhatsApp : aucun bouton WhatsApp, l’ordre d’avant', () => {
    render(withIntl(avecWhatsApp(null)));

    expect(document.querySelector('[data-canal="whatsapp"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect([...canaux()].map((c) => c.getAttribute('data-canal'))).toEqual(['appel', 'formulaire', 'appel', 'formulaire']);
  });

  it('WhatsApp seul suffit à montrer la carte (une agence sans téléphone ni e-mail)', () => {
    render(
      withIntl(<ContactDeFiche nom="Dakar Immo" telephone={null} whatsapp="+221781234567" message={null} fiche={AGENCE} />),
    );

    expect([...canaux()].map((c) => c.getAttribute('data-canal'))).toEqual(['whatsapp', 'whatsapp']);
  });

  it('sur sa propre fiche, pas plus de WhatsApp que d’autres canaux', () => {
    etat.user = { id: 12, roles: ['agent'] };
    render(withIntl(avecWhatsApp('+221770000000')));

    expect(canaux()).toHaveLength(0);
  });
});
