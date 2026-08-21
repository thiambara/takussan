'use client';

import { Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface WidenedSearchNoticeProps {
  /**
   * Les termes dont la sonde solo a rendu 0, tels que l'utilisateur les a écrits.
   *
   * **Vide n'est pas une absence** : c'est le second cas de l'ADR-0020 — chaque mot existe
   * séparément, leur intersection non. On ne nomme alors AUCUN terme, parce qu'aucun n'est
   * fautif. Le composant ne s'affiche donc pas « quand il y a des termes », il s'affiche quand
   * il y a un repli ; c'est l'appelant qui décide de le monter, sur `repli !== null`.
   */
  readonly termesSansResultat: readonly string[];
  /** Le compte du régime élargi (`search.widened_total`), et non `data.length`. */
  readonly totalElargi: number;
  /** Retire un terme de la requête en gardant le reste — `useSearch().retirerTerme`. */
  readonly onRetirerTerme: (terme: string) => void;
  /**
   * Efface la requête texte en gardant les filtres structurés.
   *
   * C'est l'issue du cas « aucun terme nommé » : on ne peut désigner aucun mot à retirer, mais
   * l'utilisateur doit pouvoir sortir de l'écran autrement qu'en effaçant toute sa recherche.
   */
  readonly onEffacerRecherche: () => void;
  readonly className?: string;
}

/**
 * L'étiquette « ces résultats ne sont pas exactement ce que vous avez demandé » (TCK-338).
 *
 * ## Pourquoi ce composant existe
 *
 * La recherche publique est passée en conjonction ({@link ../../../../docs/adr/0020-recherche-publique-conjonctive-avec-repli-nomme.md ADR-0020}) :
 * un bien ne sort que s'il porte TOUS les termes. Quand cela rend 0, le back rejoue la requête en
 * relâchant des termes et **le dit** dans un bloc `search`. Sans cet écran, ce bloc mourait dans
 * le JSON : `q=villa Saly` affichait 63 villas de Dakar, exactement comme avant, à l'octet près
 * hors du bloc — mesuré par l'agent back le 2026-08-21. Le contrat d'API ne mentait plus ; l'écran,
 * si. **Un cul-de-sac muet est pire que le mensonge qu'il remplace**, parce qu'il ne laisse même
 * plus à l'utilisateur l'occasion de se corriger.
 *
 * ## Les deux phrases ne sont PAS interchangeables
 *
 * | ce que le back a mesuré | ce qu'on a le droit de dire |
 * |---|---|
 * | `terms_unmatched: ["Saly"]` — la sonde `Saly` seule rend 0 | « Aucun bien ne correspond à *Saly*. » |
 * | `terms_unmatched: []` — `studio` rend 44, `piscine` rend 3, l'intersection 0 | « Aucun bien ne réunit tous vos mots. » |
 *
 * Dans le second cas, désigner l'un des mots serait **inventer un coupable** : chacun est vrai
 * séparément. C'est la seule raison pour laquelle ce composant porte deux libellés au lieu d'un
 * gabarit unique — et c'est la distinction qu'un test doit exercer, un composant qui nommerait
 * toujours tous les termes passerait le cas 1 sans broncher.
 *
 * ## Ce qu'il doit toujours proposer
 *
 * Le compte élargi (les biens SONT affichés dessous, ce n'est pas une promesse de seconde
 * requête) **et** un geste : retirer le terme fautif quand il est nommé, effacer les mots-clés
 * sinon. Les libellés appartiennent au front (principe non négociable n°5) : l'API n'envoie que
 * des termes et des comptes, jamais une phrase.
 */
export function WidenedSearchNotice({
  termesSansResultat,
  totalElargi,
  onRetirerTerme,
  onEffacerRecherche,
  className,
}: WidenedSearchNoticeProps) {
  const t = useTranslations('search.widened');
  const nommes = termesSansResultat.length > 0;

  return (
    <div
      // `status` et non `alert` : ce n'est pas une panne, et une région `alert` interrompt le
      // lecteur d'écran. Le message accompagne des résultats bien réels.
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/8 px-4 py-3',
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold text-foreground">
          {nommes
            ? t('unmatched', {
                count: termesSansResultat.length,
                terms: termesSansResultat.join(', '),
              })
            : t('noIntersection')}
        </p>

        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('showing', { count: totalElargi })}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {nommes ? (
            termesSansResultat.map((terme) => (
              <Button
                key={terme}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRetirerTerme(terme)}
              >
                {t('removeTerm', { term: terme })}
                <X aria-hidden="true" />
              </Button>
            ))
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onEffacerRecherche}>
              {t('clearQuery')}
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
