import type { AgencyKind } from './agency';
import type { TagStatus } from './tag';

export type PropertyType =
  | 'apartment' | 'house' | 'villa' | 'studio' | 'room'
  | 'land' | 'office' | 'shop' | 'warehouse' | 'factory'
  | 'farm' | 'hotel' | 'resort' | 'garage' | 'parking' | 'other';

export type ContractType = 'sale' | 'rent';

export type RentPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type PropertyTitleType = 'bail' | 'titre_foncier' | 'deliberation' | 'autre';

/**
 * TCK-508 — l'état DÉCLARÉ d'un bien bâti (`PropertyCondition` côté backend). Sans objet pour la
 * famille foncière (terrain, ferme) : le modèle l'y efface. Seuls `new` et `off_plan` portent un
 * badge public ; les trois autres ne figurent que dans les caractéristiques de la fiche.
 */
export type PropertyCondition = 'off_plan' | 'new' | 'renovated' | 'good' | 'to_renovate';

/**
 * TCK-2637 — l'occupation d'un bien (`include=occupancy`), calculée par `PropertyOccupancy` côté API.
 * Sans droit sur le bail, `lease`, `tenant`, `rent` et `current_month` sont absents (nuls) : seul
 * `state` reste servi.
 *
 * TCK-2638 — `not_rental` : un bien qui n'est pas à louer (`contract_type` ≠ `rent`), ni occupé, ni
 * vacant, ni en préavis. Le bail en cours d'une vente reste servi (`lease`, `tenant`, `current_month`).
 */
