<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\TitleType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;
use Laravel\Scout\Searchable;
use Spatie\Image\Enums\Fit;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Spatie\QueryBuilder\AllowedFilter;

class Property extends AbstractModel implements HasMedia
{
    use Auditable, HasFactory, InteractsWithMedia, Searchable, SoftDeletes;

    protected $fillable = [
        'user_id', 'agency_id', 'parent_id', 'reference_number',
        'title', 'slug', 'description',
        'type', 'contract_type', 'rent_period', 'title_type', 'status', 'visibility',
        'price', 'currency',
        'area', 'bedrooms', 'bathrooms', 'furnished',
        'floor_number', 'total_floors', 'year_built', 'parking_spaces',
        'featured', 'lot_position', 'level', 'admin_monitored', 'is_test',
        'available_from', 'published_at', 'archived_at', 'metadata',
        'rejection_reason', 'submitted_at', 'approved_at', 'rejected_at',
        'approved_by_user_id', 'rejected_by_user_id',
    ];

    protected $casts = [
        'type' => PropertyType::class,
        'contract_type' => ContractType::class,
        'rent_period' => RentPeriod::class,
        'title_type' => TitleType::class,
        'status' => PropertyStatus::class,
        'visibility' => PropertyVisibility::class,
        'currency' => Currency::class,
        'price' => 'decimal:2',
        'average_rating' => 'decimal:2',
        'furnished' => 'boolean',
        'featured' => 'boolean',
        'level' => 'integer',
        'admin_monitored' => 'boolean',
        'is_test' => 'boolean',
        'available_from' => 'date',
        'published_at' => 'datetime',
        'archived_at' => 'datetime',
        'submitted_at' => 'datetime',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
        'metadata' => 'array',
    ];

    /** @var array<int,string> */
    protected static array $requestFilterable = [
        'user_id', 'agency_id', 'type', 'contract_type', 'rent_period',
        'status', 'visibility', 'title_type', 'price', 'bedrooms', 'bathrooms',
        'area', 'currency', 'featured', 'furnished', 'published_at',
    ];

    /** @var array<int,string> */
    protected static array $requestSortable = [
        'id', 'title', 'created_at', 'published_at', 'price', 'views_count', 'area', 'bedrooms', 'bathrooms', 'featured',
    ];

    /** @var array<int,string> */
    protected static array $requestLoadable = [
        'address', 'agency', 'owner', 'tags', 'children', 'parent', 'collaborators',
    ];

    /** @var array<int,string> */
    protected static array $requestCountable = [
        'bookings', 'leases', 'visits', 'reviews', 'children',
    ];

    /** @var array<int,string> */
    protected static array $requestRangeFilters = ['price', 'area'];

    /** @var array<int,string> */
    protected static array $requestSearchFields = ['title', 'reference_number', 'description'];

