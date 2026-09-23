'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { Clock, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/utils';
import { useDateRelative } from '@/components/property/cards/useDateRelative';
import type { ContractType, PropertyListItem } from '@/types/property';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { CompareToggleButton } from '@/components/compare/CompareToggleButton';
import { ContractTypeChip } from '@/components/property/cards/ContractTypeChip';
import { NewBuildChip, porteUnBadgeNeuf } from '@/components/property/cards/NewBuildChip';
import { CardMeta } from '@/components/property/cards/CardMeta';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { LienDeCarte, AU_DESSUS_DU_LIEN } from '@/components/property/cards/LienDeCarte';
import { staggerDelay } from '@/components/property/card-stagger';
import { CARD_SIZES_SEARCH_GRID } from '@/components/property/card-image-sizes';
import { PROPERTY_ENUM_NAMESPACES, enumLabel } from '@/components/property-form/options';
import { conditionValues, propertyTypeValues } from '@/lib/schemas/property';

/**
 * Canonical PropertyCard used by the homepage, search results and any
 * future discovery surface (map popup, recently-viewed, etc.).
 *
 * Wave 3 — TCK-038 / TCK-039 / TCK-047.
 *
 * Intentionally client-only: the favorite button needs access to the auth
 * context. When rendered inside a Server Component, the parent can wrap it
 * in a client boundary; inside an already-client page the cost is
 * negligible.
 */



/** Format compact des pastilles quand l'image passe sous 11rem — cf. la barre du haut. */
const PASTILLE_ETROITE =
  '@max-[11rem]:px-1.5 @max-[11rem]:py-0.5 @max-[11rem]:gap-1 @max-[11rem]:text-xs';

