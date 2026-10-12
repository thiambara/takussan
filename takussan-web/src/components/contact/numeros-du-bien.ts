import { apiFetch } from '@/lib/api';

/**
 * TCK-633 (lot C) — la réponse de `GET /public/properties/{slug}/contact` : les numéros du bien,
 * principal, second, puis sur place. Révélée au geste, sous limiteur.
 */
export type GenreDeNumero = 'primary' | 'secondary' | 'on_site';

export interface NumeroDeContact {
  readonly phone: string;
  readonly whatsapp: boolean;
  readonly label: string | null;
  readonly kind: GenreDeNumero;
}

export async function numerosDuBien(slug: string): Promise<NumeroDeContact[]> {
  const res = await apiFetch<{ data?: NumeroDeContact[] } | undefined>(`/public/properties/${slug}/contact`);
  return Array.isArray(res?.data) ? res.data : [];
}

/** Le premier numéro DÉCLARÉ WhatsApp, ou `null` : le bouton ne vise jamais un autre. */
export function premierNumeroWhatsApp(numeros: readonly NumeroDeContact[]): NumeroDeContact | null {
  return numeros.find((n) => n.whatsapp) ?? null;
}
