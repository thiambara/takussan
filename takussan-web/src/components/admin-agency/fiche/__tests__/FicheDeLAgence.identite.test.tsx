import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', async () => (await import('./doublures')).navigation);
vi.mock('@/app/actions/admin-agency', async () => (await import('./doublures')).ACTIONS);
vi.mock('@/context/AuthContext', async () => (await import('./doublures')).auth);
vi.mock('@/hooks/useCan', async () => (await import('./doublures')).can);
vi.mock('@/lib/queries/kyc', async () => (await import('./doublures')).KYC);
vi.mock('@/lib/queries/admin-users', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).EQUIPE }));
vi.mock('@/lib/queries/agency-queues', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).fileDeModeration }));
// La réduction des photos, doublée : la fiche n'expose pas les outils d'image.
const reduction = vi.hoisted(() => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotoSousPlafond: vi.fn(async (f: File, _plafond: number) => f),
}));
vi.mock('@/lib/reduire-photo', () => reduction);

import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';

import { ACTIONS, ROUTEUR, reinitialiserLesDoublures } from './doublures';
import { AGENCE, barreDuBureau, champ, enregistrer, rendreLaFiche } from './outils';

/**
 * TCK-2670 — la section « Identité » de la fiche : le logo (TCK-1031, TCK-2144), l'identifiant
 * (TCK-1004) et la regénération des filigranes (TCK-370, TCK-633) — portés de `AgencyConfigForm`.
 *
 * Le logo se dépose TOUT DE SUITE (`POST /api/media`), hors de « Enregistrer » : il ne compte pas
 * comme une modification, et ne défait pas la saisie en cours.
 */

const DEUX_MO = 2 * 1024 * 1024;
const champLogo = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

