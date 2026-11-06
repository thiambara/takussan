import type { IdDestination } from './catalogue';
import type { EntreeComposee } from './composer-menu';

/**
 * TCK-2481 (ADR-0089 §3) — les onglets de la barre mobile de `/app`.
 *
 * Un onglet n'est pas une destination de plus : c'est une entrée DÉJÀ rendue par le menu composé du
 * persona (`composerMenu`), donc déjà jugée par le catalogue — même accès, même espace suspendu. La
 * barre n'ouvre rien que le tiroir n'ouvre pas.
 */

/** Quatre onglets au plus, puis « Menu » : cinq cases de 72 px à 360. */
export const ONGLETS_AU_PLUS = 4;

/**
 * Libellés courts, clé sous `nav.sidebar.onglets` — les mots du ticket. Une destination absente garde
 * le libellé de son entrée (persona compris : « Interventions », « Biens »).
 */
export const LIBELLES_COURTS: Partial<Record<IdDestination, string>> = {
  'tableau-de-bord': 'accueil',
  favoris: 'favoris',
  visites: 'visites',
  demandes: 'demandes',
  reservations: 'reservations',
};

/** Le complément « Aussi … » (`composerMenu`) : les destinations d'un AUTRE profil de l'espace. */
const GROUPE_COMPLEMENT = 'aussi';

interface GroupeDEntrees<E> {
  readonly id: string;
  readonly entrees: readonly E[];
}

function abreger<E extends EntreeComposee>(entree: E): E {
  const court = LIBELLES_COURTS[entree.id];
  return court ? { ...entree, labelKey: `onglets.${court}` } : entree;
}

/**
 * Les onglets du persona, dans l'ordre de sa disposition.
 *
 * Candidates : les entrées des groupes reçus, dans l'ordre, hors « Aussi … » et hors cadenas — une
 * seule fois par identifiant. Un onglet se cherche par identifiant dans TOUS ces groupes : une
 * destination épinglée (TCK-2480, groupe « Épinglés ») reste un onglet. Un onglet déclaré que rien ne
 * rend cède SA place à la première candidate qui n'est pas déjà un onglet déclaré — « la destination
 * suivante de sa disposition » (TCK-2481, arbitrage 6). La réserve suit l'ordre des groupes REÇUS :
 * pour qu'il soit celui de la disposition, et non celui des épingles de l'utilisateur, l'appelant passe
 * les groupes du menu composé SANS préférences. Plus de candidate : un onglet de moins, jamais une case
 * vide, jamais un cadenas.
 */
export function ongletsDuMenu<E extends EntreeComposee & { readonly locked?: boolean }>(
  groupes: readonly GroupeDEntrees<E>[],
  onglets: readonly IdDestination[],
): E[] {
  const parId = new Map<string, E>();
  for (const groupe of groupes) {
    if (groupe.id === GROUPE_COMPLEMENT) continue;
    for (const entree of groupe.entrees) {
      if (!entree.locked && !parId.has(entree.id)) parId.set(entree.id, entree);
    }
  }
  const declares = new Set<string>(onglets);
  const reserve = [...parId.values()].filter((e) => !declares.has(e.id));
  return [...declares].slice(0, ONGLETS_AU_PLUS).flatMap((id) => {
    const entree = parId.get(id) ?? reserve.shift();
    return entree ? [abreger(entree)] : [];
  });
}
