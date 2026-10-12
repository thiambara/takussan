'use server';

import { getTranslations } from 'next-intl/server';

import { apiRequest, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import type { User } from '@/types/user';

/**
 * TCK-633 (lot C) — prénom, nom et cases WhatsApp, par `PUT /api/auth/profile` en JSON.
 * Une action à part de `updateProfileAction` (FormData, `lib/auth.ts` hors territoire) : elle
 * n'envoie QUE ce qu'on lui donne, donc ne touche ni au numéro ni à l'adresse.
 */
export type PreferencesDeContact = {
  first_name?: string;
  last_name?: string;
  phone_whatsapp?: boolean;
  secondary_phone_whatsapp?: boolean;
};

export type ResultatPreferences = { ok: true; user: User } | { ok: false; message: string };

export async function updateContactPreferencesAction(
  payload: PreferencesDeContact,
): Promise<ResultatPreferences> {
  const token = await getToken();
  if (!token) return { ok: false, message: (await getTranslations('errors'))('missingToken') };
  try {
    const user = await apiRequest<User>('/api/auth/profile', { method: 'PUT', token, body: payload });
    return { ok: true, user };
  } catch (err) {
    const repli = (await getTranslations('profile.contact'))('saveError');
    return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
  }
}
