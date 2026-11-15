import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { MaintenanceRequest } from '@/types/maintenance';
import { DemandeEnvoyee } from '../DemandeEnvoyee';

/**
 * TCK-2654 — « Demande envoyée » : l'agence nommée, le résumé de la demande, les quatre étapes, et
 * « Appeler l'agence » seulement quand son numéro est connu POUR CE BAIL. Aucun montant.
 */
const lecture = vi.hoisted(() => ({
  demande: null as Partial<MaintenanceRequest> | null,
  resume: null as unknown,
  moi: 78,
}));
const routeur = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => routeur }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: lecture.moi } }) }));

vi.mock('@/lib/queries/maintenance', () => ({
  useMaintenanceRequest: () => ({ isLoading: false, isError: false, data: lecture.demande ? { data: lecture.demande } : undefined, refetch: vi.fn() }),
}));
vi.mock('@/lib/queries/payments', () => ({
  useResumeDuLoyer: () => ({ data: lecture.resume ? { data: lecture.resume } : undefined }),
}));

const MAINTENANT = new Date().toISOString();

function demande(surcharge: Partial<MaintenanceRequest> = {}): Partial<MaintenanceRequest> {
  return {
    id: 91,
    lease_id: 5,
    requester_id: 78,
    title: 'Problème d’eau',
    category: 'plumbing',
    priority: 'urgent',
    status: 'open',
    created_at: MAINTENANT,
    property: { id: 44, title: 'Garage à Ouest Foire', slug: null, agency: { id: 1, name: 'Dakar Immo' } },
    media: {
      photos: [
        { id: 1, name: 'a.jpg', mime_type: 'image/jpeg', size: 1, url: 'https://api.test/a', thumbnail_url: 'https://api.test/a-t', created_at: MAINTENANT },
        { id: 2, name: 'b.jpg', mime_type: 'image/jpeg', size: 1, url: 'https://api.test/b', thumbnail_url: null, created_at: MAINTENANT },
      ],
      before_photos: [],
      completion_photos: [],
    } as unknown as MaintenanceRequest['media'],
    ...surcharge,
  };
}

function resume(leaseId: number, phone: string | null) {
  return { lease: { id: leaseId, agency: { id: 1, name: 'Dakar Immo', phone } } };
}

function monter() {
  return render(withIntl(<DemandeEnvoyee id={91} />));
}

describe('DemandeEnvoyee — TCK-2654', () => {
  beforeEach(() => {
    lecture.demande = demande();
    lecture.resume = resume(5, '+221771234567');
    lecture.moi = 78;
    routeur.replace.mockReset();
  });

  it('le demandeur n’est renvoyé nulle part', () => {
    monter();
    expect(routeur.replace).not.toHaveBeenCalled();
  });

  it('tout autre lecteur est renvoyé à la fiche normale, sans voir l’écran', () => {
    lecture.moi = 18;
    monter();
    expect(routeur.replace).toHaveBeenCalledWith('/app/maintenance/91');
    expect(screen.queryByText(/a reçu votre demande/)).toBeNull();
  });

  it('nomme l’agence du bien et résume la demande, envoyée aujourd’hui', () => {
    monter();
    expect(screen.getByRole('heading', { name: 'Dakar Immo a reçu votre demande' })).toBeInTheDocument();
    expect(screen.getByText('Eau · urgent · 2 photos')).toBeInTheDocument();
    expect(screen.getByText(/^Envoyée aujourd’hui à \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir ma demande' })).toHaveAttribute('href', '/app/maintenance/91');
  });

  it('« Appeler l’agence » mène au numéro de l’agence du MÊME bail', () => {
    monter();
    expect(screen.getByRole('link', { name: 'Appeler l’agence' })).toHaveAttribute('href', expect.stringMatching(/^tel:/));
  });

  it('sans numéro pour ce bail, pas de lien d’appel', () => {
    lecture.resume = resume(6, '+221771234567');
    monter();
    expect(screen.queryByRole('link', { name: 'Appeler l’agence' })).toBeNull();
  });

  it('les étapes suivent le statut : « Artisan choisi » en cours sur une demande ouverte', () => {
    monter();
    const etapes = within(screen.getByRole('list', { name: 'Avancement de la demande' })).getAllByRole('listitem');
    expect(etapes.map((e) => e.textContent)).toEqual(['Reçue', 'Artisan choisi', 'Visite', 'Vous confirmez']);
    expect(etapes[1]).toHaveAttribute('aria-current', 'step');
  });

  it('sans agence chargée, la phrase ne nomme personne', () => {
    lecture.demande = demande({ property: null });
    monter();
    expect(screen.getByRole('heading', { name: 'Votre agence a reçu votre demande' })).toBeInTheDocument();
  });

  it('aucun montant n’est rendu', () => {
    lecture.demande = demande({ actual_cost: 45000, estimated_cost: 50000 } as Partial<MaintenanceRequest>);
    const { container } = monter();
    expect(container.textContent).not.toMatch(/\bF\b|CFA|45\s?000|50\s?000/);
  });

  // TCK-2918 (e4, AC7) — la médiane de prise en charge de l'agence, par tranche ; aucune phrase sans elle.
  describe('le délai de réponse de l’agence (TCK-2918)', () => {
    it.each([
      [42, 'L’agence répond d’ordinaire dans l’heure.'],
      [60, 'L’agence répond d’ordinaire dans l’heure.'],
      [300, 'L’agence répond d’ordinaire dans la journée.'],
      [2 * 1440 + 5, 'L’agence répond d’ordinaire sous 3 jours.'],
    ])('%i min → « %s »', (minutes, phrase) => {
      lecture.demande = demande({ maintenance_response_minutes: minutes });
      monter();
      expect(document.querySelector('[data-slot="delai-de-reponse"]')?.textContent?.trim()).toBe(phrase);
    });

    it('nul (moins de 5 demandes) : aucune phrase de délai', () => {
      lecture.demande = demande({ maintenance_response_minutes: null });
      const { container } = monter();
      expect(container.querySelector('[data-slot="delai-de-reponse"]')).toBeNull();
      expect(container.textContent).not.toMatch(/répond d’ordinaire/);
    });
  });
});

// TCK-2902 (e4, AC3) — le résumé compte la note vocale servie au détail (`media.voice_note`).
describe('DemandeEnvoyee — le message vocal (TCK-2902)', () => {
  const NOTE = { id: 3, url: 'https://api.test/voix', duration: 12, mime_type: 'audio/webm' };
  beforeEach(() => {
    lecture.resume = null;
    lecture.moi = 78;
  });

  it('2 photos et une note : « Eau · urgent · 2 photos, 1 message vocal »', () => {
    const base = demande();
    lecture.demande = { ...base, media: { ...base.media!, voice_note: NOTE } };
    monter();
    expect(screen.getByText('Eau · urgent · 2 photos, 1 message vocal')).toBeInTheDocument();
  });

  it('une note sans photo : « 1 message vocal », jamais « sans photo »', () => {
    lecture.demande = demande({ media: { photos: [], before_photos: [], completion_photos: [], voice_note: NOTE } as unknown as MaintenanceRequest['media'] });
    monter();
    expect(screen.getByText('Eau · urgent · 1 message vocal')).toBeInTheDocument();
  });

  it('sans note (`voice_note: null`) : le résumé ne parle d’aucun message vocal', () => {
    const base = demande();
    lecture.demande = { ...base, media: { ...base.media!, voice_note: null } };
    monter();
    expect(screen.getByText('Eau · urgent · 2 photos')).toBeInTheDocument();
    expect(screen.queryByText(/message vocal/)).toBeNull();
  });
});
