/**
 * TCK-591 — joindre un client : le numéro enregistré est normalisé en E.164 par l'API
 * (`CustomerPhoneNormalizer`). Un numéro qui ne l'est pas (saisie historique non normalisable) ne
 * produit ni `tel:` ni lien WhatsApp : on dit pourquoi au lieu d'ouvrir un appel voué à l'échec.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export function isReachable(phone: string | null | undefined): phone is string {
  return typeof phone === 'string' && E164.test(phone);
}

export function telHref(phone: string): string {
  return `tel:${phone}`;
}

/** `wa.me` attend les seuls chiffres, indicatif compris, sans `+`. */
export function whatsappHref(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
