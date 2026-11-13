import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { KYC_MIME_ACCEPT } from '@/components/kyc/kyc-mime-accept';
import { withIntl } from '@/test/intl';
import { VosPieces } from '../VosPieces';

/**
 * TCK-2614 — « Vos pièces ». La couche RÉSEAU est doublée (`apiRequest` pour la lecture et le NINEA, `fetch` pour le
 * relais d'envoi), pas les hooks : les critères se prouvent sur ce que l'API sert et sur les requêtes envoyées.
 */
type Piece = { code: string; required: boolean; kind: string; state: string; file?: unknown; number_masked?: string | null };

const reseau = vi.hoisted(() => ({
  profil: 'owner:3' as string | null,
  pieces: [] as Piece[],
  appels: [] as { path: string; method: string; body?: unknown }[],
  envois: [] as { url: string; kind: string; nom: string }[],
  /** Ce que la lecture suivante rendra, après un envoi ou un NINEA (l'API a écrit). */
  apres: null as Piece[] | null,
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', activeProfileId: reseau.profil, user: { id: 5 } }) }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: undefined }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string, options: { method?: string; body?: unknown } = {}) => {
      const method = options.method ?? 'GET';
      reseau.appels.push({ path, method, body: options.body });
      if (method === 'GET' && path === '/api/me/pieces') return { data: reseau.pieces };
      if (method === 'PATCH' && /^\/api\/me\/owner-profiles\/\d+\/tax-id$/.test(path)) {
        if (reseau.apres) reseau.pieces = reseau.apres;
        return { data: { id: 3, tax_id_masked: '•••• 67G2' } };
      }
      throw new Error(`requête inattendue : ${method} ${path}`);
    }),
  };
});

const fetchReel = globalThis.fetch;
const { createObjectURL: creeReel, revokeObjectURL: rendReel } = URL;
beforeEach(() => {
  reseau.profil = 'owner:3';
  reseau.pieces = [];
  reseau.appels = [];
  reseau.envois = [];
  reseau.apres = null;
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const corps = init?.body as FormData;
    const fichier = corps.get('file') as File;
    reseau.envois.push({ url: String(url), kind: String(corps.get('kind')), nom: fichier.name });
    if (reseau.apres) reseau.pieces = reseau.apres;
    return new Response(JSON.stringify({ data: { id: 1, file_name: fichier.name } }), { status: 201 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = fetchReel;
  Object.assign(URL, { createObjectURL: creeReel, revokeObjectURL: rendReel });
});

const piece = (code: string, state = 'missing', extra: Partial<Piece> = {}): Piece => ({
  code,
  required: true,
  kind: code === 'ninea' ? 'file_and_number' : 'file',
  state,
  file: null,
  ...(code === 'ninea' ? { number_masked: null } : {}),
  ...extra,
});

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<VosPieces />}</QueryClientProvider>));
}

/** Les cartes du téléphone (le tableau du bureau porte les mêmes pièces, caché sous `lg` par CSS). */
async function carte(code: string): Promise<HTMLElement> {
  const selecteur = `section[data-slot="piece"][data-piece="${code}"]`;
  await waitFor(() => expect(document.querySelectorAll(selecteur)).toHaveLength(1));
  return document.querySelector<HTMLElement>(selecteur)!;
}

const envoyer = () => fireEvent.click(screen.getAllByRole('button', { name: 'Envoyer mes pièces' })[0]!);