beforeEach(() => {
  reinitialiserLesDoublures();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:apercu') }));
  ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: AGENCE });
  ACTIONS.uploadAgencyLogoAction.mockResolvedValue({ ok: true, data: { ...AGENCE, logo_url: 'http://127.0.0.1:8002/storage/logo.png' } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('le logo (TCK-1031, TCK-2144)', () => {
  it("aucun champ fichier n'est à la fois atteignable au clavier et exposé sans nom", () => {
    rendreLaFiche();
    const champs = [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')];
    expect(champs.length).toBeGreaterThan(0);
    for (const c of champs) {
      const nomme = Boolean(c.getAttribute('aria-label') || c.labels?.length);
      const horsTabulation = c.tabIndex === -1 && c.getAttribute('aria-hidden') === 'true';
      expect(nomme || horsTabulation).toBe(true);
    }
  });

  it('le bouton visible ouvre le sélecteur de fichier', async () => {
    rendreLaFiche();
    const ouvrir = vi.spyOn(champLogo(), 'click');
    await userEvent.setup().click(screen.getByRole('button', { name: fr.admin.agencyConfig.logo.add }));
    expect(ouvrir).toHaveBeenCalledTimes(1);
  });

  it('un logo de 5 Mo réductible sous 2 Mo est accepté, part réduit, tout de suite, hors du PATCH', async () => {
    const lourd = new File([new Uint8Array(5 * 1024 * 1024)], 'logo.jpg', { type: 'image/jpeg' });
    const leger = new File([new Uint8Array(1024 * 1024)], 'logo.jpg', { type: 'image/jpeg' });
    reduction.reduirePhotoSousPlafond.mockImplementationOnce(async () => leger);
    rendreLaFiche();

    await userEvent.setup().upload(champLogo(), lourd);

    await waitFor(() => expect(ACTIONS.uploadAgencyLogoAction).toHaveBeenCalledTimes(1));
    expect(reduction.reduirePhotoSousPlafond).toHaveBeenCalledWith(lourd, DEUX_MO);
    expect((ACTIONS.uploadAgencyLogoAction.mock.calls[0][1] as FormData).get('file')).toBe(leger);
    expect(screen.queryByText('Le logo dépasse 2 Mo.')).not.toBeInTheDocument();
    expect(ACTIONS.updateAgencyAction).not.toHaveBeenCalled();
    expect(await screen.findByText(fr.admin.agencyConfig.logoUpdated)).toBeInTheDocument();
    expect(ROUTEUR.refresh).toHaveBeenCalledTimes(1);
    expect(barreDuBureau()).toBeNull();
  });

  it('un logo qui reste au-dessus de 2 Mo une fois réduit est refusé, sans envoi', async () => {
    rendreLaFiche();
    await userEvent.setup().upload(champLogo(), new File([new Uint8Array(5 * 1024 * 1024)], 'logo.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('Le logo dépasse 2 Mo.')).toBeInTheDocument();
    expect(ACTIONS.uploadAgencyLogoAction).not.toHaveBeenCalled();
  });

  it('déposé pendant une saisie, il ne la défait pas : seul le champ saisi part ensuite', async () => {
    const user = userEvent.setup();
    rendreLaFiche();
    await user.type(champ('phone'), '+221338210000');
    await user.upload(champLogo(), new File([new Uint8Array(1024)], 'logo.png', { type: 'image/png' }));
    await waitFor(() => expect(ACTIONS.uploadAgencyLogoAction).toHaveBeenCalledTimes(1));
    expect(champ('phone')).toHaveValue('+221338210000');
    expect(await enregistrer(user)).toEqual({ phone: '+221338210000' });
  });
});

describe('l’identifiant de la fiche publique (TCK-1004)', () => {
  const AWA = (slugEditable: boolean | undefined): Agency => ({ ...AGENCE, name: 'Espace de Awa', slug: 'espace-de-awa', slug_editable: slugEditable });

  it('slug_editable : le champ s’édite, et le nouveau slug part seul', async () => {
    const user = userEvent.setup();
    rendreLaFiche(AWA(true));
    expect(screen.getByText(/vous pouvez remplacer cet identifiant une seule fois/)).toBeInTheDocument();
    await user.clear(champ('slug'));
    await user.type(champ('slug'), 'awa-immo');
    expect(await enregistrer(user)).toEqual({ slug: 'awa-immo' });
  });

  it('slug_editable, slug inchangé : aucune modification, le changement n’est pas consommé', () => {
    rendreLaFiche(AWA(true));
    expect(champ('slug')).toHaveValue('espace-de-awa');
    expect(barreDuBureau()).toBeNull();
  });

  it.each([[false], [undefined]])('slug_editable=%s : l’adresse en lecture seule, à copier, jamais envoyée', async (editable) => {
    const user = userEvent.setup();
    rendreLaFiche(AWA(editable));
    expect(document.getElementById('field-slug')).toBeNull();
    const adresses = screen.getAllByTestId('adresse-publique');
    expect(adresses.some((a) => a.textContent === 'www.takussan.com/agencies/espace-de-awa')).toBe(true);
    await user.type(champ('phone'), '+221338210000');
    expect(await enregistrer(user)).toEqual({ phone: '+221338210000' });
  });
});

describe('la regénération des filigranes (TCK-370, TCK-633)', () => {
  const BOUTON = /Regénérer|Régénérer/;

  it('montée quand le filigrane est allumé ; son bouton ne soumet pas la fiche', async () => {
    const user = userEvent.setup();
    rendreLaFiche(AGENCE, { filigranes: true });
    await user.type(champ('phone'), '+221338210000');
    const section = screen.getByRole('region', { name: /Identité et contact/ });
    await user.click(within(section).getByRole('button', { name: BOUTON }));
    expect(ACTIONS.updateAgencyAction).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('absente quand il est éteint', () => {
    rendreLaFiche(AGENCE, { filigranes: false });
    expect(screen.queryByRole('button', { name: BOUTON })).toBeNull();
  });
});
