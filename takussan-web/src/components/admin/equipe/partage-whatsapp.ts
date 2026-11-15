import { whatsappHref } from '@/components/crm/contact';

/**
 * TCK-2928 (ADR-0123) — « Par WhatsApp » : l'invitation partagée rend `share_url` UNE fois, dans la
 * réponse de la création (`delivery: "share"`) ou du renouvellement (`POST …/share-link`). Le lien
 * part aussitôt dans `wa.me` et n'est gardé nulle part : ni stockage du navigateur, ni journal, ni
 * état React — il ne vit que le temps de composer l'URL.
 *
 * L'onglet s'ouvre VIDE dans le geste même (le motif de `RelanceDUnImpaye`) : un navigateur
 * qui bloque une fenêtre ouverte après une attente (Safari iOS, ou la double authentification au
 * milieu) la laisse passer ici. Sans `noopener` dans l'appel, qui ferait rendre `null` : l'`opener`
 * est coupé à la main. Onglet bloqué malgré tout : l'onglet courant part vers `wa.me` (au téléphone,
 * l'application s'ouvre et l'on revient sur l'écran ; l'invitation est déjà créée).
 */
export interface OngletWhatsApp {
  /** Envoie l'onglet vers l'URL `wa.me` composée. */
  readonly partir: (url: string) => void;
  /** Referme l'onglet ouvert pour rien (saisie refusée, échec réseau). */
  readonly fermer: () => void;
}

export function ouvrirOngletWhatsApp(): OngletWhatsApp {
  const onglet = typeof window === 'undefined' ? null : window.open('', '_blank');
  if (onglet) onglet.opener = null;
  return {
    partir: (url) => {
      if (onglet && !onglet.closed) onglet.location.href = url;
      else window.location.assign(url);
    },
    fermer: () => onglet?.close(),
  };
}

/** `wa.me/<numéro>?text=<message, lien compris>` ; le numéro sans `+` ni espaces. */
export function lienWhatsAppDeLInvitation(telephone: string, message: string): string {
  return whatsappHref(telephone, message);
}