describe('« Vos pièces » — TCK-2614', () => {
  it('AC1 — un agent sans pièce : chaque pièce « À fournir », avec ses deux gestes', async () => {
    reseau.profil = 'agent:9';
    reseau.pieces = [piece('license'), piece('cni'), piece('photo')];
    rendre();
    for (const [code, nom] of [
      ['license', 'Carte professionnelle'],
      ['cni', 'Pièce d’identité'],
      ['photo', 'Photo de profil'],
    ] as const) {
      const c = await carte(code);
      expect(within(c).getByRole('heading', { name: nom })).toBeInTheDocument();
      expect(within(c).getByText('À fournir')).toBeInTheDocument();
      expect(within(c).getByText('Prendre une photo')).toBeInTheDocument();
      expect(within(c).getByText('Choisir un fichier')).toBeInTheDocument();
    }
    // « 0 sur 3 » : les requises envoyées sur les requises.
    expect(reseau.appels.filter((a) => a.path === '/api/me/pieces')).toHaveLength(1);
  });

  it('les quatre états se disent en mot : À fournir, Envoyée, Vérifiée, À refaire', async () => {
    reseau.pieces = [piece('cni', 'missing'), piece('rib', 'sent'), piece('ninea', 'verified'), { ...piece('cni', 'rejected'), code: 'license' }];
    rendre();
    expect(within(await carte('cni')).getByText('À fournir')).toBeInTheDocument();
    expect(within(await carte('rib')).getByText('Envoyée')).toBeInTheDocument();
    expect(within(await carte('ninea')).getByText('Vérifiée')).toBeInTheDocument();
    const aRefaire = await carte('license');
    expect(within(aRefaire).getByText('À refaire')).toBeInTheDocument();
    // Une pièce à refaire se redonne : ses deux gestes sont là.
    expect(within(aRefaire).getByText('Prendre une photo')).toBeInTheDocument();
  });

  it('« Prendre une photo » ouvre l’appareil ARRIÈRE ; « Choisir un fichier » non — mêmes formats que l’envoi', async () => {
    reseau.pieces = [piece('cni')];
    rendre();
    const c = await carte('cni');
    const photo = within(c).getByLabelText('Prendre une photo : Pièce d’identité');
    expect(photo).toHaveAttribute('capture', 'environment');
    expect(photo).toHaveAttribute('accept', KYC_MIME_ACCEPT);
    const fichier = within(c).getByLabelText('Choisir un fichier : Pièce d’identité');
    expect(fichier).not.toHaveAttribute('capture');
    expect(fichier).toHaveAttribute('accept', KYC_MIME_ACCEPT);
  });

  it('l’aperçu s’affiche avant l’envoi, avec « Reprendre » ; rien ne part au choix', async () => {
    reseau.pieces = [piece('cni')];
    const cree = vi.fn(() => 'blob:apercu-1');
    const rendu = vi.fn();
    Object.assign(URL, { createObjectURL: cree, revokeObjectURL: rendu });
    rendre();
    const c = await carte('cni');
    fireEvent.change(within(c).getByLabelText('Prendre une photo : Pièce d’identité'), {
      target: { files: [new File(['x'.repeat(2048)], 'cni-recto.jpg', { type: 'image/jpeg' })] },
    });
    expect(within(c).getByText('cni-recto.jpg')).toBeInTheDocument();
    expect(within(c).getByText('2 Ko · prête à envoyer')).toBeInTheDocument();
    expect(within(c).getByRole('img', { name: 'Aperçu de la pièce' })).toHaveAttribute('src', 'blob:apercu-1');
    expect(reseau.envois).toEqual([]);
    fireEvent.click(within(c).getByRole('button', { name: 'Reprendre' }));
    // Reprendre rend l'aperçu au navigateur.
    expect(rendu).toHaveBeenCalledWith('blob:apercu-1');
    expect(within(c).queryByText('cni-recto.jpg')).toBeNull();
    expect(within(c).getByText('Prendre une photo')).toBeInTheDocument();
  });

  it('NINEA mal formé : le message sous le champ, et RIEN n’est envoyé — pas même la pièce prête', async () => {
    reseau.pieces = [piece('cni'), piece('rib'), piece('ninea')];
    rendre();
    fireEvent.change(within(await carte('cni')).getByLabelText('Choisir un fichier : Pièce d’identité'), {
      target: { files: [new File(['x'], 'cni.pdf', { type: 'application/pdf' })] },
    });
    const ninea = await carte('ninea');
    const champ = within(ninea).getByLabelText('Numéro NINEA');
    fireEvent.change(champ, { target: { value: '0123 45' } });
    envoyer();
    const message = await within(ninea).findByRole('alert');
    expect(message).toHaveTextContent('Ce NINEA n’a pas la bonne forme');
    expect(champ).toHaveAttribute('aria-invalid', 'true');
    expect(champ.getAttribute('aria-describedby')).toContain(message.id);
    expect(reseau.envois).toEqual([]);
    expect(reseau.appels.filter((a) => a.method !== 'GET')).toEqual([]);
  });

  it('AC2 — le bailleur tape « 0 123 456 7G2 » et envoie : la ligne NINEA passe à « Envoyée », sans fichier, masquée', async () => {
    reseau.pieces = [piece('cni'), piece('rib'), piece('ninea')];
    reseau.apres = [piece('cni'), piece('rib'), piece('ninea', 'sent', { number_masked: '•••• 67G2' })];
    rendre();
    fireEvent.change(within(await carte('ninea')).getByLabelText('Numéro NINEA'), { target: { value: '0 123 456 7G2' } });
    envoyer();
    await waitFor(() => expect(within(document.querySelector<HTMLElement>('section[data-piece="ninea"]')!).getByText('Envoyée')).toBeInTheDocument());
    // La forme compacte et en majuscules ; aucun fichier ; aucune soumission.
    expect(reseau.appels.filter((a) => a.method !== 'GET')).toEqual([
      { path: '/api/me/owner-profiles/3/tax-id', method: 'PATCH', body: { tax_id: '01234567G2' } },
    ]);
    expect(reseau.envois).toEqual([]);
    const ninea = await carte('ninea');
    expect(within(ninea).getByText('•••• 67G2')).toBeInTheDocument();
    expect(ninea).not.toHaveTextContent('01234567G2');
  });

  it('envoi partiel : la pièce prête part et passe à « Envoyée », les autres restent « À fournir », et l’écran dit ce qui reste — sans aucune soumission', async () => {
    reseau.pieces = [piece('cni'), piece('rib'), piece('ninea')];
    reseau.apres = [
      piece('cni', 'sent', { file: { name: 'cni.pdf', size: 245760, sent_at: new Date().toISOString() } }),
      piece('rib'),
      piece('ninea'),
    ];
    rendre();
    fireEvent.change(within(await carte('cni')).getByLabelText('Choisir un fichier : Pièce d’identité'), {
      target: { files: [new File(['x'], 'cni.pdf', { type: 'application/pdf' })] },
    });
    envoyer();
    await waitFor(() => expect(within(document.querySelector<HTMLElement>('section[data-piece="cni"]')!).getByText('Envoyée')).toBeInTheDocument());
    expect(reseau.envois).toEqual([{ url: '/api/me/owner-profiles/3/kyc/upload', kind: 'cni', nom: 'cni.pdf' }]);
    expect(within(await carte('rib')).getByText('À fournir')).toBeInTheDocument();
    expect(within(await carte('ninea')).getByLabelText('Numéro NINEA')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 pièce envoyée. Reste à fournir : RIB, NINEA.');
    // Le fichier envoyé se relit : nom, taille, jour et heure.
    const cni = await carte('cni');
    expect(within(cni).getByText('cni.pdf')).toBeInTheDocument();
    expect(within(cni).getByText(/^240 Ko · aujourd’hui, \d{2}:\d{2}$/)).toBeInTheDocument();
    // Décision 7a — aucune soumission : ni `kyc/submit` au relais, ni à l’API.
    expect([...reseau.envois.map((e) => e.url), ...reseau.appels.map((a) => a.path)].some((u) => u.includes('submit'))).toBe(false);
    expect(vi.mocked(globalThis.fetch).mock.calls.map(([u]) => String(u))).toEqual(['/api/me/owner-profiles/3/kyc/upload']);
  });

  it('un fichier de plus de 8 Mo (la borne de l’envoi) est refusé au choix, et rien n’est préparé', async () => {
    reseau.pieces = [piece('cni')];
    rendre();
    const c = await carte('cni');
    const lourd = new File(['x'], 'cni.pdf', { type: 'application/pdf' });
    Object.defineProperty(lourd, 'size', { value: 8 * 1024 * 1024 + 1 });
    fireEvent.change(within(c).getByLabelText('Choisir un fichier : Pièce d’identité'), { target: { files: [lourd] } });
    expect(within(c).getByRole('alert')).toHaveTextContent('Ce fichier dépasse 8 Mo.');
    expect(within(c).queryByText('cni.pdf')).toBeNull();
    envoyer();
    expect(await screen.findByText('Choisissez d’abord une pièce à envoyer.')).toBeInTheDocument();
    expect(reseau.envois).toEqual([]);
  });

  it('rien de prêt : « Envoyer mes pièces » le dit, et rien ne part', async () => {
    reseau.pieces = [piece('cni')];
    rendre();
    await carte('cni');
    envoyer();
    expect(await screen.findByText('Choisissez d’abord une pièce à envoyer.')).toBeInTheDocument();
    expect(reseau.envois).toEqual([]);
  });

  it('le NINEA se joint aussi en fichier, par le lien discret', async () => {
    reseau.pieces = [piece('ninea')];
    rendre();
    const ninea = await carte('ninea');
    fireEvent.click(within(ninea).getByRole('button', { name: 'Joindre le fichier' }));
    expect(within(ninea).queryByLabelText('Numéro NINEA')).toBeNull();
    expect(within(ninea).getByLabelText('Choisir un fichier : NINEA')).toBeInTheDocument();
  });

  it('prestataire : l’assurance facultative dit « Facultative » au lieu d’un état, et n’entre pas dans le compte', async () => {
    reseau.profil = 'service_provider:1';
    reseau.pieces = [piece('cni', 'sent'), { ...piece('insurance'), required: false }];
    rendre();
    const assurance = await carte('insurance');
    expect(within(assurance).getByText('Facultative')).toBeInTheDocument();
    expect(within(assurance).queryByText('À fournir')).toBeNull();
    fireEvent.change(within(assurance).getByLabelText('Choisir un fichier : Assurance RC pro'), {
      target: { files: [new File(['x'], 'rc.pdf', { type: 'application/pdf' })] },
    });
    envoyer();
    await waitFor(() => expect(reseau.envois).toEqual([{ url: '/api/me/profiles/1/kyc/upload', kind: 'insurance', nom: 'rc.pdf' }]));
  });

  it('décision 2b — le NINEA d’un particulier (required: false) : « Facultatif · Si vos biens sont en société », hors du compte et du reste à fournir', async () => {
    reseau.pieces = [piece('cni'), piece('rib', 'sent'), { ...piece('ninea'), required: false }];
    rendre();
    const ninea = await carte('ninea');
    expect(within(ninea).getByText('Facultatif')).toBeInTheDocument();
    expect(within(ninea).getByText('Si vos biens sont en société')).toBeInTheDocument();
    expect(within(ninea).queryByText('À fournir')).toBeNull();
    // Le champ reste là : le particulier PEUT le donner.
    expect(within(ninea).getByLabelText('Numéro NINEA')).toBeInTheDocument();
    // Le reste à fournir ne le compte pas (le compte « 1 sur 2 » de l'en-tête : `compteDesPieces`, pieces.tck-2614.test.ts).
    reseau.apres = [piece('cni', 'sent'), piece('rib', 'sent'), { ...piece('ninea'), required: false }];
    fireEvent.change(within(await carte('cni')).getByLabelText('Choisir un fichier : Pièce d’identité'), {
      target: { files: [new File(['x'], 'cni.pdf', { type: 'application/pdf' })] },
    });
    envoyer();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 pièce envoyée.'));
    expect(screen.getByRole('status')).not.toHaveTextContent('NINEA');
  });

  it('décision 2b — le NINEA d’une société (required: true) reste « À fournir », sans la condition', async () => {
    reseau.pieces = [piece('cni'), piece('rib', 'sent'), piece('ninea')];
    rendre();
    const ninea = await carte('ninea');
    expect(within(ninea).getByText('À fournir')).toBeInTheDocument();
    expect(within(ninea).queryByText('Facultatif')).toBeNull();
    expect(within(ninea).queryByText('Si vos biens sont en société')).toBeNull();
  });

  it('une pièce vérifiée ne se remplace pas ; une pièce envoyée, si', async () => {
    reseau.pieces = [piece('cni', 'verified', { file: { name: 'cni.pdf', size: 1024, sent_at: null } }), piece('rib', 'sent', { file: { name: 'rib.pdf', size: 1024, sent_at: null } })];
    rendre();
    expect(within(await carte('cni')).queryByRole('button', { name: 'Remplacer' })).toBeNull();
    fireEvent.click(within(await carte('rib')).getByRole('button', { name: 'Remplacer' }));
    expect(within(await carte('rib')).getByText('Prendre une photo')).toBeInTheDocument();
  });

  it('un profil sans pièces : rien à fournir, ni gestes ni envoi', async () => {
    reseau.profil = 'agency_admin:2';
    reseau.pieces = [];
    rendre();
    expect(await screen.findByText('Aucune pièce à fournir pour cet espace.')).toBeInTheDocument();
    for (const b of screen.getAllByRole('button', { name: 'Envoyer mes pièces' })) expect(b).toBeDisabled();
  });
});
