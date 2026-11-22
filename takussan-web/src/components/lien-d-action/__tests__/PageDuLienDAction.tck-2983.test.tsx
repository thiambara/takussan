import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/fr/fil/a/jeton',
}));
// Le canevas n'existe pas sous jsdom : le tracé est doublé par un bouton qui rend une signature.
vi.mock('@/components/inventory/SignaturePad', () => ({
  SignaturePad: ({ onConfirm, disabled, confirmLabel }: { onConfirm: (s: string) => void; disabled?: boolean; confirmLabel?: string }) => (
    <button type="button" disabled={disabled} onClick={() => onConfirm('data:image/png;base64,AAAA')}>
      {confirmLabel}
    </button>
  ),
}));

import { withIntl } from '@/test/intl';
import { PageDuLienDAction } from '../PageDuLienDAction';

/**
 * TCK-2983 (ADR-0132 § 5) — la page du lien d'action, chaque état rendu depuis une réponse de test :
 * le geste (visite, intervention, signature par code), fait, expiré, utilisé, révoqué, introuvable, trop
 * de tentatives, refus de l'objet. Un lien mort ne dit RIEN de l'objet, même si la réponse en glisse un.
 */
const JETON = 'A'.repeat(43);

function reponse(status: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

let appels: { url: string; method: string; body: string | null; init?: RequestInit }[] = [];
let resoudre: ((r: Response) => void) | null = null;

/** Chaque appel prend la réponse suivante ; `'attente'` laisse la requête pendante jusqu'à `relacher`. */
function bouchonner(...reponses: (Response | 'attente')[]) {
  const file = [...reponses];
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url: String(url), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null, init });
      const suivante = file.shift();
      if (!suivante) throw new Error(`requête inattendue : ${String(url)}`);
      if (suivante === 'attente') return new Promise<Response>((r) => (resoudre = r));
      return suivante;
    }),
  );
}

// La projection de `GestesParLien::projection` (TCK-2982), telle que l'API la rend.
const OBJET = { title: 'Fuite sous l’évier', property_title: 'F3 Sacré-Cœur', quarter: 'Sacré-Cœur 3', city: 'Dakar', scheduled_at: '2026-11-26T10:00:00Z' };
const lien = (gesture: string, object: Record<string, unknown> = OBJET) => ({ data: { gesture, state: 'open', object } });
const texte = () => (document.body.textContent ?? '').replace(/[\s  ]+/g, ' ');

afterEach(() => {
  vi.unstubAllGlobals();
  resoudre = null;
});

