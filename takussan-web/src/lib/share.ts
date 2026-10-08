export function buildShareUrls(title: string, url: string) {
  const t = encodeURIComponent(title);
  const u = encodeURIComponent(url);
  return {
    whatsapp: `https://wa.me/?text=${t}%20${u}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    twitter: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    email: `mailto:?subject=${t}&body=${u}`,
  };
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** TCK-590 — les canaux de partage de la fiche. Chacun signe son lien de sa propre source. */
export type CanalDePartage = 'whatsapp' | 'facebook' | 'twitter' | 'email';

/**
 * TCK-590 — l'adresse partagée : la fiche SANS sa requête (un lien reçu par WhatsApp puis
 * repartagé ne doit pas garder la source du premier), signée `utm_source=<canal>&utm_medium=share`.
 * La canonique de la page, elle, ne change pas : ces paramètres ne vivent que dans le lien.
 */
export function urlDePartage(url: string, canal: CanalDePartage): string {
  const base = url.split('#')[0].split('?')[0];
  return `${base}?utm_source=${canal}&utm_medium=share`;
}

/**
 * TCK-590 — les liens de partage, à partir d'un texte DÉJÀ TRADUIT par l'appelant (type · prix ·
 * quartier). `buildShareUrls` n'envoyait que le titre et l'adresse : ni prix, ni type, ni
 * quartier, et aucun moyen de savoir d'où venait le visiteur qui écrivait ensuite.
 */
export function liensDePartage(
  texte: (url: string) => string,
  sujet: string,
  url: string,
): Record<CanalDePartage, string> {
  const lien = (canal: CanalDePartage) => urlDePartage(url, canal);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(texte(lien('whatsapp')))}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(lien('facebook'))}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(texte(lien('twitter')))}`,
    email: `mailto:?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(texte(lien('email')))}`,
  };
}
