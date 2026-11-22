import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import type { MaintenanceRequest } from '@/types/maintenance';
import { MesDemandesDuLocataire } from '../MesDemandesDuLocataire';

/**
 * TCK-2654, lot 2 — « Interventions » du locataire : la terminée à confirmer en tête (gestes servis
 * par la fiche), en cours, terminées (trois, puis « Tout voir »), l'état vide qui parle du logement,
 * et AUCUN montant même quand la ligne en porterait un.
 */
const lecture = vi.hoisted(() => ({
  liste: [] as unknown[],
  fiche: null as unknown,
  erreur: false,
}));
const gestes = vi.hoisted(() => ({ confirmer: vi.fn(), contester: vi.fn(async () => ({})) }));

vi.mock('@/lib/queries/maintenance-signalement', () => ({
  DEMANDES_DU_LOCATAIRE_PAR_PAGE: 50,
  useDemandesDuLocataire: () => ({
    isPending: false,
    isError: lecture.erreur,
    data: lecture.erreur ? undefined : { data: lecture.liste, meta: { total: lecture.liste.length } },
    refetch: vi.fn(),
  }),
}));
vi.mock('@/lib/queries/maintenance', () => ({
  useMaintenanceRequest: (id: number | null) => ({ data: id && lecture.fiche ? { data: lecture.fiche } : undefined }),
  useConfirmMaintenanceResolution: () => ({ mutate: gestes.confirmer, isPending: false, error: null }),
  useContestMaintenanceResolution: () => ({ mutateAsync: gestes.contester, isPending: false, error: null }),
}));
vi.mock('@/lib/reduire-photo', () => ({ reduirePhotos: async (p: File[]) => p }));

const HIER = new Date(Date.now() - 86_400_000).toISOString();
const DANS_6_JOURS = new Date(Date.now() + 6 * 86_400_000 - 60_000).toISOString();

function ligne(id: number, surcharge: Partial<InterventionEnFile> = {}): InterventionEnFile {
  return {
    id,
    property_id: 44,
    lease_id: 5,
    requester_id: 78,
    assigned_to: null,
    title: `Demande ${id}`,
    category: 'plumbing',
    priority: 'normal',
    status: 'open',
    scheduled_at: null,
    completed_at: null,
    created_at: HIER,
    property: { id: 44, title: 'Villa 4 chambres', slug: null },
    // Une ligne qui porterait un montant : l'écran ne doit JAMAIS le rendre.
    actual_cost: 485000,
    ...surcharge,
  } as unknown as InterventionEnFile;
}

const TERMINEE = ligne(7, { title: 'Chasse d’eau qui fuit', status: 'completed', completed_at: HIER, auto_close_at: DANS_6_JOURS, assigned_to: 12 });

function fiche(abilities: Partial<NonNullable<MaintenanceRequest['abilities']>>) {
  return { ...TERMINEE, assignee: { id: 12, name: 'Astou Sy' }, abilities };
}

function monter() {
  return render(withIntl(<MesDemandesDuLocataire />));
}