export interface OccupationDuBien {
  state: 'occupied' | 'notice' | 'vacant' | 'not_rental';
  /** Fin effective du dernier bail ; `null` pour un bien jamais loué (« Sans locataire ») et pour une vente. */
  vacant_since: string | null;
  lease: {
    id: number;
    reference_number: string | null;
    type: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
  } | null;
  tenant: {
    id: number;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
  rent: {
    amount: number;
    charges: number | null;
    currency: string | null;
    payment_frequency: 'monthly' | 'quarterly' | 'yearly' | null;
  } | null;
  current_month: {
    /** `refunded` : échu, reçu puis remboursé (TCK-2651, décision 18 du porteur). */
    status: 'paid' | 'late' | 'partial' | 'due' | 'none' | 'refunded';
    due_date: string | null;
    days_late: number | null;
    amount_due: number | null;
    late_fee_outstanding: number | null;
  } | null;
}

/**
 * TCK-2637 — `GET /api/properties/portfolio-summary` : les comptes des tuiles, en un appel.
 * TCK-2638 — `for_sale` compte les biens hors location (`filter[occupancy]=not_rental`) :
 * `occupied + vacant + for_sale = total`.
 */
export interface ResumeDuPortefeuille {
  total: number;
  occupied: number;
  vacant: number;
  for_sale: number;
  vacant_over_60_days: number;
  rent_late: number;
  rent_late_amount: number;
  notice: number;
  online: number;
  /**
   * TCK-2638 (lot B) — le mode Annonces : `online + pending_validation + drafts + offline = total`
   * (`filter[listing]`), puis les onglets du bureau « Vendus, loués » (`status=sold,rented`) et
   * « Archivés » (`include_archived=1&status=archived`, compté avec les archivés en toute portée).
   */
  pending_validation: number;
  drafts: number;
  offline: number;
  sold_or_rented: number;
  archived: number;
}

export interface PropertyListItem {
  id: number;
  user_id?: number;
  reference_number: string;
  title: string;
  slug: string;
  price: number;
  currency: string | null;
  type: PropertyType;
  contract_type: ContractType | null;
  rent_period: RentPeriod | null;
  status: string | null;
  visibility: string | null;
  views_count?: number;
  favorites_count?: number;
  location: {
    quarter: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  furnished: boolean;
  featured: boolean;
  /**
   * TCK-508 — `whenHas('condition', …)` côté `PropertyResource` : la clé est ABSENTE du JSON quand
   * `fields[properties]` ne la demande pas, d'où l'optionalité. La recherche publique n'honore pas
   * `fields[]` (cf. `public-search.ts`) : les cartes publiques la reçoivent toujours.
   */
  condition?: PropertyCondition | null;
  main_photo_url: string | null;
  owner?: PropertyOwnerLite | null;
  /**
   * TCK-603 — l'agent responsable (TCK-502/504), à côté du propriétaire. Servie par la liste du
   * tableau de bord seulement quand `agency_id` ET `user_id` sont demandés (sans eux la règle
   * jugerait un bien d'agence comme celui d'un particulier) : clé ABSENTE sinon.
   */
  primary_contact?: PropertyOwnerLite | null;
  /** TCK-603 (verif-603 M2) — d'où vient `primary_contact` ; absente avec lui. */
  primary_contact_source?: PrimaryContactSource | null;
  /** TCK-2637 — servi sur `include=occupancy` seulement : clé ABSENTE sinon. */
  occupancy?: OccupationDuBien | null;
  /** TCK-2637 (ADR-0097) — « En ligne », le prédicat du catalogue ; servi sur `include=online`. */
  is_online?: boolean;
  /**
   * TCK-2678 (ADR-0097 § 5) — pourquoi le bien est hors ligne : des codes (`lib/biens/motifs-hors-ligne`),
   * dans l'ordre d'affichage ; `[]` pour un bien en ligne. Servi sur `include=offlineReasons` seulement.
   */
  offline_reasons?: readonly string[];
  /**
   * TCK-2638 (lot B2) — la fin de la mise en avant payée (`BoostLifecycle`), ISO 8601 ; nulle sans boost,
   * ABSENTE hors de la liste pro (`fields[properties]`, jamais sur la surface publique). « Boostée » =
   * en cours, `sponsored_until` > maintenant (décision du porteur).
   */
  sponsored_until?: string | null;
  collaborators?: {
    id: number;
    user_id: number;
    role: string | null;
    /** TCK-504 — la marque d'agent principal (ADR-0053). */
    is_primary?: boolean;
    /** TCK-2364 (P241.03) — absente pour qui ne fixe pas les parts (le bailleur du bien). */
    commission_share?: number | null;
    user: {
      id: number;
      name: string;
      email: string | null;
    } | null;
  }[];
  published_at: string | null;
  created_at: string;
}

/** Le vocabulaire de `GET …/collaborators` (TCK-504), sans `designated_unavailable`. */
export type PrimaryContactSource = 'designated' | 'invitation_order' | 'owner';

export interface PropertyOwnerLite {
  id: number;
  name: string;
  /** TCK-177 — links the contact card to /agents/[slug] when populated. */
  slug?: string | null;
  avatar_url: string | null;
  is_agent: boolean;
  member_since: string | null;
  /**
   * TCK-590 — le contact a-t-il un numéro ? Un booléen, jamais le numéro : celui-ci n'est révélé
   * qu'au geste (`GET …/contact`, limité). Faux ou absent, la fiche n'offre ni WhatsApp ni Appeler.
   */
  has_phone?: boolean;
  /**
   * TCK-633 (lot C) — au moins un numéro du bien est déclaré WhatsApp. Faux ou absent : aucun
   * bouton WhatsApp sur la fiche.
   */
  has_whatsapp?: boolean;
  /**
   * TCK-598 (V8) — le numéro du contact a-t-il été vérifié ? Un booléen dérivé de
   * `phone_verified_at`, jamais la date ni le numéro. Absent d'une charge utile antérieure : lu
   * comme faux.
   */
  phone_verified?: boolean;
}

/**
 * TCK-598 (V9) — ce qu'un locataire verse pour emménager, calculé par l'API (`CoutDEntree`).
 * `null` hors location mensuelle, et quand rien n'est renseigné : le bloc est alors ABSENT, jamais
 * affiché à zéro. Le front n'additionne rien — `total` fait foi.
 */
export interface PropertyEntryCost {
  deposit_months: number | null;
  advance_months: number | null;
  agency_fee_months: number | null;
  monthly_charges: number | null;
  total: number;
}

export interface PropertyAgencyLite {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  verified: boolean;
  rating: number | null;
  /** TCK-633 — un indépendant (`individual`) ne facture pas de frais d'agence (`PropertyResource`, tâche 13). */
  kind?: AgencyKind;
}

export interface PropertyTag {
  id: number;
  name: string;
  slug: string;
  type: 'amenity' | 'feature' | 'category' | string;
  icon: string | null;
  color: string | null;
  /** TCK-633 — une proposition d'équipement attachée au bien est `pending` (`PropertyResource`, tâche 13). */
  status?: TagStatus;
}

export interface PropertyPhoto {
  id: number;
  thumbnail: string;
  preview: string;
  /**
   * TCK-356 — la plus grande image servie au PUBLIC (jusqu'à 1600 px de large).
   *
   * `preview` plafonne à 800 px : la grande tuile de la fiche en demande 1450 px
   * physiques en DPR 2, la lightbox davantage. Aucun `sizes` ne rattrape une source
   * qui n'existe pas à la bonne taille.
   *
   * `full` est filigranée comme les autres conversions ; le fichier source ne sort
   * qu'à un appelant autorisé, via `original`.
   */
  full: string;
  /**
   * Le fichier source pour qui détient `viewRaw`, sinon `full` (TCK-106).
   * Ce n'est donc PAS l'original pour un visiteur — c'est la plus grande image
   * filigranée qu'on accepte de lui servir.
   */
  original: string;
  order: number;
}

export interface PropertyMediaExtra {
  videos: string[];
  plans: string[];
  virtual_tour_url: string | null;
}

export interface PropertyDocument {
  id: number;
  name: string;
  type: string;
  size: number;
  url: string;
  public: boolean;
}

export interface PropertyPriceHistoryItem {
  id: number;
  old_price: number;
  new_price: number;
  currency: string;
  reason: string | null;
  changed_at: string;
}

export interface PropertyDetail extends PropertyListItem {
  type_label: string;
  contract_type_label: string | null;
  rent_period_label: string | null;
  status_label: string;
  /**
   * TCK-464 — `whenHas('title_type', …)` côté `PropertyResource` : la clé est ABSENTE du JSON,
   * pas nulle, dès qu'elle ne fait pas partie du `fields[properties]` demandé. `COMPARE_FIELDS`
   * (`useCompare.ts`) ne la demande pas — d'où l'optionalité, comme pour `available_from`
   * ci-dessous.
   */
  title_type?: PropertyTitleType | null;
  title_type_label: string | null;
  /** TCK-508 — émis SANS condition par `PropertyResource`, comme `title_type_label`. */
  condition_label: string | null;
  floor_number: number | null;
  total_floors: number | null;
  /**
   * TCK-464 — même défaut que `title_type` : absente du JSON (pas nulle) quand elle n'est pas
   * dans `fields[properties]`. `COMPARE_FIELDS` (`useCompare.ts`) ne la demande pas — d'où
   * l'optionalité. La page d'édition la reçoit du `show`, qui rend la ressource de détail
   * entière (P60.03).
   */
  available_from?: string | null;
  year_built: number | null;
  parking_spaces: number | null;
  views_count: number;
  favorites_count: number;
  average_rating: number | null;
  reviews_count: number;
  description: string | null;
  photos: PropertyPhoto[];
  media_extra: PropertyMediaExtra;
  /**
   * TCK-598 (V19) — l'URL de la visite virtuelle ou de la vidéo, au premier niveau
   * (`media_extra.virtual_tour_url` la reprend pour la compatibilité, puis disparaît). Optionnelle :
   * `whenHas` côté ressource, la clé est absente quand la colonne n'est pas demandée.
   */
  virtual_tour_url?: string | null;
  /** TCK-598 (V9) — cf. {@link PropertyEntryCost}. Émis sur la forme détail. */
  entry_cost?: PropertyEntryCost | null;
  tags: PropertyTag[];
  owner: PropertyOwnerLite;
  /**
   * TCK-502 — **qui répond pour ce bien**, et non qui le possède : le collaborateur `agent` le
   * plus anciennement invité, à défaut le propriétaire. C'est cette personne que la carte de
   * contact doit nommer, parce que c'est elle qui recevra le message, le lead anonyme et l'appel.
   *
   * Clé REQUISE, valeur nullable : un bien sans propriétaire ni agent rend `null`. La différence
   * compte — une clé absente signalerait un endpoint qui ne charge pas ce qu'il faut, une valeur
   * nulle signale un bien sans contact.
   */
  primary_contact: PropertyOwnerLite | null;
  /**
   * TCK-603 (ADR-0059 §6, verif-603 M2) — d'où vient `primary_contact` : la ligne `agent` marquée
   * (`designated`), le repli sur l'ordre d'invitation (`invitation_order`), sur le titulaire (`owner`),
   * ou personne (`null`). Absente sur les routes publiques : optionnelle.
   */
  primary_contact_source?: PrimaryContactSource | null;
  agency: PropertyAgencyLite | null;
  documents: PropertyDocument[];
  price_history: PropertyPriceHistoryItem[];
  location: {
    full: string;
    street: string | null;
    quarter: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    postal_code: string | null;
    latitude: number | null;
    longitude: number | null;
    /** TCK-633 — les identifiants du référentiel (ADR-0062), `null` hors référentiel. */
    geo_city_id?: number | null;
    geo_neighborhood_id?: number | null;
  };
  /**
   * TCK-335 — champs de modération : l'API ne les émet que pour un appelant
   * AUTHENTIFIÉ (`PropertyResource`, `$request->user() !== null`). Un visiteur
   * anonyme reçoit une charge utile où les quatre clés sont **absentes**, pas
   * nulles — d'où l'optionalité. Le tableau de bord agent, lui, est rendu
   * depuis une session : il continue de les recevoir.
   */
  rejection_reason?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  /**
   * TCK-999 — les gestes que la fiche pro offre à l'appelant, émis sur `properties.show` seulement
   * (absents ailleurs) : `transfer_owner`, « Changer le titulaire » (l'admin de l'agence, sur un bien
   * que le personnel tient encore).
   */
  abilities?: { transfer_owner?: boolean };
  /**
   * TCK-1000 (P15.06, Q2) — le bailleur invité pour qui le bien a été saisi, tant que l'invitation
   * court. Émis sur `properties.show` au seul personnel de l'agence du bien.
   */
  pending_owner?: { profile_id: number; name: string } | null;
  /**
   * TCK-2639 — le profil de bailleur du titulaire dans l'agence du bien (`/app/owners/{id}`), rendu à
   * qui en ouvre la fiche (l'admin actif de l'agence) ; nul pour tout autre appelant.
   */
  owner_profile_id?: number | null;
}

export interface PaginatedProperties {
  data: PropertyListItem[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

/**
 * Response shape for `GET /api/public/properties/compare?ids=...` (TCK-082).
 * The backend returns a subset of `PropertyDetail` — enough to render a
 * side-by-side comparison table.
 */
export interface PropertyCompareResponse {
  data: PropertyDetail[];
  meta: {
    requested_ids: number[];
    returned_ids: number[];
  };
}

/**
 * Response shape for `GET /api/public/properties/discovery` (TCK-247) — the
 * four homepage rows in a single round-trip, already deduplicated server-side
 * (`featured` excepted: it is a curated row and may overlap the others).
 */
export interface HomepageDiscoveryRow {
  items: PropertyListItem[];
}

export interface HomepageDiscoveryNearRow extends HomepageDiscoveryRow {
  /**
   * The city the row actually contains, spelled as the catalogue spells it —
   * NOT as the visitor's geolocation spelled it. This is what the row title
   * prints.
   */
  city: string;
  /** The city guessed for the visitor, `null` when we had no idea where they are. */
  requested_city: string | null;
  /**
   * `true` when the visitor's city held too few listings and the row switched
   * wholesale to `city`. The title must say so — a row headed « Près de toi ·
   * à Ziguinchor » full of Dakar listings is simply false. Never `true` when
   * `requested_city` is `null`: not knowing is the nominal default, not a
   * fallback.
   */
  fallback: boolean;
}

export interface HomepageDiscoveryData {
  near: HomepageDiscoveryNearRow;
  rent: HomepageDiscoveryRow;
  featured: HomepageDiscoveryRow;
  latest: HomepageDiscoveryRow;
}

export interface HomepageDiscoveryResponse {
  data: HomepageDiscoveryData;
  meta: { per_row: number };
}
