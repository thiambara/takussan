'use client';

import type { Query } from '@tanstack/react-query';

import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ApiError } from '@/lib/api';
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

/**
 * TCK-2785 — ce que la sonde n'a pas pu vérifier. Une erreur ne se rend JAMAIS comme « aucun doublon » :
 * le 429 du seau épuisé (vingt identités complètes par heure et par personne, TCK-2590) dit son attente,
 * lue sur `retry_after` du CORPS (l'en-tête `Retry-After` n'est pas exposé au navigateur) ; toute autre
 * erreur — 5xx, réseau, hors ligne — dit seulement que la vérification n'a pas pu se faire. Le 429 est
 * le même que la fiche soit masquée ou libre : rien ici ne les distingue.
 */
export type SondeImpossible =
  | { readonly cause: 'limite'; readonly reprise: number | null }
  | { readonly cause: 'autre' };

/** Faute de `retry_after`, l'attente qu'on prête à un 429 avant de laisser la même saisie se resonder. */
const ATTENTE_PAR_DEFAUT_MS = 60_000;

function estUnTropDeSondes(erreur: unknown): erreur is ApiError {
  return erreur instanceof ApiError && erreur.status === 429;
}

/**
 * TCK-2785 (AC5) — un 429 ne se relance pas tout seul : ni au retour au premier plan, ni au retour du
 * réseau, ni au remontage, tant que son attente court. Seule une nouvelle saisie (une autre clé) sonde.
 */
function enAttente(query: Query<{ data: DoublonSonde[] }, ApiError, { data: DoublonSonde[] }, readonly unknown[]>): boolean {
  const erreur = query.state.error;
  if (!estUnTropDeSondes(erreur)) return false;
  const attente = erreur.retryAfter !== undefined ? erreur.retryAfter * 1000 : ATTENTE_PAR_DEFAUT_MS;
  return Date.now() < query.state.errorUpdatedAt + attente;
}

export function useSondeDeDoublon(phone: string, email: string, actif = true) {
  // Une CHAÎNE temporisée, jamais l'objet : un objet neuf à chaque rendu relancerait la minuterie.
  const cle = useDebouncedValue(JSON.stringify(saisieASonder(phone, email)), DELAI_DE_LA_SONDE);
  const sonde = JSON.parse(cle) as ReturnType<typeof saisieASonder>;
  const requete = useApiQuery<{ data: DoublonSonde[] }>(['customers', 'duplicates', sonde?.phone ?? '', sonde?.email ?? ''], '/api/customers/duplicates', {
    params: { extra: { ...(sonde?.phone ? { phone: sonde.phone } : {}), ...(sonde?.email ? { email: sonde.email } : {}) } },
    enabled: actif && sonde !== null,
    staleTime: 30_000,
    // TCK-2785 — jamais de relance sur 429 ; ailleurs, la politique du client (une relance hors 4xx).
    retry: (echecs, erreur) => !(erreur instanceof ApiError && erreur.status >= 400 && erreur.status < 500) && echecs < 1,
    refetchOnWindowFocus: (query) => !enAttente(query),
    refetchOnReconnect: (query) => !enAttente(query),
    refetchOnMount: (query) => !enAttente(query),
  });
  // La saisie a changé depuis la dernière sonde : on ne montre pas un doublon qui n'est plus le sien.
  const courante = saisieASonder(phone, email);
  const aJour = courante !== null && courante.phone === sonde?.phone && courante.email === sonde?.email;
  const visible = aJour && actif;
  const erreur = requete.error;
  // Une réponse déjà reçue pour cette saisie reste vraie : seule une sonde SANS réponse est impossible.
  // Une saisie hors ligne reste en suspens (`networkMode: 'online'`) sans erreur : elle n'a rien vérifié.
  const impossible: SondeImpossible | null = !visible || requete.data !== undefined
    ? null
    : estUnTropDeSondes(erreur)
      ? { cause: 'limite', reprise: erreur.retryAfter !== undefined ? requete.errorUpdatedAt + erreur.retryAfter * 1000 : null }
      : requete.isError || requete.isPaused
        ? { cause: 'autre' }
        : null;
  return {
    doublons: visible ? (requete.data?.data ?? []) : [],
    impossible,
    enCours: requete.isFetching,
  };
}
