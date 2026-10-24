'use server';

import { getTranslations } from 'next-intl/server';

import { apiRequest, messageErreurApi } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import type { ContactSurPlace } from '@/components/contact/ContactsSurPlace';
import { versEditeur, type LigneDeContact } from '@/components/contact/contacts-du-bien';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

/**
 * TCK-633 (lot C) — remplace les contacts sur place d'un bien (`PUT /api/properties/{id}/contacts`).
 *
 * TCK-1777 (P95.04) — rend la liste que l'API a écrite (libellés rognés, `null` rendu vide), à la
 * forme de l'éditeur : c'est elle, et non la liste envoyée, que le cache doit garder.
 */
export async function replacePropertyContactsAction(
  propertyId: number,
  contacts: readonly ContactSurPlace[],
): Promise<{ ok: true; data: ContactSurPlace[] } | { ok: false; message: string }> {
  const token = await getToken();
  if (!token) return { ok: false, message: (await getTranslations('errors'))('missingToken') };
  try {
    const res = await apiRequest<{ data?: LigneDeContact[] }>(cheminApi`/api/properties/${propertyId}/contacts`, {
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
    return { ok: true, data: versEditeur(res?.data) };
  } catch (err) {
    journaliserErreurInattendue('property-contacts', err);
    const repli = (await getTranslations('property.form.publishContact'))('failed');
    return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
  }
}
