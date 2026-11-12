'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { numeroComposable } from '@/lib/phone';

/**
 * TCK-2588 / TCK-2590 — le doublon sondé PENDANT la saisie : `GET /api/customers/duplicates?phone=&email=`
 * rend jusqu'à cinq fiches de l'agence active au même téléphone normalisé ou au même e-mail replié,
 * réduites à `{id, name, stage}` ; une fiche que l'appelant ne lit pas arrive tout à `null`.
 *
 * La frappe est temporisée (`DELAI_DE_LA_SONDE`) et la sonde ne part que sur une saisie qui peut
 * désigner une fiche (la route est limitée à 20 appels par minute) : un numéro complet, que l'API
 * compare à l'égalité, ou — TCK-2590 — un numéro sénégalais entamé d'au moins sept chiffres
 * (`CHIFFRES_MIN_DU_PREFIXE`), que l'API compare par préfixe. En deçà, trop de fiches le partagent.
 * Une saisie plus récente change la clé de cache : la réponse périmée n'est jamais lue.
 */
export interface DoublonSonde {
  readonly id: number | null;
  readonly name: string | null;
  readonly stage: string | null;
}

export const DELAI_DE_LA_SONDE = 400;

const EMAIL_COMPLET = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** TCK-2590 — le préfixe national le plus court que l'API sonde ; le même seuil, des deux côtés. */
export const CHIFFRES_MIN_DU_PREFIXE = 7;
const NUMERO_ENTAME = new RegExp(`^\\+221\\d{${CHIFFRES_MIN_DU_PREFIXE},8}$`);

/** Ce qui part à la sonde, ou `null` quand rien ne peut désigner une fiche. */
export function saisieASonder(phone: string, email: string): { phone?: string; email?: string } | null {
  const p = phone.trim();
  const e = email.trim();
  const sonde = {
    // Un numéro complet (`numeroComposable` : neuf chiffres derrière +221), ou entamé de sept à huit.
    ...(numeroComposable(p) || NUMERO_ENTAME.test(p) ? { phone: p } : {}),
    ...(EMAIL_COMPLET.test(e) ? { email: e } : {}),
  };
  return Object.keys(sonde).length > 0 ? sonde : null;
}

export function useSondeDeDoublon(phone: string, email: string, actif = true) {
  // Une CHAÎNE temporisée, jamais l'objet : un objet neuf à chaque rendu relancerait la minuterie.
  const cle = useDebouncedValue(JSON.stringify(saisieASonder(phone, email)), DELAI_DE_LA_SONDE);
  const sonde = JSON.parse(cle) as ReturnType<typeof saisieASonder>;
  const requete = useApiQuery<{ data: DoublonSonde[] }>(['customers', 'duplicates', sonde?.phone ?? '', sonde?.email ?? ''], '/api/customers/duplicates', {
    params: { extra: { ...(sonde?.phone ? { phone: sonde.phone } : {}), ...(sonde?.email ? { email: sonde.email } : {}) } },
    enabled: actif && sonde !== null,
    staleTime: 30_000,
  });
  // La saisie a changé depuis la dernière sonde : on ne montre pas un doublon qui n'est plus le sien.
  const courante = saisieASonder(phone, email);
  const aJour = courante !== null && courante.phone === sonde?.phone && courante.email === sonde?.email;
  return { doublons: aJour && actif ? (requete.data?.data ?? []) : [], enCours: requete.isFetching };
}
