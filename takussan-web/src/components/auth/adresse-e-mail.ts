/**
 * TCK-2606 — deux lectures d'une adresse e-mail pour les écrans « Lien envoyé » et « Vérifier
 * l'adresse ».
 */

/**
 * « a•••@gmail.com » : l'écran de l'oubli n'a pas de session, il ne confirme rien de l'adresse
 * tapée — ni qu'elle a un compte, ni son orthographe complète à qui regarde l'écran. La première
 * lettre et le domaine suffisent à reconnaître la sienne.
 */
export function adresseMasquee(adresse: string): string {
  const arobase = adresse.lastIndexOf('@');
  if (arobase < 1) return '•••';
  return `${adresse[0]}•••${adresse.slice(arobase)}`;
}

/** Les domaines servis par Gmail : « Ouvrir Gmail » n'a de sens que pour eux. */
const DOMAINES_GMAIL = new Set(['gmail.com', 'googlemail.com']);

export function estUneAdresseGmail(adresse: string): boolean {
  const arobase = adresse.lastIndexOf('@');
  return arobase > 0 && DOMAINES_GMAIL.has(adresse.slice(arobase + 1).trim().toLowerCase());
}

/** La boîte de réception de Gmail, sur le web comme dans l'application (lien universel). */
export const LIEN_GMAIL = 'https://mail.google.com/mail/u/0/#inbox';
