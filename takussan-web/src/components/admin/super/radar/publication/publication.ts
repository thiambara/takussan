import type { RadarPublicationListing, RadarPublicationPreview } from '@/types/radar';
import { codeDeLErreur } from '../fiche/useMessageEchecFiche';

/** Le choix explicite de l'opérateur, par annonce ; une annonce sans choix est cochée si rien ne la bloque. */
export type ChoixAnnonces = Readonly<Record<number, boolean>>;

/**
 * TCK-2389 — une annonce se publie si l'aperçu ne la bloque pas ET que l'opérateur ne l'a pas décochée. Une annonce
 * bloquée n'est jamais cochée, quel qu'ait été son choix : si l'aperçu relu la bloque, elle sort de la sélection.
 * L'API juge de nouveau (`RadarPublisher::publish`) : cet écran n'est pas la garde.
 */
export function estCochee(annonce: RadarPublicationListing, choix: ChoixAnnonces): boolean {
  return annonce.blocking.length === 0 && (choix[annonce.id] ?? true);
}

/** Les annonces à publier, par identifiant croissant. */
export function annoncesCochees(annonces: readonly RadarPublicationListing[], choix: ChoixAnnonces): RadarPublicationListing[] {
  return annonces.filter((annonce) => estCochee(annonce, choix)).sort((a, b) => a.id - b.id);
}

export interface ResumePublication {
  /** Annonces cochées : autant de biens publiés. */
  readonly biens: number;
  /** Photos de la réserve des annonces cochées : celles qui passent sur les biens. */
  readonly photos: number;
  /** Un compte et un espace sont créés ; faux si le compte de l'annonceur existe déjà. */
  readonly creeLeCompte: boolean;
}

/** Ce que la confirmation récapitule : « 1 compte, 1 espace, N biens publiés avec M photos ». */
export function resumeDeLaPublication(
  apercu: RadarPublicationPreview,
  choix: ChoixAnnonces,
): ResumePublication {
  const cochees = annoncesCochees(apercu.listings, choix);
  return {
    biens: cochees.length,
    photos: cochees.reduce((total, annonce) => total + annonce.photos.length, 0),
    creeLeCompte: !apercu.account.exists,
  };
}

/** Une préparation de photos tourne encore : l'aperçu se relit à son rythme tant que c'est vrai. */
export function preparationEnCours(apercu: RadarPublicationPreview | undefined): boolean {
  return apercu?.listings.some((annonce) => annonce.photo_preparation.status === 'pending') ?? false;
}

/** Un blocage qui ferme tout l'écran : il n'y a rien à cocher, et la raison se lit avant le reste. */
export function publicationFermee(apercu: RadarPublicationPreview): boolean {
  return apercu.blocking.length > 0;
}

/** Le plafond de photos d'une publication : dépasse-t-il celui que l'API annonce ? Les photos des annonces cochées s'additionnent. */
export function depassePlafondDePhotos(resume: ResumePublication, apercu: RadarPublicationPreview): boolean {
  return resume.photos > apercu.max_photos;
}

/** Le code de l'intergiciel d'idempotence quand la même clé travaille encore (ADR-0072 § 5) : 409, sans rien écrire. */
export const CODE_EN_COURS = 'idempotency.in_progress';

/** Combien de fois on rejoue un envoi « encore en cours », et à quel rythme : 8 × 3 s, de quoi attendre une publication lente. */
export const REJEUX_EN_COURS_MAX = 8;
export const REJEU_EN_COURS_MS = 3_000;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * TCK-2389 (ADR-0072) — une publication un peu longue dépasse le délai du relais alors que l'API va au bout et commite (la
 * vraie borne de l'API est `max_execution_time` = 60 s, en temps d'horloge, image ZTS : `radar.publish.max_photos` borne le
 * travail pour rester dessous) ; le réessai sous la MÊME clé rend alors 409 `idempotency.in_progress` tant qu'elle tourne, puis la réponse enregistrée. On le rejoue
 * donc, à court délai et de façon bornée, au lieu de relire l'aperçu — qui, une fois les biens publiés, ne les montrerait
 * plus — ; passé la borne, le refus remonte tel quel et la clé reste, pour que l'opérateur réessaie sous elle.
 */
export async function rejouerSiEnCours<T>(
  appel: () => Promise<T>,
  { essais = REJEUX_EN_COURS_MAX, delaiMs = REJEU_EN_COURS_MS, attendre = pause }: {
    readonly essais?: number;
    readonly delaiMs?: number;
    readonly attendre?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  for (let essai = 1; ; essai += 1) {
    try {
      return await appel();
    } catch (e) {
      if (codeDeLErreur(e) !== CODE_EN_COURS || essai >= essais) throw e;
      await attendre(delaiMs);
    }
  }
}
