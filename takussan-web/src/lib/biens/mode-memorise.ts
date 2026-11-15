import { cookies } from 'next/headers';

import { COOKIE_MODE_BIENS } from './mode-de-liste';

/**
 * TCK-2638 — le mode de la liste des biens mémorisé sur CET appareil (cookie non `httpOnly`, écrit
 * par le sélecteur). Lu par la page serveur, qui rend le bon mode au premier octet ; la valeur brute
 * passe par `resoudreMode`, qui ignore ce qu'elle ne connaît pas.
 */
export async function modeMemoriseDesBiens(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_MODE_BIENS)?.value;
}
