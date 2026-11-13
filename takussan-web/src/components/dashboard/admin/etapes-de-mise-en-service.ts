import { PAGES_ADMIN, type CheminAdmin } from '@/lib/access/pages-admin';
import type { EtapeMiseEnService, SetupStatusResponse } from '@/lib/queries/mise-en-service';
import type { AgencyKind } from '@/types/agency';

/**
 * TCK-589 / TCK-777 / TCK-761 — la règle des étapes de la mise en service, partagée par la CARTE du
 * tableau de bord d'agence (`MiseEnService`, `/app/overview/agency`) et le BANDEAU d'une ligne de
 * l'accueil (`BandeauMiseEnService`, TCK-2622). Une seule règle : la carte et le bandeau ne peuvent
 * pas compter différemment, ni mener à deux écrans pour la même étape.
 *
 * ⚠ **Aucune étape n'est inventée ici** : la liste est celle de l'API. Une clé que ce fichier ne
 * sait pas libeller n'est pas affichée (pas de chemin de clé brut à l'écran), mais elle COMPTE dans
 * la progression — le total reste celui du serveur.
 */

/**
 * L'écran qui fait chaque étape. Les pages d'administration sont tenues à la table des pages
 * (`CheminAdmin`, TCK-649) : un chemin qu'elle ne déclare pas ne compile pas.
 */
export const DESTINATIONS_DE_MISE_EN_SERVICE: Readonly<Record<string, CheminAdmin | '/app/properties/new' | '/app/profile/security'>> = {
  kyc_verified: '/app/agency/kyc',
  logo: '/app/agency',
  commission_rate: '/app/agency',
  payment_integration: '/app/agency/integrations',
  first_member: '/app/agency/team',
  first_published_property: '/app/properties/new',
  admin_two_factor: '/app/profile/security',
};

/** L'étape qui en conditionne d'autres, montrée la première (TCK-761). */
const ETAPE_EN_TETE = 'admin_two_factor';

/**
 * TCK-777 (P15.08) — une étape s'applique à l'agence quand l'écran qui la fait lui est ouvert. La
 * règle n'est pas recopiée : elle se lit dans la table des pages (`agence: 'standard'`). Pour une
 * agence `individual`, « premier membre » (`/app/agency/team`) tombe ainsi : l'hôte solo n'a pas
 * d'équipe, et l'étape ne serait jamais faite.
 */
function etapeApplicable(key: string, kind: AgencyKind | null): boolean {
  if (kind === 'standard') return true;
  const page = PAGES_ADMIN.find((p) => p.chemin === DESTINATIONS_DE_MISE_EN_SERVICE[key]);
  return page?.exige.agence !== 'standard';
}

export interface EtatDeMiseEnService {
  /** Les étapes qui s'appliquent à l'agence, connues ou non : elles font le total. */
  readonly total: number;
  readonly faites: number;
  /** Les étapes que l'interface sait libeller et mener, la 2FA en tête, puis l'ordre de l'API. */
  readonly connues: readonly EtapeMiseEnService[];
  /** La première étape connue qui reste à faire : celle que le bandeau nomme. `null` si aucune. */
  readonly suivante: EtapeMiseEnService | null;
}

/**
 * L'état de la mise en service, ou `null` quand il n'y a rien à montrer : pas de réponse, agence
 * prête (`complete`), ou toutes les étapes qui s'appliquent faites. La progression et la
 * disparition se jugent sur les étapes qui s'appliquent, pas sur `complete`, que l'API calcule sur
 * les sept (TCK-777).
 */
export function etatDeMiseEnService(reponse: SetupStatusResponse | undefined, kind: AgencyKind | null): EtatDeMiseEnService | null {
  if (!reponse || reponse.data.complete) return null;
  const etapes = reponse.data.steps.filter((e) => etapeApplicable(e.key, kind));
  if (etapes.length === 0 || etapes.every((e) => e.done)) return null;
  // TCK-761 (P15.04) — la 2FA de l'admin passe en tête : elle conditionne trois autres étapes
  // (commission, intégration de paiement, premier membre), que l'API refuse sans elle
  // (`ProtectedActions::AGENCY_TWO_FACTOR`). Les autres gardent l'ordre de l'API
  // (`sort` est stable, et trie la copie que rend `filter`).
  const connues = etapes
    .filter((e) => e.key in DESTINATIONS_DE_MISE_EN_SERVICE)
    .sort((a, b) => Number(b.key === ETAPE_EN_TETE) - Number(a.key === ETAPE_EN_TETE));
  return {
    total: etapes.length,
    faites: etapes.filter((e) => e.done).length,
    connues,
    suivante: connues.find((e) => !e.done) ?? null,
  };
}