describe('MesDemandesDuLocataire — TCK-2654', () => {
  beforeEach(() => {
    lecture.liste = [];
    lecture.fiche = null;
    lecture.erreur = false;
    gestes.confirmer.mockReset();
    gestes.contester.mockClear();
  });

  it('sans demande : un état vide qui parle du logement et mène au signalement', () => {
    monter();
    expect(screen.getByText('Un souci dans votre logement ?')).toBeTruthy();
    expect(screen.getByText('Signalez-le ici.')).toBeTruthy();
    const liens = screen.getAllByRole('link', { name: /Signaler un problème/ });
    expect(liens.every((l) => l.getAttribute('href') === '/app/maintenance/new')).toBe(true);
    expect(screen.queryByText(/[Cc]liquez/)).toBeNull();
  });

  it('la terminée à confirmer est en tête : question, artisan, délai de clôture, « C’est réparé » envoie la confirmation', () => {
    lecture.liste = [ligne(1, { status: 'assigned' }), TERMINEE];
    lecture.fiche = fiche({ can_confirm_resolution: true, can_contest_resolution: true });
    monter();
    const carte = document.querySelector('[data-slot="demande-a-confirmer"]') as HTMLElement;
    expect(carte).toBeTruthy();
    expect(within(carte).getByRole('heading', { name: 'Chasse d’eau qui fuit : le problème est-il réglé ?' })).toBeTruthy();
    expect(within(carte).getByText(/Astou Sy a terminé l’intervention hier à/)).toBeTruthy();
    expect(within(carte).getByText(/sera close dans 6 jours/)).toBeTruthy();
    fireEvent.click(within(carte).getByRole('button', { name: /C’est réparé|C'est réparé/ }));
    expect(gestes.confirmer).toHaveBeenCalledTimes(1);
    // Elle n'est pas répétée dans « En cours ».
    const enCours = screen.getByRole('region', { name: 'En cours' });
    expect(within(enCours).queryByText('Chasse d’eau qui fuit')).toBeNull();
    expect(within(enCours).getByText('Demande 1')).toBeTruthy();
  });

  it('« Le problème persiste » ouvre le mot et les photos à l’appareil, puis envoie le mot', async () => {
    lecture.liste = [TERMINEE];
    lecture.fiche = fiche({ can_confirm_resolution: true, can_contest_resolution: true });
    monter();
    fireEvent.click(screen.getByRole('button', { name: 'Le problème persiste' }));
    const photos = document.querySelector('[data-slot="photos-persiste"]') as HTMLInputElement;
    expect(photos.getAttribute('capture')).toBe('environment');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  ça fuit encore  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await vi.waitFor(() => expect(gestes.contester).toHaveBeenCalledWith({ comment: 'ça fuit encore', photos: undefined }));
  });

  it('sans geste servi par la fiche, la terminée n’a pas de carte et se lit « En cours »', () => {
    lecture.liste = [TERMINEE];
    lecture.fiche = fiche({ can_confirm_resolution: false, can_contest_resolution: false });
    monter();
    expect(document.querySelector('[data-slot="demande-a-confirmer"]')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'En cours' })).getByText('Chasse d’eau qui fuit')).toBeTruthy();
  });

  it('en cours : « Urgente », l’artisan et son passage ; la carte mène à la fiche', () => {
    const demain = new Date(Date.now() + 86_400_000).toISOString();
    lecture.liste = [ligne(3, { title: 'Fuite sous l’évier', priority: 'urgent', status: 'assigned', scheduled_at: demain, assignee: { id: 12, name: 'Astou Sy' } } as Partial<InterventionEnFile>)];
    monter();
    const carte = document.querySelector('[data-slot="demande-en-cours"]') as HTMLElement;
    expect(within(carte).getByText('Urgente')).toBeTruthy();
    expect(carte.textContent).toMatch(/Astou Sy passe demain à \d\d:\d\d\./);
    expect(within(carte).getByRole('link', { name: 'Fuite sous l’évier' }).getAttribute('href')).toBe('/app/maintenance/3');
    expect(within(carte).getByRole('list', { name: /avancement/i }).querySelector('[aria-current="step"]')?.textContent).toBe('Visite');
  });

  it('terminées : trois au plus, puis « Tout voir » vers la liste complète', () => {
    lecture.liste = [1, 2, 3, 4].map((i) => ligne(i, { status: 'closed', completed_at: HIER }));
    monter();
    const closes = screen.getByRole('region', { name: 'Terminées' });
    expect(within(closes).getAllByRole('listitem')).toHaveLength(3);
    expect(within(closes).getByRole('link', { name: 'Tout voir' }).getAttribute('href')).toBe('/app/maintenance?status=closed,cancelled');
  });

  it('aucun montant n’est rendu, même porté par une ligne', () => {
    lecture.liste = [ligne(1), TERMINEE, ligne(2, { status: 'closed', completed_at: HIER })];
    lecture.fiche = fiche({ can_confirm_resolution: true, can_contest_resolution: true });
    monter();
    const texte = document.body.textContent ?? '';
    expect(texte).not.toMatch(/F\s?CFA|XOF|485/);
  });
});
