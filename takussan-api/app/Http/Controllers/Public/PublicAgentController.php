<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Public\ContactLeadPublicRequest;
use App\Http\Requests\Public\IndexPublicProfilesRequest;
use App\Http\Requests\Public\PublicPortfolioRequest;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\ReviewResource;
use App\Models\Enums\ContractType;
use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Services\Lead\ContactLeadService;
use App\Services\Public\AgentDirectoryFacts;
use App\Services\Public\AgentPublic;
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
     * · un slug de fiche — `public_slug` OU `username` ({@see User::slugDeFiche()}), le slug que la
     *   ligne émet. Sans lui, l'index rendrait une ligne dont le lien ne mène nulle part : *le défaut
     *   même que ce ticket corrige, réintroduit par sa propre correction.* Jusqu'à TCK-2519, le slug
     *   ÉTAIT le `username` et la condition était `username` non nul ; mais l'inscription
     *   (`AuthController::register`) ne pose aucun `username`, et un compte inscrit qui choisissait
     *   l'annuaire (TCK-2506) n'y paraissait jamais, ni au sitemap, alors que sa fiche était servie.
     * · portefeuille public non vide — {@see Property::scopePublicPortfolio()}.
     *
     * ────────────────────────────────────────────────────────────────────────────────────────────
     * 2. NI E-MAIL, NI TÉLÉPHONE — plus strict que la fiche, délibérément
     * ────────────────────────────────────────────────────────────────────────────────────────────
     *
     * `show()` publie le `phone` de l'agent (décision assumée de TCK-441 : une coordonnée de
     * joignabilité, pas un identifiant) — VÉRIFIÉ seulement depuis TCK-633 (lot C, tour 3) — et
     * ne publie plus son `email`. **L'index ne publie ni l'un ni l'autre**, et il ne publie pas
     * non plus l'adresse personnelle.
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
        $base = AgentPublic::sansAgenceHorsLigne(User::query())
            ->where('users.status', UserStatus::Active)
            // TCK-2519 — un slug de fiche, quel qu'il soit : le compte inscrit par le formulaire n'a
            // pas de `username`, seulement le `public_slug` posé par `users:public-slugs`.
            ->where(fn (Builder $q) => $q->whereNotNull('users.public_slug')->orWhereNotNull('users.username'))
            // TCK-2506 — un agent en exercice, ou un compte qui a CHOISI d'y paraître : un
            // propriétaire particulier n'est plus exposé ici d'office. Le sitemap lit cet index
            // (`listerSlugsDeProfils`), il suit donc la même règle.
            ->visibleDansLAnnuairePublic()
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
                        foreach (['users.first_name', 'users.last_name', 'users.username', 'users.public_slug'] as $colonne) {
                            $inner->orWhereRaw(CaseInsensitive::sql($colonne).' LIKE ?', [$motif]);
                        }
                    });
                    // `delimiter('')` : spatie découperait sinon la saisie à la virgule, et le
                    // tableau qui en sort faisait ignorer la recherche (P187.01, TCK-1843).
                })->delimiter(''),
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
        $roles = PublicProfileFacts::rolesPublics($ids);

        $quartiers = AgentDirectoryFacts::quartiers($agents->getCollection()->flatMap(fn (User $u) => $u->agentProfiles));

        $data = $agents->getCollection()->map(function (User $agent) use ($portefeuilles, $agences, $avis, $roles, $quartiers) {
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
                // TCK-2519 — le slug au nom quand il est posé : le sitemap et l'annuaire mènent
                // directement à l'adresse canonique, sans redirection.
                'slug' => $agent->slugDeFiche(),
                'first_name' => $agent->first_name,
                'last_name' => $agent->last_name,
                'full_name' => trim($agent->first_name.' '.$agent->last_name),
                // TCK-573 — `agent` ou `owner` : l'index liste aussi des propriétaires, et le
                // front ne doit présenter comme « agent » que ceux qui le sont
                // ({@see PublicProfileFacts::rolesPublics()}).
                'public_role' => $roles[$id],
                // `avatarUrl()` et NON `$agent->avatar_url` : cet attribut n'existe pas sur
                // `User` (ni colonne, ni accesseur — mesuré le 2026-08-28) et rend toujours null,
                // y compris là où `show()` l'emploie. La miniature, jamais l'original (TCK-762).
                'avatar_url' => $agent->avatarUrl(),
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
                // TCK-2518 — langues (codes), quartiers (identifiants et noms du référentiel) et délai
                // de réponse du profil d'agent retenu ; `[]` / `null` sans profil.
                ...AgentDirectoryFacts::pour($profil, $quartiers),
            ];
        })->values()->all();

        return $this->paginated($agents, $data, [
            'cities' => PublicProfileFacts::villesDuCatalogue('user_id')->all(),
        ]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        $agent = $this->ficheOu404($slug, ['agency', 'addresses', 'agentProfiles']);
        $role = PublicProfileFacts::rolesPublics([(int) $agent->id])[(int) $agent->id];
        $canonique = $agent->slugDeFiche();

        // TCK-598 (V15) — `publicPortfolio()`, le prédicat de l'index des profils : le prédicat
        // écrit à la main ici oubliait `is_test` et `published_at`, et la page listait des biens
        // dont la fiche rend 404.
        $portfolioBase = fn () => Property::query()
            ->where('user_id', $agent->id)
            ->publicPortfolio();

        $portfolio = $portfolioBase()
            ->with('address')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->limit(24)
            ->get();

        $rentCount = $portfolioBase()->where('contract_type', ContractType::Rent)->count();
        $saleCount = $portfolioBase()->where('contract_type', ContractType::Sale)->count();
        $portfolioTotal = $portfolioBase()->count();
        // Jointure : le portefeuille entre par sa sous-requête d'identifiants, sans quoi les
        // colonnes nues du scope (`status`, `visibility`) deviendraient ambiguës (piège n°7).
        $citiesCount = Property::query()
            ->whereIn('properties.id', $portfolioBase()->select('properties.id'))
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
                'slug' => $canonique,
                // TCK-2519 — présent seulement quand l'adresse demandée n'est pas la canonique
                // (ancien slug, `username`, autre casse) : le front redirige en 301 vers elle.
                ...($canonique !== $slug ? ['canonical_slug' => $canonique] : []),
                'first_name' => $agent->first_name,
                'last_name' => $agent->last_name,
                'full_name' => trim($agent->first_name.' '.$agent->last_name),
                // TCK-573 — un propriétaire garde sa fiche sous `/agents/…` (liens existants) mais
                // n'y est jamais présenté comme agent immobilier : titre, libellé et données
                // structurées en dépendent ({@see PublicProfileFacts::rolesPublics()}).
                'public_role' => $role,
                // TCK-2506 — la fiche d'un propriétaire qui n'a pas choisi l'annuaire reste servie
                // (une de ses annonces y mène) mais n'est pas indexée : `noindex`, ni sitemap ni
                // données structurées `Person`. Le réglage lui-même ne sort pas : sa conséquence suffit.
                'indexable' => $role === 'agent' || $agent->listed_in_public_directory,
                // TCK-441 — `email` N'EST PAS servi ici, et c'est le coeur du ticket.
                // `User::$email` est l'IDENTIFIANT DE CONNEXION : `fillable` a cote de
                // `password`, normalise en minuscules pour l'index unique. Le publier sur un
                // endpoint anonyme et enumerable par slug, c'est offrir la moitie du formulaire
                // de connexion — et c'est exactement ce que PublicAgencyController retire deja
                // pour ces memes personnes, que `TeamStrip` liait pourtant jusqu'ici.
                //
                // Le TELEPHONE reste public : c'est une coordonnee de joignabilite, pas un
                // identifiant, et un agent immobilier veut etre appele. Decision du ticket.
                //
                // TCK-633 (lot C, tour 3) — mais seulement VÉRIFIÉ (décision de la session sur
                // D10 : aucun numéro principal non vérifié n'est servi au public). La carte de
                // contact d'une annonce mène ici : sans cette règle, le numéro que `…/contact`
                // retient sortait à un clic, en `tel:` et en JSON-LD. `phone_verified` est le même
                // booléen que `primary_contact.phone_verified` de la fiche du bien.
                'phone' => $agent->numeroPrincipalPublic(),
                'phone_verified' => $agent->phone_verified_at !== null,
                'avatar_url' => $agent->avatar_url ?? null,
                'bio' => $agent->bio,
                'city' => $agent->addresses->first()?->city,
                'preferred_language' => $agent->preferred_language,
                'specialty' => $profile?->specialty,
                // TCK-1321 (P117.03) — les zones saisies à l'assistant de l'agent, en lecture seule à
                // côté de la spécialité. Seules les chaînes passent : `metadata` n'est pas validée
                // au-delà de l'écrivain (`AgentProfileController::updateSpecialization`).
                'intervention_zones' => array_values(array_filter(
                    (array) ($profile?->metadata['intervention_zones'] ?? []),
                    fn ($zone) => is_string($zone) && $zone !== '',
                )),
                'years_of_experience' => $yearsOfExperience,
                // TCK-2518 — langues, quartiers et délai de réponse du profil d'agent de la fiche.
                ...AgentDirectoryFacts::pour($profile, AgentDirectoryFacts::quartiers($profile !== null ? [$profile] : [])),
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
        ContactLeadService $leads,
        string $slug,
    ): JsonResponse {
        $data = $request->validated();

        $agent = $this->ficheOu404($slug, ['agency']);

        // Pot de miel : on accepte sans rien ecrire, exactement comme le contact d'un bien.
        // Repondre 422 apprendrait au robot quel champ eviter.
        if (! empty($data['company'])) {
            return $this->json(['data' => ['accepted' => true]], 201);
        }

        // TCK-590 — écriture, notification (message entier, téléphone) et accusé de réception
        // passent par le même service que le contact d'un bien.
        $leads->forAgent($agent, $agent->agency?->id, $data, $request);

        return $this->json(['data' => ['accepted' => true]], 201);
    }

    /**
     * TCK-276 — paginated portfolio for the public agent page (load-more).
     */
    public function properties(PublicPortfolioRequest $request, string $slug)
    {
        $agent = $this->ficheOu404($slug);

        $perPage = min(max((int) $request->input('per_page', 24), 1), 48);
        $contrat = $request->contractType();

        $properties = Property::query()
            ->where('user_id', $agent->id)
            ->publicPortfolio()
            ->when($contrat !== null, fn (Builder $q) => $q->where('contract_type', $contrat))
            ->with('address', 'media')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        // TCK-1220 (P108.03) — l'enveloppe canonique `{ data, meta }`, et non celle de Laravel
        // (`links`, `meta.path`…), dont les URL portent l'hôte de la requête.
        return $this->paginated($properties, PropertyResource::collection($properties)->toArray($request));
    }

    /**
     * La personne d'une fiche `/agents/{slug}` — ou 404. Une seule résolution pour la fiche, son
     * portefeuille et son contact : une adresse qui sert la page sert aussi ses deux actions. La
     * résolution elle-même (trois niveaux de slug, fiche publique, agence hors ligne) est partagée
     * avec le filtre `agent=` de la liste publique : {@see AgentPublic::parSlug()}.
     *
     * @param  list<string>  $with
     */
    private function ficheOu404(string $slug, array $with = []): User
    {
        $agent = app(AgentPublic::class)->parSlug($slug, $with);
        abort_if($agent === null, 404);

        return $agent;
    }
}