describe('<PageDuLienDAction> (TCK-2983)', () => {
  it('confirmer une visite : la lecture part sans session, le récapitulatif ne montre que la réponse, puis « C’est fait »', async () => {
    bouchonner(reponse(200, lien('property_visit.confirm')), reponse(200, { data: { state: 'done', object: { scheduled_at: OBJET.scheduled_at } } }));
    render(withIntl(<PageDuLienDAction jeton={JETON} />));
    await screen.findByText('Confirmez-vous cette visite ?');
    expect(appels[0].url).toMatch(new RegExp(`/api/a/${JETON}$`));
    // Sans session : ni jeton d'API, ni cookie envoyé à une autre origine.
    const enTetes = new Headers(appels[0].init?.headers);
    expect(enTetes.has('Authorization')).toBe(false);
    expect(appels[0].init?.credentials).toBeUndefined();
    expect(texte()).toContain('Sacré-Cœur 3, Dakar');
    expect(texte()).toContain('F3 Sacré-Cœur');
    expect(texte()).toContain('Fuite sous l’évier');
    expect(screen.queryByText('Adresse')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la visite' }));
    await screen.findByText('C’est fait');
    expect(appels[1]).toMatchObject({ method: 'POST', body: '{}' });
    expect(texte()).toContain('La visite est confirmée');
    expect(screen.getByRole('link', { name: 'Créer mon mot de passe' }).getAttribute('href')).toBe('/auth/forgot-password');
  });

  it('le geste est désactivé pendant l’envoi, et deux clics du même instant n’envoient qu’une requête', async () => {
    bouchonner(reponse(200, lien('property_visit.confirm')), 'attente');
    render(withIntl(<PageDuLienDAction jeton={JETON} />));
    const bouton = await screen.findByRole('button', { name: 'Confirmer la visite' });
    act(() => {
      bouton.click();
      bouton.click();
    });
    await waitFor(() => expect(bouton).toBeDisabled());
    expect(appels.filter((a) => a.method === 'POST')).toHaveLength(1);
    await act(async () => resoudre?.(reponse(200, { data: { state: 'done', object: {} } })));
    await screen.findByText('C’est fait');
  });

  it('accepter une intervention : le créneau part avec le geste ; après, l’adresse et le contact sur place que la réponse rend', async () => {
    bouchonner(
      reponse(200, lien('maintenance_request.accept', { title: 'Fuite sous l’évier', category: 'plumbing', priority: 'high', quarter: 'Sacré-Cœur 3', city: 'Dakar' })),
      // Après le geste : la ressource de l'objet, dont le bloc `access` qu'ADR-0122 ouvre au prestataire.
      reponse(200, { data: { state: 'done', object: { title: 'Fuite sous l’évier', access: { street: 'Immeuble Les Filaos, 2ᵉ étage', quarter: 'Sacré-Cœur 3', city: 'Dakar', requester_phone: '+221770000000', instructions: 'Demander M. Niang' } } } }),
    );
    render(withIntl(<PageDuLienDAction jeton={JETON} />));
    await screen.findByText('Acceptez-vous cette intervention ?');
    expect(texte()).toContain('L’adresse exacte et la personne à demander sur place s’affichent une fois l’intervention acceptée.');
    fireEvent.click(screen.getByRole('button', { name: 'Accepter l’intervention' }));
    await screen.findByText('C’est fait');
    // La projection ne porte pas de créneau pour une intervention : le geste part sans paramètre.
    expect(JSON.parse(appels[1].body ?? '')).toEqual({});
    expect(texte()).toContain('Immeuble Les Filaos, 2ᵉ étage, Sacré-Cœur 3, Dakar');
    expect(texte()).toContain('Demander M. Niang');
    expect(texte()).toContain('+221770000000');
  });

  it('signer par code : le code se demande, le tracé reste fermé sans 6 chiffres, puis signature et code partent ensemble', async () => {
    bouchonner(reponse(200, lien('inventory.sign', { type: 'entry', property_title: 'F3 Sacré-Cœur', quarter: 'Sacré-Cœur 3', city: 'Dakar' })), reponse(200, { data: { channel: 'sms', destination: '+221 77 ••• •• 00' } }), reponse(200, { data: { state: 'done', object: {} } }));
    render(withIntl(<PageDuLienDAction jeton={JETON} />));
    await screen.findByText('Signez l’état des lieux');
    expect(screen.getByRole('button', { name: 'Signer l’état des lieux' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir mon code' }));
    const code = await screen.findByTestId('code-de-signature');
    expect(appels[1]).toMatchObject({ method: 'POST' });
    expect(appels[1].url).toMatch(new RegExp(`/api/a/${JETON}/code$`));
    fireEvent.change(code, { target: { value: '48a1 92 7' } });
    expect((code as HTMLInputElement).value).toBe('481927');
    fireEvent.click(screen.getByRole('button', { name: 'Signer l’état des lieux' }));
    await screen.findByText('C’est fait');
    expect(JSON.parse(appels[2].body ?? '')).toEqual({ signature: 'data:image/png;base64,AAAA', code: '481927' });
  });

  it('un refus de l’objet (machine d’état) s’affiche par son message, et le geste reste possible', async () => {
    bouchonner(reponse(200, lien('property_visit.confirm')), reponse(422, { message: 'Cette visite ne peut plus être confirmée.', code: 'visit.not_confirmable' }));
    render(withIntl(<PageDuLienDAction jeton={JETON} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la visite' }));
    const refus = await screen.findByTestId('refus-du-geste');
    expect(refus.textContent).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmer la visite' })).not.toBeDisabled();
  });

  const MORTS = [
    ['action_link.expired', 'expired', 'Ce lien a expiré', 'Demandez un nouveau lien en répondant à l’agence sur WhatsApp.'],
    ['action_link.used', 'used', 'Ce lien a déjà servi', 'Si ce n’était pas vous, prévenez l’agence.'],
    ['action_link.revoked', 'revoked', 'Ce lien n’est plus valable', null],
  ] as const;
  for (const [code, cause, titre, phrase] of MORTS) {
    it(`410 ${code} : « ${titre} », et rien de l’objet même si la réponse en glisse un (AC2)`, async () => {
      bouchonner(reponse(410, { code, object: OBJET, data: lien('property_visit.confirm').data }));
      render(withIntl(<PageDuLienDAction jeton={JETON} />));
      await screen.findByTestId(`lien-mort-${cause}`);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(titre);
      if (phrase) expect(texte()).toContain(phrase);
      for (const fuite of ['Sacré-Cœur', 'Fuite sous', 'Dakar', '2026', '26 nov']) expect(texte()).not.toContain(fuite);
      expect(screen.queryByRole('button', { name: /Recevoir un nouveau lien|Ce n’était pas moi/ })).toBeNull();
    });
  }

  it('un geste refusé parce que le lien a servi entre-temps (410) mène à « déjà servi »', async () => {
    bouchonner(reponse(200, lien('property_visit.confirm')), reponse(410, { code: 'action_link.used' }));
    render(withIntl(<PageDuLienDAction jeton={JETON} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la visite' }));
    await screen.findByTestId('lien-mort-used');
    expect(texte()).not.toContain('Sacré-Cœur');
  });

  it('404 : introuvable ; 429 : trop de tentatives, puis « Réessayer » relit le lien', async () => {
    bouchonner(reponse(404, { message: 'Not found' }));
    const { unmount } = render(withIntl(<PageDuLienDAction jeton={JETON} />));
    await screen.findByTestId('lien-mort-notFound');
    unmount();

    bouchonner(reponse(429, { message: 'Too Many Attempts.' }), reponse(200, lien('property_visit.confirm')));
    render(withIntl(<PageDuLienDAction jeton={JETON} />));
    await screen.findByTestId('lien-trop-de-tentatives');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByText('Confirmez-vous cette visite ?');
  });
});

describe('<PageDuLienDAction> — refus nommés par la page (TCK-2983, contrat TCK-2982)', () => {
  it('un code faux (422 action_link.code_invalid) se dit en texte du front ; le geste reste possible', async () => {
    bouchonner(
      reponse(200, lien('inventory.sign', { type: 'entry', property_title: 'F3', quarter: 'Sacré-Cœur 3', city: 'Dakar' })),
      reponse(200, { data: { channel: 'sms', destination: '+221 77 ••• •• 88' } }),
      reponse(422, { code: 'action_link.code_invalid', message: 'server text' }),
    );
    render(withIntl(<PageDuLienDAction jeton={JETON} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Recevoir mon code' }));
    fireEvent.change(await screen.findByTestId('code-de-signature'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Signer l’état des lieux' }));
    const refus = await screen.findByTestId('refus-du-geste');
    expect(refus.textContent).toBe('Ce code n’est pas le bon. Vérifiez-le, puis réessayez.');
    expect(screen.getByRole('button', { name: 'Signer l’état des lieux' })).not.toBeDisabled();
  });

  it('un renvoi trop tôt (429 action_link.resend_too_soon) se dit sous le bouton du code', async () => {
    bouchonner(reponse(200, lien('inventory.sign', { type: 'entry' })), reponse(429, { code: 'action_link.resend_too_soon', message: 'server text' }));
    render(withIntl(<PageDuLienDAction jeton={JETON} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Recevoir mon code' }));
    expect(await screen.findByText('Un code vient de partir. Patientez un peu avant d’en demander un autre.')).toBeInTheDocument();
  });
});
