/**
 * TCK-590 — d'où vient le visiteur qui écrit.
 *
 * Le lien partagé porte `utm_source=<canal>&utm_medium=share`. La source est RETENUE pour la
 * session dès l'arrivée, puis envoyée avec la demande de contact, le clic WhatsApp / Appeler et
 * la demande de visite — sans quoi elle se perdait au premier clic vers un autre bien.
 *
 * La forme est celle que l'API accepte (`[a-z0-9_.-]`, 40 caractères) : une valeur hors forme est
 * écartée ici plutôt que de faire échouer l'envoi du visiteur sur un 422.
 *
 * `sessionStorage` peut lever (navigation privée, stockage bloqué) : chaque accès est gardé, et
 * l'absence de stockage rend simplement une attribution vide.
 */
const CLE = 'takussan.arrivee';
const FORME = /^[a-z0-9_.-]{1,40}$/;

export interface Attribution {
  readonly source?: string;
  readonly medium?: string;
}

function propre(valeur: string | null): string | undefined {
  const v = valeur?.trim().toLowerCase();
  return v && FORME.test(v) ? v : undefined;
}

/** Lit `utm_source` / `utm_medium` d'une adresse d'arrivée et les retient pour la session. */
export function retenirArrivee(recherche: string): void {
  const params = new URLSearchParams(recherche);
  const source = propre(params.get('utm_source'));
  if (!source) return;
  const attribution: Attribution = { source, medium: propre(params.get('utm_medium')) };
  try {
    window.sessionStorage.setItem(CLE, JSON.stringify(attribution));
  } catch {
    // Stockage indisponible : la source ne survivra pas à la page, rien de plus.
  }
}

/** La source retenue pour la session, ou `{}`. */
export function arrivee(): Attribution {
  try {
    const brut = window.sessionStorage.getItem(CLE);
    if (!brut) return {};
    const lu = JSON.parse(brut) as { source?: unknown; medium?: unknown };
    const source = typeof lu.source === 'string' ? propre(lu.source) : undefined;
    if (!source) return {};
    const medium = typeof lu.medium === 'string' ? propre(lu.medium) : undefined;
    return medium ? { source, medium } : { source };
  } catch {
    return {};
  }
}
