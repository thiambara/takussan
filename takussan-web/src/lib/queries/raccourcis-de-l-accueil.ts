import { apiFetch } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { DEFAULT_LOCALE } from '@/i18n/config';
// Pas `facettes.ts` : il tire `canonique.ts` → `lib/schemas` → zod, et ce module est importé par
// `HomepageDiscovery` (client). Revue adverse de TCK-2495.
import { FRAICHEUR_DOMAINE_VILLES, replie, type ComptesParContrat } from '@/lib/queries/domaine-des-lieux';

/**
 * Les sections de l'accueil lues par le SERVEUR seul, hors de l'appel unique des rangées
 * (`/public/properties/discovery`).
 *
 * TCK-2495 (« Deux gestes ») — deux sections, toutes deux sur des endpoints qui existaient déjà :
 *
 *  · **les quartiers de la ville des rangées**, en tuiles : `GET /public/properties/neighborhoods?city=…`,
 *    `{value, count}` triés par compte décroissant (le domaine des facettes de quartier) ;
 *  · **l'offre de la ville**, qui chiffre le bloc propriétaire : `GET /public/properties/cities`, dont
 *    chaque ville porte `contracts.rent` / `contracts.sale` (P35.05).
 *
 * « À vendre », la rangée que lisait ce module depuis TCK-628, a quitté l'accueil : TCK-2495 réduit
 * les rangées à trois, sans doublon (`rangeesSansDoublon`).
 *
 * ⚠ **Aucune photo de quartier** : l'API n'en sert pas. Les tuiles sont typographiques.
 * ⚠ **Aucun chiffre de DEMANDE** (« N personnes ont cherché ») : aucun endpoint public ne compte les
 * recherches (ADR-0088 réserve le journal à l'administration). Le bloc dit l'OFFRE, qui est publique
 * et exacte — un chiffre de demande inventé serait exactement ce que l'audit interdit d'afficher.
 *
 * ⚠ **Chaque section rend `null` en cas de panne**, et disparaît (ou perd son chiffre) : une page
 * publique doit rester servable. Mises en cache une heure et PARTAGÉES, comme le domaine des
 * facettes : elles ne dépendent ni du visiteur ni de sa langue.
 */
export interface QuartierDeLAccueil {
  readonly nom: string;
  readonly compte: number;
}

export interface OffreDeLaVille {
  readonly ville: string;
  readonly location: number;
  readonly vente: number;
}

export interface RaccourcisDeLAccueil {
  /** La ville dont parlent les deux sections — celle que le serveur a servie aux rangées. */
  readonly ville: string | null;
  readonly quartiers: readonly QuartierDeLAccueil[] | null;
  readonly offre: OffreDeLaVille | null;
}

export const AUCUN_RACCOURCI: RaccourcisDeLAccueil = { ville: null, quartiers: null, offre: null };

/** Huit tuiles au plus : deux rangées de quatre au bureau, une rangée qui défile au téléphone. */
export const QUARTIERS_DE_L_ACCUEIL_MAX = 8;

type Domaine = {
  readonly data: readonly { readonly value: string; readonly count: number; readonly contracts?: ComptesParContrat }[];
};

const PARTAGE = { next: { revalidate: FRAICHEUR_DOMAINE_VILLES } } as RequestInit;

async function quartiersDe(ville: string): Promise<readonly QuartierDeLAccueil[] | null> {
  try {
    const reponse = await apiFetch<Domaine>(
      cheminApi`/public/properties/neighborhoods?city=${encodeURIComponent(ville)}`,
      PARTAGE,
      { locale: DEFAULT_LOCALE, partage: true },
    );
    const quartiers = reponse.data
      .filter((q) => q.value && q.count > 0)
      .slice(0, QUARTIERS_DE_L_ACCUEIL_MAX)
      .map((q) => ({ nom: q.value, compte: q.count }));
    return quartiers.length > 0 ? quartiers : null;
  } catch (err: unknown) {
    console.error('[accueil] quartiers indisponibles : ', err);
    return null;
  }
}

async function offreDe(ville: string): Promise<OffreDeLaVille | null> {
  try {
    const reponse = await apiFetch<Domaine>('/public/properties/cities', PARTAGE, {
      locale: DEFAULT_LOCALE,
      partage: true,
    });
    const trouvee = reponse.data.find((v) => v.value && replie(v.value) === replie(ville));
    const location = trouvee?.contracts?.rent;
    const vente = trouvee?.contracts?.sale;
    // Un compte absent n'est pas zéro : sans les deux, le bloc s'affiche sans chiffre.
    if (!trouvee || typeof location !== 'number' || typeof vente !== 'number') return null;
    return { ville: trouvee.value, location, vente };
  } catch (err: unknown) {
    console.error('[accueil] offre de la ville indisponible : ', err);
    return null;
  }
}

/**
 * @param ville la ville des rangées (`near.city` de la découverte servie) ; `null` quand la découverte
 *              est en panne — les deux sections disparaissent alors avec elle.
 */
export async function raccourcisDeLAccueil(ville: string | null): Promise<RaccourcisDeLAccueil> {
  if (!ville) return AUCUN_RACCOURCI;
  const [quartiers, offre] = await Promise.all([quartiersDe(ville), offreDe(ville)]);
  return { ville, quartiers, offre };
}
