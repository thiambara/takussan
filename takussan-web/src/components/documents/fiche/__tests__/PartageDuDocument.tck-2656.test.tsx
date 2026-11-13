/**
 * TCK-2656 (lot 3, AC5) — partager depuis la fiche : la charge utile (7 jours, mot de passe,
 * 3 téléchargements), « Lien copié » seulement si le presse-papiers l'a pris, le lien dans « Liens de
 * partage », « Révoquer » qui le retire, et un mot de passe qui ne part jamais par WhatsApp.
 */
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { DocumentShareLink } from '@/types/document';

const JOUR = 24 * 60 * 60 * 1000;
const lien = (id: number, champs: Partial<DocumentShareLink> = {}): DocumentShareLink => ({
  id,
  document_id: 4,
  token: `jeton-${id}`,
  expires_at: new Date(Date.now() + 2 * JOUR).toISOString(),
  max_downloads: 3,
  downloads_count: 1,
  has_password: true,
  revoked_at: null,
  created_at: '2026-11-05T09:00:00Z',
  ...champs,
});

const { etat, creer, revoquer } = vi.hoisted(() => ({
  etat: { lus: [] as DocumentShareLink[], appels: [] as unknown[] },
  creer: vi.fn(),
  revoquer: vi.fn(),
}));

vi.mock('@/lib/queries/documents', () => ({
  useShareLinks: (...args: unknown[]) => {
    etat.appels.push(args);
    return { data: { data: etat.lus }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() };
  },
  useCreateShareLink: () => ({ mutateAsync: creer, isPending: false }),
  useRevokeShareLink: () => ({ mutateAsync: revoquer, isPending: false }),
}));

import { LiensDePartage, PartagerParLien, useSuiviDesLiens } from '../PartageDuDocument';

function Banc({ bureau = false }: { readonly bureau?: boolean }) {
  const suivi = useSuiviDesLiens();
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      {bureau ? null : (
        <button type="button" onClick={() => setOuvert(true)}>
          Partager
        </button>
      )}
      <PartagerParLien
        open={ouvert}
        onOpenChange={setOuvert}
        document={{ id: 4, name: 'Carte d’identité' }}
        suivi={suivi}
        bureau={bureau}
        declencheur={bureau ? <button type="button">Partager</button> : undefined}
      />
      <LiensDePartage document={{ id: 4 }} suivi={suivi} />
    </>
  );
}

const cree = lien(9, { downloads_count: 0, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * JOUR).toISOString() });

beforeEach(() => {
  etat.lus = [lien(2)];
  etat.appels = [];
  creer.mockReset().mockResolvedValue({ data: cree });
  revoquer.mockReset().mockResolvedValue(undefined);
});

async function ouvrirEtRemplir(user: ReturnType<typeof userEvent.setup>, motDePasse: string | null) {
  await user.click(screen.getByRole('button', { name: 'Partager' }));
  const feuille = await screen.findByRole('dialog');
  await user.click(within(feuille).getByRole('radio', { name: '30 jours' }));
  await user.click(within(feuille).getByRole('radio', { name: '7 jours' }));
  if (motDePasse !== null) {
    await user.click(within(feuille).getByRole('switch', { name: 'Protéger par un mot de passe' }));
    if (motDePasse) await user.type(within(feuille).getByLabelText('Mot de passe'), motDePasse);
  }
  return feuille;
}

