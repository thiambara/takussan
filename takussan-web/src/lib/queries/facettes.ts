import { apiFetch } from '@/lib/api';
import { DEFAULT_LOCALE } from '@/i18n/config';

/**
 * Le DOMAINE de la facette `city` — TCK-433, passe 2.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `src/lib/canonique.ts` retient trois clés comme facettes indexables **parce que leur ensemble de
 * valeurs est fini et énumérable**. `type` et `contract_type` le sont dans le dépôt
 * (`propertyTypeValues`, `contractTypeValues`). `city` ne l'était **nulle part** : mesuré le
 * 2026-08-27 sur un build de production, `?city=Zzzinventee` rendait une URL `index, follow`,
 * canonique d'elle-même, avec un `<title>` dérivé de la valeur fournie. L'espace d'URL indexables
 * était donc non borné — le défaut exact que TCK-433 existe pour fermer, ramené d'un cran.
 *
 * *Un ensemble énumérable dont personne ne vérifie l'appartenance n'est pas un ensemble fini,
 * c'est une intention.*
 */

type ReponseVilles = {
  readonly data: readonly { readonly value: string; readonly count: number }[];
  readonly meta: { readonly truncated: boolean };
};

/**
 * Fraîcheur du domaine. Une ville entre ou sort du catalogue au rythme des annonces, pas des
 * déploiements — et l'appel se fait dans la `generateMetadata` de la page publique la plus
 * parcourue. `revalidate` partage donc une seule réponse entre tous les visiteurs d'une heure,
 * là où le défaut de `fetch` sous Next 16 (`no-store`) en ferait un aller-retour par rendu.
 */
export const FRAICHEUR_DOMAINE_VILLES = 3600;

/**
 * Les villes du catalogue, repliées en minuscules → la casse CANONIQUE du catalogue.
 *
 * ⚠️ **Rend `null` — et non un ensemble vide — quand le domaine est inconnaissable** : API
 * injoignable, ou domaine tronqué côté serveur. Les deux cas doivent produire le même
 * comportement chez l'appelant (replier toute facette de ville sur la page nue), et ils ne
 * doivent surtout pas ressembler à « le catalogue n'a aucune ville », qui est une réponse.
 *
 * *Un domaine tronqué n'est pas un domaine* : s'en servir reviendrait à déclarer non canoniques
 * les villes qui n'ont pas tenu dans le plafond, c'est-à-dire à décider par un effet de bord.
 */
export async function villesDuCatalogue(): Promise<Map<string, string> | null> {
  try {
    const reponse = await apiFetch<ReponseVilles>(
      '/public/properties/cities',
      { next: { revalidate: FRAICHEUR_DOMAINE_VILLES } } as RequestInit,
      { locale: DEFAULT_LOCALE },
    );

    if (reponse.meta?.truncated) {
      console.error(
        '[canonique] le domaine des villes est TRONQUÉ côté API : toute facette de ville se replie ' +
          'sur la page nue plutôt que de rejeter en silence les villes absentes du plafond.',
      );
      return null;
    }

    // Repli de casse → valeur canonique. `?city=dakar` et `?city=Dakar` désignent la même page ;
    // sans cette table, ils produiraient deux canoniques.
    const domaine = new Map<string, string>();
    for (const { value } of reponse.data) {
      if (value) domaine.set(value.toLocaleLowerCase('fr'), value);
    }
    return domaine;
  } catch (err) {
    console.error(
      '[canonique] domaine des villes indisponible — toute facette de ville se replie sur la page nue.',
      err,
    );
    return null;
  }
}
