'use server';

import { getTranslations } from 'next-intl/server';

import { ApiError, apiRequest, messageErreurApi } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

/** TCK-626 — ce que l'acceptation rend d'utile au front (`InvitationResource`). */
export type InvitationAcceptee = {
  readonly role: string;
  readonly invitable_id: number | null;
  readonly email: string | null;
  readonly phone: string | null;
};

export type AccepterInvitationResultat =
  | { ok: true; invitation: InvitationAcceptee }
  /**
   * Un compte existe déjà pour ce contact : il faut se connecter, puis revenir. TCK-2727 — `emailMasque`
   * est l'adresse MASQUÉE que l'API rend (« m•••@gmail.com », le `recipient.masked` de l'aperçu) : elle
   * sert à DIRE à quel compte se connecter, jamais à préremplir le formulaire de connexion.
   */
  | { ok: false; seConnecter: true; emailMasque: string | null; message: string }
  /**
   * TCK-2611 — `changerDeCompte` : 403 `invitation.email_mismatch` / `phone_mismatch`, le compte connecté
   * n'est pas le destinataire (ADR-0094 § 7) ; l'écran propose de changer de compte.
   */
  | { ok: false; seConnecter: false; changerDeCompte?: boolean; message: string };

/**
 * TCK-626 — `POST /api/invitations/{token}/accept`, avec le jeton de session s'il y en a un.
 *
 * L'endpoint est public : le jeton de l'invitation fait la preuve. Connecté, le compte courant est
 * rattaché ; déconnecté, un compte est créé avec ce qu'on envoie (prénom, nom, mot de passe), sauf
 * si le contact en porte déjà un — 401 `requires_login`, que l'on rend comme tel.
 */
export async function accepterInvitationAction(
  jeton: string,
  champs: { first_name?: string; last_name?: string; password?: string } = {},
): Promise<AccepterInvitationResultat> {
  const session = await getToken();
  try {
    const reponse = await apiRequest<{ data: InvitationAcceptee }>(
      cheminApi`/api/invitations/${jeton}/accept`,
      { method: 'POST', body: champs, ...(session ? { token: session } : {}) },
    );
    return { ok: true, invitation: reponse.data };
  } catch (err) {
    journaliserErreurInattendue('invitations', err);
    const [tRacine, t] = await Promise.all([getTranslations(), getTranslations('invitationAccept')]);
    const repli = t('errors.generic');
    if (err instanceof ApiError) {
      // TCK-2727 — `email` est déjà masqué par l'API (`InvitationService::emailMasque`).
      const corps = (err.data ?? {}) as { requires_login?: boolean; email?: string | null };
      if (err.status === 401 && corps.requires_login) {
        return {
          ok: false,
          seConnecter: true,
          emailMasque: corps.email ?? null,
          message: messageErreurApi(err, tRacine, repli),
        };
      }
      const code = (err.data ?? {}) as { code?: unknown };
      if (err.status === 403 && (code.code === 'invitation.email_mismatch' || code.code === 'invitation.phone_mismatch')) {
        return { ok: false, seConnecter: false, changerDeCompte: true, message: t('errors.mauvaisCompte') };
      }
      return { ok: false, seConnecter: false, message: messageErreurApi(err, tRacine, repli) };
    }
    return { ok: false, seConnecter: false, message: repli };
  }
}