describe('TCK-2656 — partager un document par lien (AC5)', () => {
  it('7 jours, un mot de passe et 3 téléchargements partent ; le lien entre dans la liste, « Révoquer » l’en retire', async () => {
    const user = userEvent.setup();
    render(withIntl(<Banc />));
    expect(screen.getByRole('heading', { name: 'Liens de partage (1)' })).toBeInTheDocument();

    const avant = Date.now();
    await ouvrirEtRemplir(user, 'Sacre-Coeur');
    expect(screen.getByTestId('plafond')).toHaveTextContent('3');
    await user.click(screen.getByRole('button', { name: 'Créer le lien et le copier' }));

    await waitFor(() => expect(creer).toHaveBeenCalledTimes(1));
    const charge = creer.mock.calls[0][0];
    expect(charge).toMatchObject({ document_id: 4, max_downloads: 3, password: 'Sacre-Coeur' });
    const ecart = new Date(charge.expires_at).getTime() - avant;
    expect(ecart).toBeGreaterThanOrEqual(7 * JOUR - 1000);
    expect(ecart).toBeLessThan(7 * JOUR + 60_000);

    expect(await screen.findByText('Lien copié')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/share/jeton-9`);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Liens de partage (2)' })).toBeInTheDocument();
    const lignes = screen.getAllByTestId('lien-actif');
    expect(lignes[0]).toHaveTextContent('Créé à l’instant par vous');
    expect(lignes[0]).toHaveTextContent('0 téléchargement sur 3');

    await user.click(within(lignes[0]).getByRole('button', { name: /Révoquer/ }));
    await waitFor(() => expect(revoquer).toHaveBeenCalledWith({ document_id: 4, link_id: 9 }));
    await waitFor(() => expect(screen.getAllByTestId('lien-actif')).toHaveLength(1));
    expect(screen.getByRole('heading', { name: 'Liens de partage (1)' })).toBeInTheDocument();
  });

  it('protégé sans mot de passe, ou d’un mot de passe trop court : rien ne part', async () => {
    const user = userEvent.setup();
    render(withIntl(<Banc />));
    const feuille = await ouvrirEtRemplir(user, '');
    await user.click(screen.getByRole('button', { name: 'Créer le lien et le copier' }));
    expect(await within(feuille).findByText('Choisissez un mot de passe, ou désactivez la protection.')).toBeInTheDocument();

    await user.type(within(feuille).getByLabelText('Mot de passe'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Créer le lien et le copier' }));
    expect(await within(feuille).findByText('Le mot de passe doit compter au moins 4 caractères.')).toBeInTheDocument();
    expect(creer).not.toHaveBeenCalled();
  });

  it('presse-papiers refusé : « Lien créé », jamais « Lien copié », et « Copier le lien » reste offert', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('refusé'));
    render(withIntl(<Banc />));
    await ouvrirEtRemplir(user, null);
    await user.click(screen.getByRole('button', { name: 'Créer le lien et le copier' }));

    expect(await screen.findByText('Lien créé')).toBeInTheDocument();
    expect(screen.queryByText('Lien copié')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copier le lien' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Adresse du lien' })).toHaveValue(`${window.location.origin}/share/jeton-9`);
  });

  it('WhatsApp envoie le lien, jamais le mot de passe', async () => {
    const user = userEvent.setup();
    render(withIntl(<Banc />));
    await ouvrirEtRemplir(user, 'Sacre-Coeur');
    await user.click(screen.getByRole('button', { name: 'Créer le lien et le copier' }));

    const whatsapp = await screen.findByRole('link', { name: 'Envoyer par WhatsApp' });
    const texte = decodeURIComponent(new URL(whatsapp.getAttribute('href')!).searchParams.get('text') ?? '');
    expect(texte).toContain(`${window.location.origin}/share/jeton-9`);
    expect(texte).toContain('Carte d’identité');
    expect(texte).not.toContain('Sacre-Coeur');
  });

  it('« Révoquer ce lien » le révoque, referme la feuille et le retire de la liste', async () => {
    const user = userEvent.setup();
    render(withIntl(<Banc />));
    await ouvrirEtRemplir(user, null);
    await user.click(screen.getByRole('button', { name: 'Créer le lien et le copier' }));
    await user.click(await screen.findByRole('button', { name: 'Révoquer ce lien' }));

    await waitFor(() => expect(revoquer).toHaveBeenCalledWith({ document_id: 4, link_id: 9 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByTestId('lien-actif')).toHaveLength(1);
  });

  it('un lien lu de l’API dit sa date, son échéance, son mot de passe et ses usages', () => {
    render(withIntl(<Banc />));
    const [ligne] = screen.getAllByTestId('lien-actif');
    expect(ligne).toHaveTextContent('Créé le 5 nov.');
    expect(ligne).toHaveTextContent('Expire dans 2 jours · mot de passe');
    expect(ligne).toHaveTextContent('1 téléchargement sur 3');
    expect(etat.appels[0]).toEqual([4]);
  });

  it('« − » depuis 1 donne « Sans limite », et aucun plafond ne part', async () => {
    const user = userEvent.setup();
    render(withIntl(<Banc />));
    await ouvrirEtRemplir(user, null);
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Moins' }));
    expect(screen.getByTestId('plafond')).toHaveTextContent('Sans limite');
    await user.click(screen.getByRole('button', { name: 'Créer le lien et le copier' }));
    await waitFor(() => expect(creer).toHaveBeenCalledTimes(1));
    expect(creer.mock.calls[0][0]).not.toHaveProperty('max_downloads');
    expect(creer.mock.calls[0][0]).not.toHaveProperty('password');
  });

  it('au bureau, la carte flottante s’ouvre sous « Partager » et « Annuler » la referme', async () => {
    const user = userEvent.setup();
    render(withIntl(<Banc bureau />));
    await user.click(screen.getByRole('button', { name: 'Partager' }));
    expect(await screen.findByText('Partager par lien')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByText('Partager par lien')).not.toBeInTheDocument());
  });
});
