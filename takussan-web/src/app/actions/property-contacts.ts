'use server';

import { getTranslations } from 'next-intl/server';

import { apiRequest, messageErreurApi } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import type { ContactSurPlace } from '@/components/contact/ContactsSurPlace';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

/** TCK-633 (lot C) — remplace les contacts sur place d'un bien (`PUT /api/properties/{id}/contacts`). */
export async function replacePropertyContactsAction(
  propertyId: number,
  contacts: readonly ContactSurPlace[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = await getToken();
  if (!token) return { ok: false, message: (await getTranslations('errors'))('missingToken') };
  try {
    await apiRequest(cheminApi`/api/properties/${propertyId}/contacts`, {
      method: 'PUT',
      token,
      body: {
        contacts: contacts.map((c) => ({
          label: c.label.trim() || null,
          phone: c.phone,
          has_whatsapp: c.has_whatsapp,
        })),
      },
    });
    return { ok: true };
  } catch (err) {
    journaliserErreurInattendue('property-contacts', err);
    const repli = (await getTranslations('property.form.publishContact'))('failed');
    return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
  }
}
