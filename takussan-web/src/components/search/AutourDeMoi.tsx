'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { LocateFixed, Loader2, RefreshCw } from 'lucide-react';
import type { SearchFilters } from '@/types/search';

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * « Autour de moi » — la commande qui pose `lat` / `lng` / `radius_km` (TCK-346)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ## Pourquoi la géolocalisation du navigateur, et pas le centre de la carte
 *
 * Les deux sources d'origine étaient recevables, et le centre de la carte est le moins cher :
 * `PropertyMap` connaît déjà ses `bounds` et refetch au pan, sans demander la moindre
 * permission. **Il a pourtant été écarté, pour une raison qui n'est pas technique** :
 *
 * 1. **Le rayon vit dans le panneau de filtres, la carte est une VUE.**
 *    `PropertiesDiscoveryPage` bascule entre `list` et `map` (`View`), et le panneau est monté
 *    dans les deux. Une commande de rayon alimentée par le centre de la carte serait donc
 *    **inerte en vue liste**, c'est-à-dire dans la vue par défaut — un filtre visible qui ne
 *    peut rien poser tant qu'on n'a pas changé d'onglet.
 * 2. **Le centre de la carte n'est l'intention de personne.** Il bouge à chaque pan, y compris
 *    quand l'utilisateur ne fait que regarder. Un rayon qui suit le cadrage se déplace sans
 *    qu'on le lui ait demandé, et l'URL — donc la recherche sauvegardée, donc le lien partagé —
 *    enregistre un point que l'utilisateur n'a jamais choisi.
 * 3. La carte publique interroge `/map`, un AUTRE endpoint, qui ne reçoit même pas `q`
 *    (cf. `mapFilters` dans `PropertiesDiscoveryPage`). Y brancher le rayon de la liste ferait
 *    diverger deux jeux de résultats sur le même écran.
 *
 * **Ce que ça coûte, et qui est assumé** : `navigator.geolocation` exige un contexte sécurisé
 * (HTTPS, ou `localhost` en développement), et l'utilisateur peut refuser. Le refus n'est donc
 * pas une exception à rattraper : c'est **un état de l'interface**, rendu, traduit dans les
 * trois langues, et qui redirige vers le filtre « Ville » juste au-dessus — lequel ne demande
 * aucune permission et couvre le même besoin.
 *
 * ⚠ Sur une origine NON sécurisée, Chrome ne rend pas une erreur distincte : il rend
 * `PERMISSION_DENIED` (code 1), exactement comme un refus humain. Les deux tombent donc sur le
 * même message — c'est délibéré, un message qui distinguerait les deux devrait deviner.
 *
 * ## Le hook avant la garde (ADR-0015, React Compiler)
 *
 * `useTranslations` est appelé AVANT toute sortie anticipée. Le compilateur refuse un hook
 * placé après un `if (…) return null` — il le voit comme conditionnel.
 */

/** Les rayons proposés, en kilomètres. Bien en deçà du plafond serveur (500 km, ADR-0023). */
export const RAYONS_KM = [1, 2, 5, 10, 25] as const;

/**
 * Le rayon posé en même temps que le point.
 *
 * Il n'existe **pas** d'état « point sans rayon » atteignable depuis cette commande, et c'est
 * voulu : un point seul ne filtre rien, ne porte aucune puce, et serait donc un état actif
 * invisible — précisément ce que `normaliserGeo()` efface.
 */
export const RAYON_PAR_DEFAUT_KM = 5;

/** Ce que le composant sait dire de la dernière demande de position. */
type EtatLocalisation = 'repos' | 'attente' | 'refuse' | 'indisponible' | 'echec';

