/**
 * TCK-590 — le nom et le téléphone d'un visiteur sans compte sont retenus SUR CET APPAREIL, pour
 * qu'il n'ait pas à les retaper au contact suivant. Rien d'autre (ni e-mail, ni message), et
 * jamais côté serveur.
 *
 * `localStorage` peut lever ou être vide : chaque accès est gardé.
 */
const CLE = 'takussan.coordonnees';

export interface CoordonneesRetenues {
  readonly name: string;
  readonly phone: string;
}

export function lireCoordonnees(): CoordonneesRetenues {
  try {
    const brut = window.localStorage.getItem(CLE);
    if (!brut) return { name: '', phone: '' };
    const lu = JSON.parse(brut) as { name?: unknown; phone?: unknown };
    return {
      name: typeof lu.name === 'string' ? lu.name : '',
      phone: typeof lu.phone === 'string' ? lu.phone : '',
    };
  } catch {
    return { name: '', phone: '' };
  }
}

export function retenirCoordonnees(coordonnees: CoordonneesRetenues): void {
  try {
    window.localStorage.setItem(CLE, JSON.stringify({ name: coordonnees.name, phone: coordonnees.phone }));
  } catch {
    // Stockage indisponible : le visiteur retapera, rien de plus.
  }
}