function useReveal(ref: React.RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

export interface PropertyCardProps {
  readonly property: PropertyListItem;
  /** 0-based index, used for staggered reveal animations. */
  readonly index?: number;
  /** Next/Image `priority` prop — set true on above-the-fold cards only. */
  readonly priority?: boolean;
  readonly className?: string;
  /** Hide the favorite button (e.g. when the card is already inside a favourites list). */
  readonly hideFavorite?: boolean;
  /** Hide the compare toggle — defaults to visible on public discovery cards (TCK-082). */
  readonly hideCompare?: boolean;
  /**
   * `sizes` de `next/image` — **appartient à la grille appelante, pas à la carte**.
   *
   * Le défaut couvre la grille de `/properties` parce que c'est la surface
   * historique ; toute autre grille DOIT passer le sien. Les valeurs mesurées vivent
   * dans `card-image-sizes.ts`, avec le relevé qui les justifie.
   */
  readonly sizes?: string;
  /**
   * TCK-555 — la transaction sur laquelle la LISTE ENTIÈRE est filtrée, s'il y en a une.
   *
   * Sous `contract_type=rent`, chaque carte répétait « En location » : une pastille qui ne
   * distingue rien occupe la photo pour rien. La carte la retire quand le bien porte exactement
   * cette transaction — et la garde dans le cas contraire, où elle dit alors une vraie différence.
   *
   * ⚠ Une PROP et non une lecture de l'URL : la carte sert aussi les biens similaires et les
   * favoris, où aucun filtre ne s'applique. C'est la grille appelante qui sait ce qu'elle liste.
   */
  readonly transactionFiltree?: ContractType;
  /**
   * TCK-555 — quand réserver deux lignes au titre. La réserve n'a de sens que si des cartes
   * VOISINES doivent s'aligner. `des-sm` (défaut) : les grilles de la liste et des favoris sont à
   * une colonne sous `sm`, la carte y est seule sur sa rangée. `toujours` : le carrousel des biens
   * similaires montre la diapositive suivante à côté de la courante à toutes les largeurs.
   */
  readonly titreSurDeuxLignes?: 'des-sm' | 'toujours';
}

export function PropertyCard({
  property,
  index = 0,
  priority = false,
  className,
  hideFavorite = false,
  hideCompare = false,
  sizes = CARD_SIZES_SEARCH_GRID,
  transactionFiltree,
  titreSurDeuxLignes = 'des-sm',
}: PropertyCardProps) {
  const t = useTranslations('property');
  const tCards = useTranslations('property.cards');
  // TCK-466 — le vocabulaire des types de bien s'adresse par la TABLE, jamais par un chemin
  // composé à la main. Cette carte écrivait `t(`types.${property.type}`)` sur un traducteur borné
  // à `property` : la chaîne `property.types` s'y retrouvait recopiée, en deux morceaux, hors de
  // `PROPERTY_ENUM_NAMESPACES`. `enumLabel` reconduit exactement le repli d'avant — la valeur
  // BRUTE quand elle n'est pas un type connu — sur l'appartenance à l'enum plutôt que sur
  // `t.has()` : les 16 valeurs de `propertyTypeValues` sont présentes dans les trois
  // dictionnaires (mesuré le 2026-08-29), les deux critères coïncident donc à l'écran.
  const tTypes = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tEtats = useTranslations(PROPERTY_ENUM_NAMESPACES.condition);
  const ref = useRef<HTMLDivElement>(null);
  // Priority cards (above-the-fold) skip the initial hidden state so the
  // browser can count their image as the LCP candidate immediately.
  const visible = useReveal(ref) || priority;

  const location = [property.location.quarter, property.location.city]
    .filter(Boolean)
    .join(', ');
  const timeAgo = useDateRelative(property.published_at ?? property.created_at);
  const idTitre = useId();

  // TCK-555 — SOUS `md`, la photo porte AU PLUS deux éléments : UNE pastille, et le favori. Relevé
  // de l'audit à 360 px : quatre éléments sur une photo de 156 × 117 px (pastille, favori,
  // comparateur, ancienneté). La pastille est celle de la transaction, sauf quand la liste est
  // filtrée dessus (elle ne distinguerait rien) : l'état « Neuf / Sur plan » prend alors sa place.
  // Quand les deux ont à dire, l'état passe en TEXTE dans la ligne de détails — il n'est ni perdu,
  // ni dit deux fois.
  //
  // ⚠ À PARTIR DE `md`, LA CARTE DE BUREAU EST INCHANGÉE (contrainte du ticket) : comparateur,
  // ancienneté et état restent sur la photo. Le premier tour appliquait la disposition mobile à
  // toutes les largeurs ; sur les emplacements de 192 px du bureau (/properties à 1024 et à partir
  // de 1536 px), le prix passait à la ligne sur 17 cartes sur 30 (le comparateur lui prenait
  // 40 px), et la ligne de détails, un élément de plus, laissait une puce pendante sur 24.
  // Ce qui ne vaut que d'un côté est donc rendu aux deux endroits, et masqué par la largeur :
  // `md:hidden` (téléphone seulement) ou `hidden md:…` (bureau seulement). `display: none` retire
  // l'élément de l'arbre d'accessibilité et de l'ordre de tabulation : un seul est annoncé.
  const transaction =
    property.contract_type && property.contract_type !== transactionFiltree ? property.contract_type : null;
  const etatNeuf = porteUnBadgeNeuf(property.condition) ? property.condition : null;
  const etatEnPastille = transaction === null && etatNeuf !== null;
  // L'aperçu que la barre flottante du comparateur affichera. La carte l'a déjà sous la main :
  // le lui passer coûte trois champs et évite une requête par page montée.
  const apercu = { title: property.title, slug: property.slug, photo: property.main_photo_url };

  // TCK-554 — la racine n'est plus un `<a>` : le lien est un enfant vide qui la couvre
  // (`LienDeCarte`), et le favori et le comparateur sont ses FRÈRES. Ils étaient ses enfants —
  // HTML invalide, et un nom de lien qui lisait toute la carte, boutons compris.
  return (
    <div
      ref={ref}
      style={{ animationDelay: staggerDelay(index) }}
      className={`group relative cursor-pointer transition-opacity duration-300 ${
        visible ? 'animate-fade-in-up' : 'opacity-0'
      } ${className || ''}`}
    >
      <LienDeCarte slug={property.slug} idTitre={idTitre} />

      {/* Image */}
      {/* `@container` : la carte se règle sur SA largeur, que la grille appelante décide —
          pas sur celle de l'écran. */}
      <div data-photo className="@container relative aspect-4/3 rounded-xl overflow-hidden bg-muted">
        <PropertyPhoto
          src={property.main_photo_url}
          alt={property.title}
          priority={priority}
          className="group-hover:scale-105 transition-transform duration-500"
          sizes={sizes}
        />

        {/* Barre du haut — la pastille à gauche, le favori à droite, dans UN SEUL flux flex.
            La pastille ne dispose que de la place que le favori lui laisse, et se tronque au
            lieu de passer dessous — quelle que soit la longueur du libellé dans la locale.

            Sous 11rem d'image (176 px), la barre passe en format compact — marges, pastille et
            cœur réduits. La grille de /properties n'y descend plus (192 px au plus étroit,
            mesuré le 2026-09-23) ; les autres grilles de la carte peuvent encore y passer.

            TCK-555 — sous `md`, le comparateur et l'ancienneté quittent la photo : le premier
            pour la rangée du prix, la seconde pour la ligne de détails. */}
        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2 @max-[11rem]:inset-x-2 @max-[11rem]:top-2 @max-[11rem]:gap-1.5">
          {/* Transaction badge — TCK-129 : aligné sur ContractTypeChip pour cohérence site-wide.
              TCK-508 — « Neuf / Sur plan » quand la place est libre (cf. `etatEnPastille`). */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 @max-[11rem]:gap-1">
            {transaction && <ContractTypeChip type={transaction} className={PASTILLE_ETROITE} />}
            {etatEnPastille && <NewBuildChip condition={etatNeuf} className={PASTILLE_ETROITE} />}
            {/* Bureau : l'état à côté de la transaction, comme avant ; sous `md`, dans les détails. */}
            {etatNeuf && !etatEnPastille && (
              <span className="hidden md:contents">
                <NewBuildChip condition={etatNeuf} className={PASTILLE_ETROITE} />
              </span>
            )}
          </div>

          {/* Favorite, puis compare (TCK-082) en dessous — le compare au BUREAU seulement (TCK-555).
              Au-dessus du lien de la carte (TCK-554).
              L'écart tient les zones tactiles de 44 px sans chevauchement : il faut 8 px entre
              le cœur de 40 et la pastille de 32 (2 + 6 px de débord), 12 px entre deux ronds de
              32 en format compact (6 + 6) — il était de 6 px, les zones se recouvraient. Deux px
              de plus de chaque côté : à écart exact, les zones se touchent et l'arrondi au pixel
              de l'écran donnait la ligne commune au comparateur (mesuré, 44 points sur 1936). */}
          <div className={`flex shrink-0 flex-col items-center gap-2.5 @max-[11rem]:gap-3.5 ${AU_DESSUS_DU_LIEN}`}>
            {!hideFavorite && (
              <FavoriteButton
                propertyId={property.id}
                className="@max-[11rem]:size-8 @max-[11rem]:[&_svg]:size-4"
              />
            )}
            {!hideCompare && (
              // `contents` : au bureau, le bouton est l'enfant direct de la colonne, comme avant.
              <span className="hidden md:contents">
                <CompareToggleButton
                  propertyId={property.id}
                  size="sm"
                  preview={apercu}
                />
              </span>
            )}
          </div>
        </div>

        {/* Ancienneté — sur la photo au BUREAU seulement ; sous `md`, dans la ligne de détails. */}
        <div className="absolute bottom-3 left-3 hidden md:flex items-center gap-1 bg-scrim/60 backdrop-blur-md text-primary-foreground text-xs font-medium px-2 py-1 rounded-full shadow-sm">
          <Clock className="size-3 opacity-80" aria-hidden="true" />
          {timeAgo}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-1 mt-3.5">
        {/* TCK-555 — sous `md`, le comparateur (TCK-082) quitte la photo pour la rangée du prix :
            action secondaire, à l'opposé du favori (qui reste en haut de la photo). `-my-1` : le
            rond de 32 px n'élargit pas la rangée d'un prix de 22 px au-delà de 24.
            `md:block` : au bureau, le comparateur est sur la photo et la rangée redevient le bloc
            d'avant — le prix dispose de toute la largeur de la carte. */}
        <div className="flex items-start justify-between gap-2 md:block">
          {/* `flex-wrap` et non `truncate` : à 360 px, « 2 090 000 F CFA /mois » perdait sa
              période (« /m… »), l'information qui distingue un loyer d'un prix. */}
          <p
            data-prix
            className="flex min-w-0 flex-wrap items-baseline gap-x-0.5 text-primary font-bold text-[15px] tabular-nums"
            title={formatPrice(property.price, property.currency ?? 'XOF')}
          >
            <span className="whitespace-nowrap">{formatPrice(property.price, property.currency ?? 'XOF')}</span>
            {property.contract_type === 'rent' && (
              <span className="whitespace-nowrap text-sm font-semibold text-muted-foreground">
                {property.rent_period
                  ? `/${t(`rentPeriodsShort.${property.rent_period}`)}`
                  : // TCK-555 — sans période, « 950 000 F CFA » se lisait comme un prix de vente
                    // (88 locations sur 127 dans les semis, relevé du 2026-09-23). L'espace est
                    // une espace insécable DANS LE TEXTE, et non une marge : un lecteur d'écran
                    // lisait « F CFA· loyer ».
                    `\u00a0${tCards('rentNoPeriod')}`}
              </span>
            )}
          </p>
          {!hideCompare && (
            <div className={`-my-1 shrink-0 md:hidden ${AU_DESSUS_DU_LIEN}`}>
              <CompareToggleButton propertyId={property.id} size="sm" surface="page" preview={apercu} />
            </div>
          )}
        </div>
        <h3
          id={idTitre}
          // TCK-555 — deux lignes réservées pour aligner des cartes VOISINES. Sous `sm`, la liste
          // et les favoris sont à une colonne : un titre d'une ligne y laissait 20 px de vide sous
          // lui, sans rien à aligner. Le carrousel, lui, aligne toujours (`titreSurDeuxLignes`).
          className={`font-display font-semibold text-[14px] leading-snug text-foreground line-clamp-2 ${
            titreSurDeuxLignes === 'toujours' ? 'h-10' : 'sm:h-10'
          } text-pretty`}
          title={property.title}
        >
          {property.title}
        </h3>
        <p
          className="text-muted-foreground text-sm flex items-center gap-1.5 truncate"
          title={location}
        >
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="truncate">{location}</span>
        </p>
        <CardMeta
          className="pt-1 text-xs font-semibold text-muted-foreground"
          items={[
            // TCK-555 — sous `md`, l'état « Neuf » en texte quand la pastille de transaction tient
            // la photo ; au bureau, il est en pastille à côté d'elle, comme avant.
            etatNeuf &&
              !etatEnPastille && { texte: enumLabel(tEtats, conditionValues, etatNeuf), className: 'md:hidden' },
            property.bedrooms != null && property.bedrooms > 0 && tCards('bedroomsAbbrev', { count: property.bedrooms }),
            property.area ? `${property.area} m²` : null,
            property.type && enumLabel(tTypes, propertyTypeValues, property.type),
            // TCK-555 — l'ancienneté reste visible (une vieille annonce est un signal utile), en
            // texte sous `md` : elle y était en surimpression sur la photo. Au bureau, elle y reste.
            timeAgo && { texte: timeAgo, className: 'md:hidden' },
          ]}
        />
      </div>
    </div>
  );
}
