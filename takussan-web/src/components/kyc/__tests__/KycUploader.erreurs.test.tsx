import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KycUploader } from '../KycUploader';
import { withIntl, type LocaleDeTest } from '@/test/intl';

/**
 * TCK-292 (AC7) — le chemin 401 du téléversement KYC, de bout en bout.
 *
 * C'est le chemin qui a rendu le défaut visible : une session qui expire pendant un téléversement
 * — un événement ORDINAIRE, pas un bug de programmeur — affichait « Not authenticated. » en
 * bannière ET en toast, dans une interface française. Le corps venait du route handler BFF, qui
 * fabriquait cette prose lui-même.
 */

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

function monte(locale: LocaleDeTest = 'fr') {
  return render(withIntl(
    <KycUploader profileId={1} kind="cni" endpoint="agent-profiles" i18nNamespace="agents.onboarding.kyc" />,
    locale,
  ));
}

async function televerse() {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], 'cni.png', { type: 'image/png' }));
}

function repondre(statut: number, corps: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify(corps),
    { status: statut, headers: { 'Content-Type': 'application/json' } },
  )));
}

describe('KycUploader — 401 pendant un téléversement', () => {
  beforeEach(() => { toastAdd.mockClear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('affiche le libellé FRANÇAIS, en bannière et en toast', async () => {
    repondre(401, { code: 'unauthenticated' });
    monte('fr');
    await televerse();

    const attendu = 'Votre session a expiré. Reconnectez-vous.';
    expect(await screen.findByRole('alert')).toHaveTextContent(attendu);
    await waitFor(() => {
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ description: attendu }));
    });
  });

  it('n\'affiche NI la prose anglaise NI le code brut', async () => {
    repondre(401, { code: 'unauthenticated' });
    monte('fr');
    await televerse();

    const banniere = await screen.findByRole('alert');
    expect(banniere).not.toHaveTextContent(/not authenticated/i);
    expect(banniere).not.toHaveTextContent(/unauthenticated/);
    expect(banniere).not.toHaveTextContent(/API error/i);
    expect(document.body.textContent).not.toMatch(/Not authenticated/i);
  });

  it('rend l\'ANGLAIS sous locale en — ce que la prose du BFF ne savait pas faire', async () => {
    repondre(401, { code: 'unauthenticated' });
    monte('en');
    await televerse();

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Your session has expired. Please sign in again.');
  });

  it('traduit aussi `invalid_profile_id` (400)', async () => {
    repondre(400, { code: 'invalid_profile_id' });
    monte('fr');
    await televerse();

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce profil est introuvable.');
  });

  it('laisse passer la prose de Laravel, qui est déjà localisée', async () => {
    // Le handler proxifie la réponse du backend telle quelle dès qu'il sort de son propre
    // chemin d'erreur : ce message-là est légitime, et il ne doit pas être écrasé par le repli.
    repondre(422, { message: 'Le fichier dépasse la taille autorisée.' });
    monte('fr');
    await televerse();

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Le fichier dépasse la taille autorisée.');
  });

  it('retombe sur le libellé métier quand le corps est illisible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    monte('fr');
    await televerse();

    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur est survenue. Réessayez.');
  });
});