export interface AutourDeMoiProps {
  /** L'origine courante, lue depuis l'URL. `undefined` tant qu'aucun point n'est posé. */
  lat: number | undefined;
  lng: number | undefined;
  radiusKm: number | undefined;
  /** Même contrat que le `set()` de `FilterSidebar` : un patch de filtres, geste discret. */
  onChange: (patch: Partial<SearchFilters>) => void;
  /**
   * Injectable pour les tests — jamais en production.
   *
   * `navigator.geolocation` n'existe pas dans jsdom, et le stubber globalement fuirait d'un
   * test à l'autre. Le défaut est lu à l'APPEL et non à la construction, pour que le composant
   * fonctionne aussi lorsqu'il est rendu côté serveur puis hydraté.
   */
  geolocalisation?: Pick<Geolocation, 'getCurrentPosition'>;
}

export function AutourDeMoi({
  lat,
  lng,
  radiusKm,
  onChange,
  geolocalisation,
}: AutourDeMoiProps) {
  const t = useTranslations('search.filters.aroundMe');
  const [etat, setEtat] = React.useState<EtatLocalisation>('repos');

  const aUnPoint = lat !== undefined && lng !== undefined;

  const demanderPosition = React.useCallback(() => {
    const source =
      geolocalisation
      ?? (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);

    if (!source) {
      setEtat('indisponible');
      return;
    }

    setEtat('attente');
    source.getCurrentPosition(
      (position) => {
        setEtat('repos');
        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          // Le rayon courant est conservé s'il existe déjà : « actualiser ma position » ne doit
          // pas rouvrir la recherche à 5 km quand l'utilisateur en avait demandé 25.
          radius_km: radiusKm ?? RAYON_PAR_DEFAUT_KM,
        });
      },
      (erreur: GeolocationPositionError) => {
        // Un refus n'est PAS une panne : c'est une réponse, et elle se rend à l'écran.
        setEtat(erreur?.code === 1 ? 'refuse' : 'echec');
      },
      // `maximumAge` : une position vieille de cinq minutes suffit largement pour un rayon
      // kilométrique, et évite de rallumer le GPS à chaque clic.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [geolocalisation, onChange, radiusKm]);

  const choisirRayon = (km: number) => {
    if (!aUnPoint) return;
    // Re-cliquer le rayon actif retire la géographie ENTIÈRE — point compris. Un point sans
    // rayon ne filtrerait rien tout en restant dans l'URL et dans les recherches sauvegardées.
    if (radiusKm === km) {
      onChange({ radius_km: undefined, lat: undefined, lng: undefined });
      return;
    }
    onChange({ radius_km: km });
  };

  const message =
    etat === 'refuse' ? t('denied')
    : etat === 'indisponible' ? t('unavailable')
    : etat === 'echec' ? t('failed')
    : null;

  return (
    <div className="space-y-2">
      {!aUnPoint ? (
        <button
          type="button"
          onClick={demanderPosition}
          disabled={etat === 'attente'}
          className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left text-gray-600 transition-all duration-150 hover:border-primary hover:text-primary disabled:cursor-progress disabled:opacity-60"
        >
          {etat === 'attente' ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="text-sm font-semibold">
            {etat === 'attente' ? t('locating') : t('use')}
          </span>
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
              <LocateFixed className="size-3.5 shrink-0" aria-hidden="true" />
              {t('active')}
            </span>
            <button
              type="button"
              onClick={demanderPosition}
              disabled={etat === 'attente'}
              className="inline-flex items-center gap-1 text-[11px] text-gray-400 transition-colors hover:text-primary disabled:cursor-progress"
            >
              <RefreshCw
                className={`size-3 ${etat === 'attente' ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {etat === 'attente' ? t('locating') : t('change')}
            </button>
          </div>

          <div role="group" aria-label={t('radiusLabel')} className="flex flex-wrap gap-2">
            {RAYONS_KM.map((km) => {
              const actif = radiusKm === km;
              return (
                <button
                  key={km}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => choisirRayon(km)}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-150 ${
                    actif
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-gray-200 text-gray-600 hover:border-primary hover:text-primary'
                  }`}
                >
                  {t('radiusOption', { km })}
                </button>
              );
            })}
          </div>
        </>
      )}

      {message && (
        <p role="status" className="text-[11px] leading-relaxed text-gray-500">
          {message}
        </p>
      )}
    </div>
  );
}
