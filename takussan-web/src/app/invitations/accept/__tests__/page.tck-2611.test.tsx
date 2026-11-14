import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2611 (ADR-0094) — la page LIT l'invitation avant de rien demander, et choisit son écran : un lien
 * fermé (expiré, annulé, accepté), inconnu, incomplet ou illisible a le sien, sans formulaire ; seule
 * une invitation valide monte l'entrée. Et le jeton ne part dans aucun `Referer`.
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

let session: string | null = null;
vi.mock('@/lib/session', () => ({ getToken: async () => session }));
const lireInvitation = vi.fn();
vi.mock('@/lib/invitation-apercu', () => ({ lireInvitation: (...a: unknown[]) => lireInvitation(...a) }));
const lireNomsPreremplis = vi.fn();
vi.mock('@/lib/invitation-prerempli', () => ({ lireNomsPreremplis: (...a: unknown[]) => lireNomsPreremplis(...a) }));

import fr from '@/messages/fr.json';
import nextConfig from '../../../../../next.config';
import { EcranFerme } from '../EcranFerme';
import { EntreeDInvitation } from '../EntreeDInvitation';
import Page, { generateMetadata } from '../page';

async function ecranDe(token?: string): Promise<ReactElement<Record<string, unknown>>> {
  const coque = (await Page({ searchParams: Promise.resolve(token === undefined ? {} : { token }) })) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;
  return coque.props.children;
}

beforeEach(() => {
  vi.clearAllMocks();
  session = null;
});

describe('/invitations/accept — l’écran suit l’état du jeton', () => {
  it('sans jeton : « lien incomplet », sans aucune lecture', async () => {
    const ecran = await ecranDe();
    expect(ecran.type).toBe(EcranFerme);
    expect(ecran.props.etat).toBe('incomplet');
    expect(lireInvitation).not.toHaveBeenCalled();
  });

  it('jeton expiré : l’écran fermé, avec l’agence et la date — jamais l’entrée', async () => {
    const fermee = { etat: 'expiree', agence: { nom: 'Dakar Immo', logo: null, telephone: null }, inviteeLe: '2026-11-03T09:00:00+00:00' };
    lireInvitation.mockResolvedValue({ issue: 'fermee', fermee });

    const ecran = await ecranDe('jeton-abc');

    expect(lireInvitation).toHaveBeenCalledWith('jeton-abc');
    expect(ecran.type).toBe(EcranFerme);
    expect(ecran.props).toMatchObject({ etat: 'expiree', fermee, jeton: 'jeton-abc' });
  });

  it.each(['inconnue', 'indisponible'] as const)('%s : son écran, sans jeton transmis', async (issue) => {
    lireInvitation.mockResolvedValue({ issue });
    const ecran = await ecranDe('jeton-abc');
    expect(ecran.type).toBe(EcranFerme);
    expect(ecran.props.etat).toBe(issue);
    expect(ecran.props.jeton).toBeUndefined();
  });

  it('valide et déconnecté : l’entrée, sans lecture du prérempli de session', async () => {
    const apercu = { role: 'owner' };
    lireInvitation.mockResolvedValue({ issue: 'valide', apercu });

    const ecran = await ecranDe('jeton-abc');

    expect(ecran.type).toBe(EntreeDInvitation);
    expect(ecran.props).toMatchObject({ jeton: 'jeton-abc', connecte: false, apercu, prerempliDuCompte: null });
    expect(lireNomsPreremplis).not.toHaveBeenCalled();
  });

  it('valide et connecté sans nom : le nom de l’invitation à confirmer (TCK-2281)', async () => {
    session = 'session';
    lireInvitation.mockResolvedValue({ issue: 'valide', apercu: { role: 'agent' } });
    lireNomsPreremplis.mockResolvedValue({ prenom: 'Awa', nom: 'Sarr' });

    const ecran = await ecranDe('jeton-abc');

    expect(lireNomsPreremplis).toHaveBeenCalledWith('jeton-abc', 'session');
    expect(ecran.props).toMatchObject({ connecte: true, prerempliDuCompte: { prenom: 'Awa', nom: 'Sarr' } });
  });
});

describe('/invitations/accept — le jeton ne part dans aucun Referer (ADR-0094 § 3)', () => {
  it('la balise : referrer no-referrer, et le titre de l’onglet', async () => {
    const meta = await generateMetadata();
    expect(meta.referrer).toBe('no-referrer');
    expect(meta.title).toBe(fr.invitationAccept.metaTitle);
  });

  it('l’en-tête couvre tout le chemin /invitations', async () => {
    const regles = (await nextConfig.headers?.()) ?? [];
    const regle = regles.find((r) => r.source === '/invitations/:path*');
    expect(regle?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
  });

  it('la connexion qui emporte le jeton en redirect pose aussi no-referrer — et pas les autres', async () => {
    const regles = (await nextConfig.headers?.()) ?? [];
    const regle = regles.find((r) => r.source === '/auth/:path*');
    const condition = regle?.has?.find((h) => h.type === 'query' && h.key === 'redirect');
    const motif = new RegExp(`^${condition && 'value' in condition ? condition.value : '(?!)'}$`);
    expect(motif.test('/invitations/accept?token=abc')).toBe(true);
    expect(motif.test('/fr/claim/12.1700000000.abc')).toBe(true);
    expect(motif.test('/app/invitations')).toBe(false);
    expect(motif.test('/fr/properties')).toBe(false);
  });
});
