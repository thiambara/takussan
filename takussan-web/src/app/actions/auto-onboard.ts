'use server';

import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';

import { ApiError, apiRequest, messageErreurApi } from '@/lib/api';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { getToken } from '@/lib/session';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

/**
 * TCK-633 (lot C) — « Publier » sans assistant : `POST /api/host/individual/auto-onboard`.
 * Le serveur arbitre le drapeau `host_auto_space` : `disabled` renvoie à l'assistant actuel.
 * Pose le cookie du profil actif comme `hostIndividualOnboardAction`.
 */
export type ResultatCreationAuto =
  | { ok: true; created: boolean }
  | { ok: false; reason: 'disabled' }
  | { ok: false; reason: 'unauthenticated' }
  | { ok: false; reason: 'failed'; message: string };

type Reponse = { data: { created: boolean; active_profile_id: string } };

export async function autoOnboardAction(primaryCity?: string | null): Promise<ResultatCreationAuto> {
  const token = await getToken();
  if (!token) return { ok: false, reason: 'unauthenticated' };

  const ville = typeof primaryCity === 'string' ? primaryCity.trim().slice(0, 120) : '';
  try {
    const res = await apiRequest<Reponse>('/api/host/individual/auto-onboard', {
      method: 'POST',
      token,
      body: ville ? { primary_city: ville } : {},
    });
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_PROFILE_COOKIE, res.data.active_profile_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true, created: res.data.created };
  } catch (err) {
    journaliserErreurInattendue('auto-onboard', err);
    const code = err instanceof ApiError ? (err.data as { code?: unknown } | null)?.code : undefined;
    if (err instanceof ApiError && err.status === 403 && code === 'onboarding.auto_space_disabled') {
      return { ok: false, reason: 'disabled' };
    }
    if (err instanceof ApiError && err.status === 401) return { ok: false, reason: 'unauthenticated' };
    // Un échec qui n'est ni le drapeau ni la session se DIT, localisé comme les actions voisines.
    const repli = (await getTranslations('publishRedirect.auto'))('error');
    return { ok: false, reason: 'failed', message: messageErreurApi(err, await getTranslations(), repli) };
  }
}