    /** @var array<int,string> */
    protected static array $queryFields = [
        'id', 'user_id', 'agency_id', 'parent_id', 'reference_number',
        'title', 'slug', 'type', 'contract_type', 'rent_period', 'title_type', 'status', 'visibility',
        'price', 'currency', 'area', 'bedrooms', 'bathrooms', 'furnished',
        'floor_number', 'total_floors', 'year_built', 'parking_spaces', 'featured',
        'views_count', 'favorites_count', 'available_from', 'published_at', 'created_at', 'updated_at',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->slug)) {
                $m->slug = Str::slug($m->title).'-'.Str::random(6);
            }
            if (empty($m->reference_number)) {
                $m->reference_number = 'TK-'.now()->format('Y').'-'.strtoupper(Str::random(6));
            }
        });

        // Invariant: a rental listing must always carry a billing period.
        // If contract_type=rent but rent_period is missing/cleared, default
        // to monthly — the most common rental cadence in the local market.
        static::saving(function (self $m) {
            if ($m->contract_type === ContractType::Rent && $m->rent_period === null) {
                $m->rent_period = RentPeriod::Monthly;
            }
        });

        // TCK-086 — soft-cascade: detach children when the parent is (soft-)deleted.
        // Hard deletes also flow through this hook before the FK ON DELETE SET NULL fires.
        static::deleting(function (self $m) {
            $m->children()->update(['parent_id' => null]);
        });
    }

    /**
     * French search aliases per property type — indexed as `type_label` so a
     * French type term (e.g. "appartement") matches the English enum value
     * (`apartment`). Meilisearch typo-tolerance then covers misspellings.
     *
     * @var array<string,string>
     */
    public const TYPE_SEARCH_ALIASES = [
        'land' => 'terrain',
        'house' => 'maison',
        'apartment' => 'appartement',
        'villa' => 'villa',
        'studio' => 'studio',
        'room' => 'chambre',
        'office' => 'bureau',
        'shop' => 'boutique magasin commerce',
        'warehouse' => 'entrepot',
        'factory' => 'usine',
        'farm' => 'ferme',
        'hotel' => 'hotel',
        'resort' => 'resort',
        'garage' => 'garage',
        'parking' => 'parking',
        'other' => 'autre',
    ];

    /**
     * Alias de recherche français par type de CONTRAT — indexés dans
     * `contract_label` (TCK-335, étape 8), sur le modèle strict de
     * {@see TYPE_SEARCH_ALIASES} : un mot d'INTENTION écrit en français
     * atteint un bien dont la colonne dit `rent` / `sale`.
     *
     * ⚠ **Ce n'est délibérément pas un synonyme Meilisearch, et c'est mesuré.**
     * Un synonyme réécrit un terme de REQUÊTE en un autre terme de requête ; il
     * ne crée pas un mot absent de l'index. Or « vendre » et « vente »
     * n'apparaissaient dans le texte d'AUCUN bien du catalogue public
     * (mesuré le 2026-08-21 : `q=vente` → 0, `q=vendre` → 0, pour 54 biens en
     * `contract_type=sale`) : déclarer `vente => vendre` aurait fait passer
     * `q=vente` de 0 à 0. Poser `synonyms` aurait en outre installé un SECOND
     * mécanisme parallèle à ces tables d'alias, exactement le défaut que
     * `scripts/check-filtering-single-mechanism.mjs` existe pour refuser
     * ailleurs. Note d'exploitation qui achève le débat : `PATCH /settings`
     * n'efface PAS une clé retirée de la configuration — un synonyme posé une
     * fois ne se retire plus de la production.
     *
     * Les jetons sont DÉDUPLIQUÉS : « à louer » et « à vendre » sont couverts
     * sans les écrire, parce que « à » est un mot vide (`stopWords`,
     * `config/scout.php`) et que le mot restant est présent. Un jeton répété
     * dans un champ indexé ne change rien au filtrage Meilisearch.
     *
     * @var array<string,string>
     */
    public const CONTRACT_SEARCH_ALIASES = [
        'rent' => 'louer location bail loyer',
        'sale' => 'vendre vente achat acheter',
    ];

    /**
     * Vocabulaire d'ameublement — indexé dans `furnished_label` quand, et
     * seulement quand, `furnished` est vrai (TCK-335, étape 8).
     *
     * Ce champ est le SEUL chemin possible du mot « meublé » vers les biens
     * meublés : ni un synonyme, ni {@see TYPE_SEARCH_ALIASES}, ni des tags
     * searchable ne peuvent y mener. Et parce qu'il est DÉRIVÉ de la colonne,
     * il ne peut pas la contredire — au contraire du gabarit de titre qui
     * disait « meublé » sur 12 biens `furnished = false`
     * (cf. `database/seeders/Support/SenegalFakerProvider.php`).
     *
     * Sans accents : Meilisearch normalise à l'indexation comme à la requête,
     * `q=meublé` et `q=meuble` rendent déjà le même ensemble.
     */
    public const FURNISHED_SEARCH_LABEL = 'meuble equipe';

    /**
     * Alias de recherche WOLOF par type de bien — TABLE VOLONTAIREMENT VIDE
     * (TCK-339). Chaque valeur d'enum y a sa clé ; aucune n'a de valeur.
     *
     * ⚠ **Ne remplir qu'après validation par un locuteur wolophone.** Le mot
     * qu'on écrit ici n'est pas un libellé, c'est un CRITÈRE DE RAPPEL : un
     * faux ami indexé rend des résultats, donc il a l'air de marcher. C'est
     * mesuré sur les libellés d'affichage existants, qui ne sont PAS
     * réutilisables tels quels — `land => 'Dëkk'` (village) et
     * `farm => 'Jën'` (poisson) dans `lang/wo/properties.php` — et c'est la
     * raison d'être de cette table séparée.
     *
     * La séance de validation se prépare avec `php artisan search:wolof-review-sheet`,
     * qui imprime pour chaque ligne l'alias français en vigueur, les DEUX
     * libellés wolof existants (back et front) et le nombre de biens que le
     * mot atteint DÉJÀ dans l'index. Cette dernière colonne attrape le risque
     * qu'aucune revue lexicale ne peut voir : la collision de CORPUS. Mesuré
     * le 2026-08-21 sur `takussan_localproperties` (795 documents), `keur`
     * rend **40** résultats — non pas parce que le mot est indexé comme
     * vocabulaire, mais parce que le quartier « Cité Keur Gorgui » existe.
     * Poser `house => 'keur'` ne se verrait donc pas : la requête rendrait des
     * biens avant comme après, et pas les mêmes.
     *
     * Trois faits mesurés le 2026-08-21 qui gouvernent l'écriture des valeurs :
     *  - **Les diacritiques sont normalisés**, à l'indexation comme à la
     *    requête : `q=mëublé` et `q=meuble` rendent le même ensemble (319).
     *    `ë`, `ï`, `é` se ramènent à la lettre nue. Écrire l'alias sans
     *    diacritique n'ampute donc rien — et l'écrire avec ne protège de rien.
     *  - **`oneTypo` est à 5 caractères** (relevé sur l'index vivant) : sous
     *    5 lettres, la tolérance aux fautes est NULLE. `q=ker` ne rend pas
     *    `Keur` (0 contre 40). Un alias de 3 ou 4 lettres — et le wolof en
     *    compte beaucoup — n'a droit à aucune approximation.
     *  - **Un jeton se sépare par une espace**, plusieurs jetons sont permis
     *    par clé, et un jeton répété ne change rien au filtrage.
     *
     * Le champ de destination est `type_label`, celui que TCK-335 a déjà
     * installé — délibérément, et pas un champ neuf : un champ neuf forcerait
     * une édition de `searchableAttributes`, donc un réimport de tous les
     * modèles, et rouvrirait la question de l'ORDRE que TCK-335 a mesurée.
     *
     * @var array<string,string>
     */
    public const TYPE_SEARCH_ALIASES_WO = [
        'land' => '',
        'house' => '',
        'apartment' => '',
        'villa' => '',
        'studio' => '',
        'room' => '',
        'office' => '',
        'shop' => '',
        'warehouse' => '',
        'factory' => '',
        'farm' => '',
        'hotel' => '',
        'resort' => '',
        'garage' => '',
        'parking' => '',
        'other' => '',
    ];

    /**
     * Alias de recherche WOLOF par type de CONTRAT — TABLE VOLONTAIREMENT VIDE
     * (TCK-339), concaténée dans `contract_label`. Mêmes règles que
     * {@see TYPE_SEARCH_ALIASES_WO}.
     *
     * ⚠ **Le piège est ici plus profond qu'ailleurs, et il est déjà réalisé
     * dans les libellés d'affichage** : `lang/wo/properties.php` traduit
     * `sale => 'Jënd'`, qui signifie *acheter*, tandis que
     * `takussan-web/src/messages/wo.json` traduit le même `sale => 'Njaay'`,
     * qui signifie *vente*. Deux mots, deux sens, la même colonne.
     *
     * ⚠⚠ Cela **n'interdit pas** d'indexer un mot d'achat sur un bien en
     * vente : {@see CONTRACT_SEARCH_ALIASES} le fait déjà en français, et
     * c'est délibéré (TCK-335) — `q=acheter` rend 54 biens en vente, mesuré,
     * parce qu'un acheteur cherche avec le verbe de SON intention. La règle
     * n'est pas « pas de verbe d'achat » mais « le verbe doit désigner
     * l'intention que le contrat sert ». Un mot d'achat sur un bien en
     * LOCATION serait la faute ; sur un bien en vente, c'est le but.
     *
     * @var array<string,string>
     */
    public const CONTRACT_SEARCH_ALIASES_WO = [
        'sale' => '',
        'rent' => '',
    ];

    /**
     * Statuses excluded from the public search index filter — mirror of
     * {@see scopePublic()}. A property indexed by {@see shouldBeSearchable()}
     * but in one of these statuses must not surface on the public endpoint.
     *
     * @var array<int,string>
     */
    public const NON_PUBLIC_STATUSES = [
        'draft', 'sold', 'rented', 'archived',
        'under_maintenance', 'unavailable', 'pending_review', 'rejected',
    ];

    /**
     * Concatène l'alias français et l'alias wolof d'une même clé d'enum en UN
     * SEUL jeton de champ (TCK-339).
     *
     * Contrat, et c'est ce que verrouille `PropertySearchableArrayTest` : tant
     * que la table wolof est vide, la valeur rendue est **identique à la chaîne
     * près** à ce que rendait l'accès direct au tableau français. Le mécanisme
     * est donc posé à vide — aucun document ne change, aucun réimport n'est dû.
     * Les valeurs vides sont écartées AVANT la jointure : une table vide ne
     * produit pas d'espace de fin, qui déclencherait un diff de document sur
     * les 795 documents pour rien.
     *
     * `static::` et non `self::` : la liaison tardive est ce qui permet à un
     * double de test de redéclarer les constantes et de PROUVER que le chemin
     * de concaténation existe vraiment. Sans elle, la seule preuve disponible
     * serait « rien n'a changé », qu'une implémentation qui ignore purement la
     * table wolof cocherait tout aussi bien.
     *
     * @param  array<string,string>  $aliasesFr
     * @param  array<string,string>  $aliasesWo
     */
    protected static function joinSearchAliases(array $aliasesFr, array $aliasesWo, ?string $key): string
    {
        if ($key === null) {
            return '';
        }

        $parts = array_filter(
            [trim($aliasesFr[$key] ?? ''), trim($aliasesWo[$key] ?? '')],
            static fn (string $part): bool => $part !== '',
        );

        return implode(' ', $parts);
    }

    public function toSearchableArray(): array
    {
        $address = $this->address;

        $data = [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'reference_number' => $this->reference_number,
            'type_label' => static::joinSearchAliases(static::TYPE_SEARCH_ALIASES, static::TYPE_SEARCH_ALIASES_WO, $this->type?->value),
            // TCK-335 — deux champs DÉRIVÉS, jamais saisis. Leur POSITION dans
            // `searchableAttributes` (config/scout.php) est une règle de
            // classement, et elle est mesurée : ils y sont EN DERNIER.
            'contract_label' => static::joinSearchAliases(static::CONTRACT_SEARCH_ALIASES, static::CONTRACT_SEARCH_ALIASES_WO, $this->contract_type?->value),
            'furnished_label' => $this->furnished ? self::FURNISHED_SEARCH_LABEL : '',
            'type' => $this->type?->value,
            'contract_type' => $this->contract_type?->value,
            'rent_period' => $this->rent_period?->value,
            'status' => $this->status?->value,
            'visibility' => $this->visibility?->value,
            'price' => $this->price !== null ? (float) $this->price : null,
            'bedrooms' => $this->bedrooms,
            'bathrooms' => $this->bathrooms,
            'area' => $this->area,
            'furnished' => (bool) $this->furnished,
            'floor_number' => $this->floor_number,
            'featured' => (bool) $this->featured,
            'is_test' => (bool) $this->is_test,
            'agency_id' => $this->agency_id,
            'user_id' => $this->user_id,
            'available_from' => $this->available_from?->timestamp,
            'published_at' => $this->published_at?->timestamp,
            'created_at' => $this->created_at?->timestamp,
            'city' => $address?->city,
            'neighborhood' => $address?->neighborhood,
            'tags' => $this->tags->pluck('name')->all(),
        ];

        if ($address && $address->latitude !== null && $address->longitude !== null) {
            $data['_geo'] = [
                'lat' => (float) $address->latitude,
                'lng' => (float) $address->longitude,
            ];
        }

        return $data;
    }

    /**
     * Eager-load the relations {@see toSearchableArray()} needs so a
     * `scout:import` of the whole table avoids an N+1 per document.
     *
     * @param  Builder<Property>  $query
     * @return Builder<Property>
     */
    protected function makeAllSearchableUsing(Builder $query): Builder
    {
        return $query->with('address', 'tags');
    }

    public function shouldBeSearchable(): bool
    {
        return ! $this->trashed()
            && $this->visibility === PropertyVisibility::Public
            && ! in_array($this->status, [
                PropertyStatus::Draft,
                PropertyStatus::PendingReview,
                PropertyStatus::Rejected,
            ], true);
    }

    public function scopePublic(Builder $query): Builder
    {
        return $query->where('visibility', PropertyVisibility::Public)
            ->where('is_test', false)
            ->whereNotNull('published_at')
            ->whereNotIn('status', [
                PropertyStatus::Draft,
                PropertyStatus::Sold,
                PropertyStatus::Rented,
                PropertyStatus::Archived,
                PropertyStatus::UnderMaintenance,
                PropertyStatus::Unavailable,
                PropertyStatus::PendingReview,
                PropertyStatus::Rejected,
            ]);
    }

    public function scopeAvailable(Builder $query): Builder
    {
        return $query->where('status', PropertyStatus::Available);
    }

    /**
     * Le PORTEFEUILLE PUBLIC d'un profil — TCK-436.
     *
     * ────────────────────────────────────────────────────────────────────────────────────────────
     * POURQUOI IL COMPOSE LES DEUX SCOPES AU LIEU DE RÉÉCRIRE UN PRÉDICAT
     * ────────────────────────────────────────────────────────────────────────────────────────────
     *
     * Trois prédicats « ce bien est public » coexistaient dans ce dépôt le 2026-08-27, et ils ne
     * désignent pas le même ensemble :
     *
     *   1. {@see scopePublic()} — `visibility=public`, `is_test=false`, `published_at` non nul,
     *      huit statuts exclus. C'est ce que servent `/public/properties` et le sitemap de
     *      TCK-431. Il ADMET donc `pending` et `published` en plus d'`available`.
     *   2. `status=available` + `visibility=public`, écrit à la main quatre fois dans
     *      `PublicAgencyController` et `PublicAgentController` — c'est ce que les fiches
     *      `/agencies/{slug}` et `/agents/{slug}` AFFICHENT réellement.
     *   3. {@see isPubliclyVisible()}, un troisième découpage encore, sur l'instance.
     *
     * L'index public de TCK-436 doit satisfaire les DEUX premiers à la fois, et l'intersection est
     * la seule réponse qui ne mente pas :
     *
     * · plus étroit que (1) ⇒ tout profil listé a une place légitime au sitemap ;
     * · plus étroit que (2) ⇒ **un profil listé a un portefeuille non vide sur sa propre fiche.**
     *   Un index qui annoncerait « 3 biens » et mènerait à une fiche vide est le défaut que ce
     *   ticket existe pour ne pas produire.
     *
     * Elle est COMPOSÉE et non recopiée : le jour où `scopePublic()` change, ce scope suit. Une
     * quatrième liste de statuts écrite ici serait la divergence de demain.
     */
    public function scopePublicPortfolio(Builder $query): Builder
    {
        return $query->public()->available();
    }

    public function scopeRoots(Builder $query): Builder
    {
        return $query->whereNull('parent_id');
    }

    /**
     * @return array<int, AllowedFilter>
     */
    protected static function getAllowedQueryFilters(): array
    {
        $filters = parent::getAllowedQueryFilters();

        $filters[] = AllowedFilter::callback('parent_id', function (Builder $q, mixed $value): void {
            $isNull = $value === null
                || $value === ''
                || (is_string($value) && strtolower($value) === 'null');

            if ($isNull) {
                $q->whereNull('parent_id');

                return;
            }

            if (is_array($value)) {
                $q->whereIn('parent_id', $value);

                return;
            }

            $q->where('parent_id', $value);
        });

        $filters[] = AllowedFilter::callback('city', function (Builder $q, mixed $value): void {
            $city = trim((string) $value);
            if ($city === '') {
                return;
            }

            $q->whereHas('address', fn (Builder $address) => $address->where('city', 'like', '%'.$city.'%'));
        });

        $filters[] = AllowedFilter::callback('created_from', function (Builder $q, mixed $value): void {
            if ($value !== null && $value !== '') {
                $q->whereDate('created_at', '>=', (string) $value);
            }
        });

        $filters[] = AllowedFilter::callback('created_to', function (Builder $q, mixed $value): void {
            if ($value !== null && $value !== '') {
                $q->whereDate('created_at', '<=', (string) $value);
            }
        });

        return $filters;
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos')
            ->acceptsMimeTypes(['image/jpeg', 'image/png', 'image/webp']);

        $this->addMediaCollection('videos')
            ->acceptsMimeTypes(['video/mp4', 'video/webm', 'video/quicktime']);

        $this->addMediaCollection('plans')
            ->acceptsMimeTypes(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    }

    /**
     * TCK-356 — la liste UNIQUE des conversions de `photos` à filigraner.
     *
     * Elle vaut « toutes les conversions déclarées ci-dessous », et pas un
     * sous-ensemble : `PropertyResource::originalUrlFor()` sert la plus grande
     * d'entre elles à tout appelant sans `viewRaw` (TCK-106). Une conversion
     * absente de cette liste part donc au public SANS filigrane.
     *
     * Elle était écrite en dur à deux endroits — `ApplyWatermarkOnConversionListener`
     * et `RegenerateAgencyWatermarksJob` — qui devaient dire la même chose sans que
     * rien ne l'impose. `PropertyMediaConversionsTest` compare désormais cette liste
     * aux conversions réellement enregistrées : ajouter l'une sans l'autre est rouge.
     *
     * @return list<string>
     */
    public static function watermarkedConversions(): array
    {
        return ['thumbnail', 'preview', 'full'];
    }

    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('thumbnail')->width(300)->height(300)->nonQueued();
        $this->addMediaConversion('preview')->width(800)->height(600)->nonQueued();

        // TCK-356 — `full` est le PLAFOND PUBLIC, pas un confort : le fichier source
        // n'est servi qu'au détenteur de `viewRaw`. 800 px ne couvraient que 33 % de
        // la grande tuile de la fiche en DPR 2.
        //
        // ⚠ `Fit::Max` et non `->width(1600)` : mesuré, `width()` AGRANDIT. Une source
        // de 800 px rendait un `full` de 1600 px — deux fois le poids pour zéro détail,
        // et le parc local (des vignettes de seed de 128 px) aurait été régénéré en
        // placards de 1600 px. `Fit::Max` = `PreserveAspectRatio` + `DoNotUpsize`
        // (`Spatie\Image\Enums\Fit::calculateSize`). Hauteur laissée nulle : elle vaut
        // alors celle de la source, donc seule la largeur contraint et rien n'est
        // recadré — les photos de biens n'ont pas un ratio unique.
        //
        // Le plafond public vaut donc `min(1600, largeur de la source)`.
        $this->addMediaConversion('full')->fit(Fit::Max, 1600)->nonQueued();
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function address(): MorphOne
    {
        return $this->morphOne(Address::class, 'addressable');
    }

    public function tags(): MorphToMany
    {
        return $this->morphToMany(Tag::class, 'taggable');
    }

    public function collaborators(): HasMany
    {
        return $this->hasMany(PropertyCollaborator::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function leases(): HasMany
    {
        return $this->hasMany(Lease::class);
    }

    public function visits(): HasMany
    {
        return $this->hasMany(PropertyVisit::class);
    }

    public function reviews(): MorphMany
    {
        return $this->morphMany(Review::class, 'reviewable');
    }

    public function priceHistory(): HasMany
    {
        return $this->hasMany(PropertyPriceHistory::class)->latest('changed_at');
    }

    public function maintenanceRequests(): HasMany
    {
        return $this->hasMany(MaintenanceRequest::class);
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }

    public function favorites(): HasMany
    {
        return $this->hasMany(Favorite::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by_user_id');
    }
}
