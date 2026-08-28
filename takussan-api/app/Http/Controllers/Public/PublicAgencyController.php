<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Public\IndexPublicProfilesRequest;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\ReviewResource;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Services\Public\PublicProfileFacts;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * TCK-177 + TCK-276 — public agency profile.
 *
 * `GET /api/public/agencies/{slug}` returns the agency contact card,
 * its agents (enriched with specialty + portfolio_count), the public
 * portfolio, derived stats, and approved reviews.
 */
class PublicAgencyController extends Controller
{
    /**
     * L'INDEX PUBLIC DES AGENCES — TCK-436.
     *
     * `GET /api/public/agencies?filter[search]=…&filter[city]=…&sort=…&page=…&per_page=…`
     *
     * ────────────────────────────────────────────────────────────────────────────────────────────
     * 1. CE QUE « PRÉSENCE PUBLIQUE » VEUT DIRE, ET POURQUOI C'EST ÉCRIT ICI
     * ────────────────────────────────────────────────────────────────────────────────────────────
     *
     * Une agence entre dans l'index si **elle est active** et si **elle publie au moins un bien
     * visible publiquement** — {@see Property::scopePublicPortfolio()}, qui est l'INTERSECTION du
     * prédicat du sitemap et de celui que sa propre fiche affiche.
     *
     * Les deux conditions se justifient par ce qu'elles empêchent, pas par ce qu'elles décrivent :
     *
     * · **le statut** — l'index est un annuaire indexable ; y annoncer une agence suspendue, c'est
     *   la recommander. C'est le pendant strict du `status=active` que
     *   {@see PublicAgentController::show()} applique déjà aux personnes.
     * · **le portefeuille** — une agence sans aucune annonce mène à une fiche vide. *Un index qui
     *   promet un portefeuille et livre un écran vide est pire qu'une agence absente de l'index :
     *   le visiteur a cliqué.*
     *
     * ⚠ La condition de statut est **plus stricte que celle de `show()`**, qui sert n'importe
     * quelle agence par son slug quel que soit son statut. L'écart est délibéré et va dans le seul
     * sens sûr : une agence peut être joignable par un lien qu'on lui a donné sans être
     * *recommandée* par un annuaire. L'inverse — lister ce que la fiche refuserait — serait le
     * défaut.
     *
     * ────────────────────────────────────────────────────────────────────────────────────────────
     * 2. AUCUN CHAMP DE CONTACT, ET C'EST LE CŒUR DE LA FORME DE SORTIE
     * ────────────────────────────────────────────────────────────────────────────────────────────
     *
     * `show()` publie `email` et `phone` de l'agence, une fiche à la fois. L'index n'en publie
     * **aucun**, et pas davantage la moindre coordonnée d'un membre d'équipe.
     *
     * La raison n'est pas que l'adresse d'une agence serait secrète — c'est qu'un index PAGINÉ,
     * ANONYME et FILTRABLE transforme une donnée consultable en donnée MOISSONNABLE : c'est
     * exactement ce que le retrait de l'e-mail personnel dans `show()` ci-dessous appelle un
     * *« turnkey harvesting vector »*, et ce que TCK-441 vient de retirer de la fiche d'agent. Le
     * ticket l'exige en toutes lettres ; un test le vérifie sur la charge sérialisée ENTIÈRE et
     * non champ par champ — `tests/Feature/Public/PublicProfileIndexTest.php`.
     *
     * ⚠ Il est écrit comme un CHEMIN DE FICHIER, jamais comme un nom de classe qualifié. Le fixer
     * `fully_qualified_strict_types` de Pint promeut un tel nom, même dans un docblock, en import
     * réel — mesuré deux fois sur ce fichier le 2026-08-28. Un import de l'espace de noms des
     * tests depuis `app/` désigne une classe d'`autoload-dev`, absente sous
     * `composer install --no-dev` ; `scripts/check-deps-dev-atteignables.mjs` l'a attrapé les deux
     * fois. *Un renvoi de commentaire promu en import est une 500 en production, écrite par un
     * formateur de code.*
     *
     * Le second demi-verrou est le plafond de `per_page`
     * ({@see IndexPublicProfilesRequest::PER_PAGE_MAX}) : `PublicPropertyController::index()` n'en
     * a aucun, et une route qui énumère des personnes ne peut pas se le permettre.
     *
     * ────────────────────────────────────────────────────────────────────────────────────────────
     * 3. `QueryBuilder::for()` DIRECTEMENT, ET NON `Agency::buildQuery()`
     * ────────────────────────────────────────────────────────────────────────────────────────────
     *
     * `buildQuery()` monte la configuration DÉCLARÉE SUR LE MODÈLE, taillée pour la console :
     * `$requestFilterable` y ouvre `filter[status]`, `$queryFields` expose `commission_rate` et
     * `settings`, `$requestSearchFields` route `filter[search]` vers Meilisearch — donc vers
     * `email` et `license_number` indexés. Sur une route anonyme, hériter d'une liste blanche
     * écrite pour un autre public est la manière la plus ordinaire de fuiter : *une liste blanche
     * n'est blanche que relativement à l'appelant pour lequel on l'a écrite.*
     *
     * L'allowlist ci-dessous est donc écrite pour CE public, et le précédent existe déjà dans le
     * dépôt (`AuditLogController`, `CrossTenantAuditController`).
     *
     * ⚠ La recherche est en SQL et non via Scout, délibérément : TCK-436 range Meilisearch en hors
     * périmètre, et un index qui dépend de la fraîcheur d'un index externe rendrait des résultats
     * différents de ceux que la base contient.
     *
     * ────────────────────────────────────────────────────────────────────────────────────────────
     * 4. L'ORDRE EST TOTAL — la leçon de pagination de TCK-431
     * ────────────────────────────────────────────────────────────────────────────────────────────
     *
     * `portfolio_count` et `name` ne départagent pas toutes les lignes. Sous PostgreSQL, deux
     * pages successives d'un tri non total peuvent rendre deux fois la même ligne et jamais une
     * autre, **sans que rien ne rougisse**. `->orderBy('agencies.id')` est appliqué APRÈS
     * `allowedSorts()`/`defaultSort()` — spatie applique les tris immédiatement (mesuré :
     * `SortsQuery::allowedSorts()` appelle `addRequestedSortsToQuery()` avant de rendre) — donc il
     * arrive en dernière position du `ORDER BY` et ne change jamais le tri demandé.
     */
    public function index(IndexPublicProfilesRequest $request): JsonResponse
    {
        $base = Agency::query()
            ->where('agencies.status', AgencyStatus::Active)
            ->whereHas('properties', fn (Builder $q) => $q->publicPortfolio())
            // `withCount` produit une sous-requête corrélée nommée : c'est ce qui rend
            // `sort=-portfolio_count` possible sans jointure ni `GROUP BY` sur la page.
            ->withCount(['properties as portfolio_count' => fn (Builder $q) => $q->publicPortfolio()]);

        if (($ville = $request->ville()) !== null) {
            $base->whereHas('properties', fn (Builder $q) => $q->publicPortfolio()
                ->whereHas('address', fn ($a) => $a->whereRaw(
                    CaseInsensitive::sql('city').' = ?',
                    [CaseInsensitive::fold($ville)],
                )));
        }

        $agences = QueryBuilder::for($base, $request)
            ->allowedFilters(
                AllowedFilter::callback('search', function (Builder $q, mixed $valeur) {
                    if (! is_string($valeur) || trim($valeur) === '') {
                        return;
                    }
                    // ⚠ `CaseInsensitive::sql()` et `::fold()` VONT PAR PAIRE : `lower()` nu
                    // sous `--locale=C` ne replie que l'ASCII, et `strtolower()` de PHP non
                    // plus (ADR-0025). Replier d'un seul côté déplacerait le défaut.
                    $q->whereRaw(
                        CaseInsensitive::sql('agencies.name').' LIKE ?',
                        ['%'.CaseInsensitive::fold(trim($valeur)).'%'],
                    );
                }),
                // `filter[city]` est appliqué sur `$base` ci-dessus et non ici : il porte sur une
                // relation MORPHE de la relation `properties`, que `AllowedFilter` ne sait pas
                // exprimer. Il est déclaré quand même — sans quoi spatie lève
                // `InvalidFilterQuery` sur un paramètre que l'endpoint honore pourtant.
                AllowedFilter::callback('city', fn () => null),
            )
            ->allowedSorts('portfolio_count', 'name')
            ->defaultSort('-portfolio_count')
            ->orderBy('agencies.id')
            ->with(['addresses', 'media'])
            ->paginate($request->tailleDePage())
            ->withQueryString();

        $ids = $agences->getCollection()->map(fn (Agency $a) => (int) $a->id)->all();
        $portefeuilles = PublicProfileFacts::portefeuilles('agency_id', $ids);
        $avis = PublicProfileFacts::avis(Agency::class, $ids);

        $data = $agences->getCollection()->map(function (Agency $agence) use ($portefeuilles, $avis) {
            $portefeuille = $portefeuilles[(int) $agence->id];

            return [
                'id' => $agence->id,
                'slug' => $agence->slug,
                'name' => $agence->name,
                // ⚠ **`description` n'est PAS servi ici, et c'est le test d'AC3 qui l'a tranché.**
                // C'est du texte libre saisi par l'agence, et la garde de PII l'a attrapé sur une
                // description qui portait « Nous écrire : contact@… » — parfaitement licite sur une
                // fiche, mais servi par paquets de 48 et filtrable, c'est le même vecteur de
                // moisson que les champs de contact qu'on retire juste au-dessus. *Un champ de
                // texte libre est un champ de contact que personne n'a déclaré.* Le § Direction UX
                // du ticket ne le demande pas non plus : ville, volume, note, enseigne.
                'is_verified' => (bool) $agence->is_verified,
                // `getFirstMediaUrl()` et NON `$agence->logo_url` : cet attribut n'existe pas
                // (ni colonne, ni accesseur — mesuré le 2026-08-28), il rend donc toujours null.
                // La collection `logo` est déclarée par `Agency::registerMediaCollections()`.
                'logo_url' => $agence->getFirstMediaUrl('logo') ?: null,
                // La ville PRINCIPALE est celle du portefeuille, pas l'adresse de l'établissement :
                // le visiteur cherche où l'agence OPÈRE. Cf. `PublicProfileFacts::portefeuilles()`.
                'city' => $portefeuille['cities'][0] ?? null,
                'cities' => $portefeuille['cities'],
                'portfolio_count' => $portefeuille['portfolio_count'],
                'rent_count' => $portefeuille['rent_count'],
                'sale_count' => $portefeuille['sale_count'],
                'reviews' => $avis[(int) $agence->id],
            ];
        })->values()->all();

        return $this->paginated($agences, $data, [
            // La FACETTE de ville, dérivée du catalogue éligible : le front ne compose aucune
            // liste de villes, il rend celle-ci. Une liste écrite côté front serait juste le jour
            // où on l'écrit — et le catalogue bouge sans que le dépôt change.
            'cities' => PublicProfileFacts::villesDuCatalogue('agency_id')->all(),
        ]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        $agency = Agency::query()
            ->where('slug', $slug)
            ->with('addresses')
            ->first();

        abort_if($agency === null, 404);

        // Base query (non limitée) — sert aux stats globales.
        $portfolioBase = fn () => Property::query()
            ->where('agency_id', $agency->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public);

        $portfolio = $portfolioBase()
            ->with('address')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->limit(48)
            ->get();

        $rentCount = $portfolioBase()->where('contract_type', ContractType::Rent)->count();
        $saleCount = $portfolioBase()->where('contract_type', ContractType::Sale)->count();
        $portfolioTotal = $portfolioBase()->count();
        $citiesCount = $portfolioBase()
            ->join('addresses', function ($join) {
                $join->on('addresses.addressable_id', '=', 'properties.id')
                    ->where('addresses.addressable_type', '=', Property::class);
            })
            ->distinct()
            ->count('addresses.city');

        // TCK-276 — l'équipe publique combine 3 sources dédupliquées :
        //   1. AgentProfile (staff agent officiel)
        //   2. AgencyAdminProfile (admin agence — publie aussi)
        //   3. Publishers de biens publics (Property.user_id) — typiquement
        //      des OwnerProfile (TCK-142 — Property.user_id = bailleur), mais
        //      affichés comme contact côté fiche bien donc attendus dans
        //      l'équipe pour la cohérence du parcours.
        $agentUserIds = AgentProfile::query()
            ->where('agency_id', $agency->id)
            ->pluck('user_id');

        $adminUserIds = AgencyAdminProfile::query()
            ->where('agency_id', $agency->id)
            ->pluck('user_id');

        $publisherUserIds = Property::query()
            ->where('agency_id', $agency->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public)
            ->distinct()
            ->pluck('user_id');

        $teamUserIds = $agentUserIds
            ->merge($adminUserIds)
            ->merge($publisherUserIds)
            ->filter()
            ->unique()
            ->values();

        $portfolioCounts = $teamUserIds->isEmpty()
            ? collect()
            : Property::query()
                ->where('agency_id', $agency->id)
                ->where('status', PropertyStatus::Available)
                ->where('visibility', PropertyVisibility::Public)
                ->whereIn('user_id', $teamUserIds)
                ->selectRaw('user_id, COUNT(*) as cnt')
                ->groupBy('user_id')
                ->pluck('cnt', 'user_id');

        $agents = $teamUserIds->isEmpty()
            ? collect()
            : User::query()
                ->whereIn('id', $teamUserIds)
                ->where('status', UserStatus::Active)
                ->with(['agentProfiles' => fn ($q) => $q->where('agency_id', $agency->id)])
                ->get()
                ->map(function (User $u) use ($portfolioCounts) {
                    $profile = $u->agentProfiles->first();

                    return [
                        'id' => $u->id,
                        'slug' => $u->username,
                        'full_name' => trim($u->first_name.' '.$u->last_name),
                        // Personal email of each team member is PII and was being
                        // exposed on an unauthenticated, slug-enumerable endpoint —
                        // a turnkey harvesting vector. Contact happens via the agency
                        // business email/phone below, not individual agents.
                        'avatar_url' => $u->avatar_url ?? null,
                        'specialty' => $profile?->specialty,
                        'portfolio_count' => (int) ($portfolioCounts[$u->id] ?? 0),
                    ];
                })
                ->sortByDesc('portfolio_count')
                ->values();

        $reviewsQuery = Review::query()
            ->where('reviewable_type', Agency::class)
            ->where('reviewable_id', $agency->id)
            ->where('is_approved', true);

        $reviewsCount = (clone $reviewsQuery)->count();
        $reviewsAverage = $reviewsCount > 0
            ? round((float) (clone $reviewsQuery)->avg('rating'), 1)
            : null;
        $reviewsRecent = $reviewsCount > 0
            ? (clone $reviewsQuery)->with('author')->latest()->limit(6)->get()
            : collect();

        return $this->json([
            'data' => [
                'id' => $agency->id,
                'slug' => $agency->slug,
                'name' => $agency->name,
                'description' => $agency->description,
                'license_number' => $agency->license_number,
                'logo_url' => $agency->logo_url ?? null,
                'email' => $agency->email,
                'phone' => $agency->phone,
                'city' => $agency->addresses->first()?->city,
                'stats' => [
                    'rent_count' => $rentCount,
                    'sale_count' => $saleCount,
                    'cities' => $citiesCount,
                    'agents' => $agents->count(),
                ],
                'agents' => $agents,
                'portfolio_count' => $portfolio->count(),
                'portfolio_total' => $portfolioTotal,
                'portfolio' => PropertyResource::collection($portfolio)->toArray($request),
                'reviews' => [
                    'average' => $reviewsAverage,
                    'count' => $reviewsCount,
                    'recent' => ReviewResource::collection($reviewsRecent)->toArray($request),
                ],
            ],
        ]);
    }

    /**
     * TCK-276 — paginated portfolio for the public agency page (load-more).
     */
    public function properties(Request $request, string $slug)
    {
        $agency = Agency::query()->where('slug', $slug)->first();

        abort_if($agency === null, 404);

        $perPage = min(max((int) $request->input('per_page', 24), 1), 48);

        $properties = Property::query()
            ->where('agency_id', $agency->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public)
            ->with('address', 'media')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return PropertyResource::collection($properties);
    }
}
