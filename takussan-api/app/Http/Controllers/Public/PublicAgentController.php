<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Public\ContactLeadPublicRequest;
use App\Http\Requests\Public\IndexPublicProfilesRequest;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\ReviewResource;
use App\Models\Enums\ContractType;
use App\Models\Enums\NotificationType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\Review;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Public\PublicProfileFacts;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * TCK-177 + TCK-276 — public agent profile.
 *
 * `GET /api/public/agents/{slug}` returns the agent's contact card
 * (incl. bio, derived city, specialty, years_of_experience), the public
 * portfolio, derived stats, and approved reviews. Uses `User.username`
 * as the slug; only users in `active` status surface here.
 */
class PublicAgentController extends Controller
{
    /**
     * L'INDEX PUBLIC DES AGENTS — TCK-436.
     *
     * `GET /api/public/agents?filter[search]=…&filter[city]=…&sort=…&page=…&per_page=…`
     *
     * ────────────────────────────────────────────────────────────────────────────────────────────
     * 1. QUI EST « UN AGENT » SUR LA SURFACE PUBLIQUE — la question que ce ticket devait trancher
     * ────────────────────────────────────────────────────────────────────────────────────────────
     *
     * Deux définitions étaient disponibles, et la mesure a écarté la première.
     *
     * **(a) « porteur d'un `AgentProfile` »** — la définition métier, celle de
     * `MembershipCapabilityResolver`. Relevé le 2026-08-28 sur la base de développement, en SQL :
     *
     *     utilisateurs actifs porteurs d'un AgentProfile ET publiant un bien public ....  0
     *     idem pour AgencyAdminProfile .................................................  0
     *     publieurs publics porteurs d'un OwnerProfile ................................. 44 / 44
     *
     * `properties.user_id` est le **bailleur** depuis TCK-142, pas l'agent mandaté. Retenir (a)
     * aurait donc livré une page `/agents` **vide**, et un `/sitemap.xml` sans une seule URL
     * d'agent — un endpoint vert, une garde satisfaite, et rien à l'écran.
     *
     * **(b) « la personne publiquement présentée comme contact d'au moins un bien publié »** — et
     * c'est déjà, sans ambiguïté, la définition que le produit APPLIQUE :
     *
     * · `PublicAgentController::show()` sert n'importe quel utilisateur actif par son `username`,
     *   et son « portefeuille » est `properties.user_id = agent.id` ;
     * · `PropertyResource::buildOwner()` émet `owner.slug = username` avec le commentaire
     *   *« TCK-177 — used to link the contact card to /agents/[slug] »*, et `PropertyAgentCard`
     *   suit ce lien.
     *
     * L'index retient (b). Il n'invente donc aucune surface : **il énumère exactement l'ensemble
     * que `/public/properties` rend déjà énumérable un bien à la fois** — `owner.slug` y est servi
     * sur une route anonyme et sans plafond de `per_page`. Ce qui est neuf est le confort de
     * l'énumération, pas son existence, et c'est ce que bornent le plafond de `per_page` et
     * l'absence totale de champ de contact (§ 2).
     *
     * Les trois conditions, et ce que chacune empêche :
     *
     * · `status = active` — le ticket nomme « un agent désactivé » parmi les non-éligibles ; c'est
     *   aussi ce que `show()` exige déjà, donc un profil listé mène toujours à une fiche servie.
     * · `username` non nul — le slug de l'URL EST le `username`. Sans lui, l'index rendrait une
     *   ligne dont le lien ne mène nulle part : *le défaut même que ce ticket corrige, réintroduit
     *   par sa propre correction.*
     * · portefeuille public non vide — {@see Property::scopePublicPortfolio()}.
     *
     * ────────────────────────────────────────────────────────────────────────────────────────────
     * 2. NI E-MAIL, NI TÉLÉPHONE — plus strict que la fiche, délibérément
     * ────────────────────────────────────────────────────────────────────────────────────────────
     *
     * `show()` publie le `phone` de l'agent (décision assumée de TCK-441 : une coordonnée de
     * joignabilité, pas un identifiant) et ne publie plus son `email`. **L'index ne publie ni
     * l'un ni l'autre**, et il ne publie pas non plus l'adresse personnelle.
     *
     * L'écart n'est pas une hésitation : un numéro consultable fiche par fiche et un numéro servi
     * par paquets de 48, filtrables par ville et paginés, ne sont pas la même donnée. C'est
     * littéralement le *« turnkey harvesting vector »* que `PublicAgencyController::show()` nomme
     * en retirant l'e-mail des membres d'équipe — et le ticket désigne cet index comme *« exactement
     * le vecteur que cette redaction visait »*. La ville rendue vient du PORTEFEUILLE et non de
     * l'adresse du domicile ({@see PublicProfileFacts::portefeuilles()}).
     *
     * ────────────────────────────────────────────────────────────────────────────────────────────
     * 3. LE RESTE — allowlist écrite pour CE public, ordre total
     * ────────────────────────────────────────────────────────────────────────────────────────────
     *
     * Mêmes décisions que {@see PublicAgencyController::index()}, pour les mêmes raisons :
     * `QueryBuilder::for()` avec une allowlist propre plutôt que `User::buildQuery()` (dont
     * `$queryFields` porte `email` et `phone` et dont `$requestSearchFields` route vers Scout),
     * recherche SQL avec {@see CaseInsensitive} des deux côtés, et `->orderBy('users.id')` en
     * dernier pour que la pagination ne puisse pas rendre deux fois la même ligne.
     */
    public function index(IndexPublicProfilesRequest $request): JsonResponse
    {
        $base = User::query()
            ->where('users.status', UserStatus::Active)
            ->whereNotNull('users.username')
            ->whereHas('properties', fn (Builder $q) => $q->publicPortfolio())
            ->withCount(['properties as portfolio_count' => fn (Builder $q) => $q->publicPortfolio()]);

        if (($ville = $request->ville()) !== null) {
            $base->whereHas('properties', fn (Builder $q) => $q->publicPortfolio()
                ->whereHas('address', fn ($a) => $a->whereRaw(
                    CaseInsensitive::sql('city').' = ?',
                    [CaseInsensitive::fold($ville)],
                )));
        }

        $agents = QueryBuilder::for($base, $request)
            ->allowedFilters(
                AllowedFilter::callback('search', function (Builder $q, mixed $valeur) {
                    if (! is_string($valeur) || trim($valeur) === '') {
                        return;
                    }
                    $motif = '%'.CaseInsensitive::fold(trim($valeur)).'%';
                    // Trois colonnes en OU, et `username` en fait partie : c'est le slug public,
                    // donc la chaîne qu'un visiteur a sous les yeux dans l'URL d'une fiche.
                    $q->where(function (Builder $inner) use ($motif) {
                        foreach (['users.first_name', 'users.last_name', 'users.username'] as $colonne) {
                            $inner->orWhereRaw(CaseInsensitive::sql($colonne).' LIKE ?', [$motif]);
                        }
                    });
                }),
                // Appliqué sur `$base` (relation morphe d'une relation) — déclaré ici pour que
                // spatie ne lève pas `InvalidFilterQuery` sur un paramètre pourtant honoré.
                AllowedFilter::callback('city', fn () => null),
            )
            ->allowedSorts('portfolio_count', 'last_name')
            ->defaultSort('-portfolio_count')
            ->orderBy('users.id')
            ->with(['media', 'agentProfiles'])
            ->paginate($request->tailleDePage())
            ->withQueryString();

        $ids = $agents->getCollection()->map(fn (User $u) => (int) $u->id)->all();
        $portefeuilles = PublicProfileFacts::portefeuilles('user_id', $ids);
        $agences = PublicProfileFacts::agences($ids);
        $avis = PublicProfileFacts::avis(User::class, $ids);

        $data = $agents->getCollection()->map(function (User $agent) use ($portefeuilles, $agences, $avis) {
            $id = (int) $agent->id;
            $portefeuille = $portefeuilles[$id];
            $agence = $agences[$id] ?? null;

            // La spécialité est portée par le profil d'agent de CETTE agence quand il existe —
            // même règle de sélection que `show()`. Elle est nulle pour un publieur qui n'est pas
            // un agent mandaté, ce qui est le cas le plus fréquent (cf. § 1).
            $profil = $agence !== null
                ? $agent->agentProfiles->firstWhere('agency_id', $agence['id'])
                : $agent->agentProfiles->first();

            return [
                'id' => $agent->id,
                'slug' => $agent->username,
                'first_name' => $agent->first_name,
                'last_name' => $agent->last_name,
                'full_name' => trim($agent->first_name.' '.$agent->last_name),
                // `getFirstMediaUrl()` et NON `$agent->avatar_url` : cet attribut n'existe pas sur
                // `User` (ni colonne, ni accesseur — mesuré le 2026-08-28) et rend toujours null,
                // y compris là où `show()` l'emploie. `PropertyResource` utilise déjà cette forme.
                'avatar_url' => $agent->getFirstMediaUrl('avatar') ?: null,
                'specialty' => $profil?->specialty,
                'agency' => $agence === null ? null : [
                    'id' => $agence['id'],
                    'slug' => $agence['slug'],
                    'name' => $agence['name'],
                ],
                'city' => $portefeuille['cities'][0] ?? null,
                'cities' => $portefeuille['cities'],
                'portfolio_count' => $portefeuille['portfolio_count'],
                'rent_count' => $portefeuille['rent_count'],
                'sale_count' => $portefeuille['sale_count'],
                'reviews' => $avis[$id],
            ];
        })->values()->all();

        return $this->paginated($agents, $data, [
            'cities' => PublicProfileFacts::villesDuCatalogue('user_id')->all(),
        ]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        $agent = User::query()
            ->where('username', $slug)
            ->where('status', 'active')
            ->with(['agency', 'addresses', 'agentProfiles'])
            ->first();

        abort_if($agent === null, 404);

        $portfolioBase = fn () => Property::query()
            ->where('user_id', $agent->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public);

        $portfolio = $portfolioBase()
            ->with('address')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->limit(24)
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

        $profile = $agent->agency
            ? $agent->agentProfiles->firstWhere('agency_id', $agent->agency->id)
            : $agent->agentProfiles->first();

        $yearsOfExperience = null;
        if ($profile?->hire_date) {
            $diff = $profile->hire_date->diffInYears(now());
            $yearsOfExperience = (int) max(0, floor($diff));
        }

        $reviewsQuery = Review::query()
            ->where('reviewable_type', User::class)
            ->where('reviewable_id', $agent->id)
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
                'id' => $agent->id,
                'slug' => $agent->username,
                'first_name' => $agent->first_name,
                'last_name' => $agent->last_name,
                'full_name' => trim($agent->first_name.' '.$agent->last_name),
                // TCK-441 — `email` N'EST PAS servi ici, et c'est le coeur du ticket.
                // `User::$email` est l'IDENTIFIANT DE CONNEXION : `fillable` a cote de
                // `password`, normalise en minuscules pour l'index unique. Le publier sur un
                // endpoint anonyme et enumerable par slug, c'est offrir la moitie du formulaire
                // de connexion — et c'est exactement ce que PublicAgencyController retire deja
                // pour ces memes personnes, que `TeamStrip` liait pourtant jusqu'ici.
                //
                // Le TELEPHONE reste public : c'est une coordonnee de joignabilite, pas un
                // identifiant, et un agent immobilier veut etre appele. Decision du ticket.
                'phone' => $agent->phone,
                'avatar_url' => $agent->avatar_url ?? null,
                'bio' => $agent->bio,
                'city' => $agent->addresses->first()?->city,
                'preferred_language' => $agent->preferred_language,
                'specialty' => $profile?->specialty,
                'years_of_experience' => $yearsOfExperience,
                'agency' => $agent->agency ? [
                    'id' => $agent->agency->id,
                    'name' => $agent->agency->name,
                    'slug' => $agent->agency->slug,
                ] : null,
                'stats' => [
                    'rent_count' => $rentCount,
                    'sale_count' => $saleCount,
                    'cities' => $citiesCount,
                    'years' => $yearsOfExperience,
                ],
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
     * TCK-441 — contact ANONYME d'un agent, en remplacement du `mailto:` retire ci-dessus.
     *
     * ⚠️ Aucune authentification, et c'est deliberé : le regime du contact public de ce depot est
     * celui de `properties/{slug}/contact-lead`, anonyme depuis TCK-161. La barriere est le
     * `throttle` et le pot de miel, jamais un compte a creer. Un ticket qui rendrait le contact
     * d'un agent plus difficile qu'avant aurait manque son objet.
     *
     * La piste est rattachee a l'AGENCE de l'agent — frontiere d'isolation, principe n°2 — et
     * porte `property_id` a null : c'est ce que la migration de ce ticket a rendu possible.
     */
    public function contactLead(
        ContactLeadPublicRequest $request,
        NotificationService $notifications,
        string $slug,
    ): JsonResponse {
        $data = $request->validated();

        $agent = User::query()
            ->where('username', $slug)
            ->where('status', 'active')
            ->with('agency')
            ->first();

        abort_if($agent === null, 404);

        // Pot de miel : on accepte sans rien ecrire, exactement comme le contact d'un bien.
        // Repondre 422 apprendrait au robot quel champ eviter.
        if (! empty($data['company'])) {
            return $this->json(['data' => ['accepted' => true]], 201);
        }

        $lead = PropertyContactLead::create([
            'property_id' => null,
            'agency_id' => $agent->agency?->id,
            'recipient_user_id' => $agent->id,
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'message' => $data['message'],
            'ip' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);

        $notifications->notify(
            $agent,
            NotificationType::Message,
            'Nouveau lead anonyme',
            $data['name'].' ('.$data['email'].') : '.mb_strimwidth($data['message'], 0, 80, '…'),
            ['agent_id' => $agent->id, 'lead_id' => $lead->id],
        );

        return $this->json(['data' => ['accepted' => true]], 201);
    }

    /**
     * TCK-276 — paginated portfolio for the public agent page (load-more).
     */
    public function properties(Request $request, string $slug)
    {
        $agent = User::query()
            ->where('username', $slug)
            ->where('status', 'active')
            ->first();

        abort_if($agent === null, 404);

        $perPage = min(max((int) $request->input('per_page', 24), 1), 48);

        $properties = Property::query()
            ->where('user_id', $agent->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public)
            ->with('address', 'media')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return PropertyResource::collection($properties);
    }
}
