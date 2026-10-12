'use server';

import { getTranslations } from 'next-intl/server';

import { apiRequest, messageErreurApi } from '@/lib/api';
import { codeApercu } from '@/lib/otp-preview';
import { getToken } from '@/lib/session';
import type { User } from '@/types/user';

/** TCK-633 (lot C) — le second numéro : code, vérification, retrait (`/api/auth/secondary-phone/*`). */
type Echec = { ok: false; message: string };

async function echec(err: unknown): Promise<Echec> {
  const repli = (await getTranslations('serverActions.security'))('sendOtpFailed');
  return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
}

async function jeton(): Promise<string | Echec> {
  const token = await getToken();
  return token ?? { ok: false, message: (await getTranslations('errors'))('missingToken') };
}

export async function secondaryPhoneSendOtpAction(
  phone: string,
): Promise<{ ok: true; codeApercu: string | null } | Echec> {
  const token = await jeton();
  if (typeof token !== 'string') return token;
  try {
    const res = await apiRequest<{ data: { sent: boolean } }>('/api/auth/secondary-phone/send-otp', {
      method: 'POST',
      token,
      body: { phone },
    });
    return { ok: true, codeApercu: codeApercu(res) };
  } catch (err) {
    return echec(err);
  }
}

export async function secondaryPhoneVerifyAction(
  phone: string,
  code: string,
  whatsapp: boolean,
): Promise<{ ok: true; user: User } | Echec> {
  const token = await jeton();
  if (typeof token !== 'string') return token;
  try {
    const user = await apiRequest<User>('/api/auth/secondary-phone/verify', {
      method: 'POST',
      token,
      body: { phone, code, whatsapp },
    });
    return { ok: true, user };
  } catch (err) {
    return echec(err);
  }
}

export async function secondaryPhoneRemoveAction(): Promise<{ ok: true; user: User } | Echec> {
  const token = await jeton();
  if (typeof token !== 'string') return token;
  try {
    const user = await apiRequest<User>('/api/auth/secondary-phone', { method: 'DELETE', token });
    return { ok: true, user };
  } catch (err) {
    return echec(err);
  }
}
