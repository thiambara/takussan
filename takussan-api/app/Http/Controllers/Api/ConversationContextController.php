<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Conversation\ListGroupContextLeasesRequest;
use App\Http\Resources\Messaging\GroupContextLeaseResource;
use App\Http\Resources\Messaging\GroupContextPropertyResource;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Policies\LeasePolicy;
use App\Policies\PropertyPolicy;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * TCK-576 — le bien et le bail auxquels on rattache une conversation de groupe, cherchés par leur
 * NOM : `GET /api/conversations/context/properties` et `GET /api/conversations/context/leases`.
 *
 * **Pourquoi ces deux routes, et pas `/api/properties` et `/api/leases`.** TCK-565 alimentait les
 * deux listes de « Nouveau groupe » par ces endpoints, plafonnés à 100 lignes et sans recherche :
 * mesuré le 2026-09-24, 106 des 206 biens que voit un agent de démo ne pouvaient pas être choisis,
 * et 46 de ses 146 baux. Leur `filter[search]` ne suffit pas à lever le plafond, et c'est mesuré
 * aussi :
 *
 *  - sur les biens, il passe par Meilisearch (`HasQueryBuilder`, TCK-280), dont l'index ne porte
 *    QUE les biens publics et publiés (`Property::shouldBeSearchable()`). Un brouillon, un bien
 *    privé, un bien en attente de modération sont introuvables : « Espace de bureau à Mbour »
 *    (privé, loué) rendait huit biens publics et pas lui. Or ce sont précisément des biens dont
 *    une équipe parle entre elle ;
 *  - sur les baux, il n'existe pas (`Lease` ne déclare aucun champ de recherche).
 *
 * La recherche est donc SQL, sur le périmètre de l'acteur, repliée en casse des deux côtés
 * ({@see CaseInsensitive}, ADR-0025) : chaque mot saisi doit apparaître dans le titre ou la
 * référence (du bien, ou du bien du bail). Elle ne replie PAS les accents (ADR-0020 §2 refuse
 * `unaccent` sans ticket) : « amitie » ne trouve pas « Amitié », « amiti » si.
 * `scripts/check-filtering-single-mechanism.mjs` ne s'y oppose pas : il interdit un SCOPE
 * réutilisable, pas le filtrage propre à un contrôleur (même choix que `PublicAgentController`).
 *
 * **Le périmètre est celui que la création d'un groupe accepte**, écrit en requête :
 * `CreateGroupConversationRequest` refuse un bien ou un bail que l'acteur ne peut pas `view`
 * ({@see PropertyPolicy::view()}, {@see LeasePolicy::view()}). Les prédicats ci-dessous en sont la
 * traduction ligne à ligne, et `ConversationContextTest` vérifie que TOUT ce qui est listé passe la
 * policy — dans un monde où d'autres agences, d'autres propriétaires et d'autres locataires
 * existent. Un bien ARCHIVÉ n'est pas proposé (comme dans la liste des biens de la console), même
 * si la policy l'accepterait : la liste est incluse dans ce que le serveur accepte, jamais
 * l'inverse.
 *
 * **Une liste blanche propre**, comme `MessagingContactController` : trois colonnes, un tri, et
 * pour les baux le seul `include=property`. Tout autre paramètre rend 400.
 */
class ConversationContextController extends Controller
{
    /** Au-delà, la saisie est une phrase, pas une recherche : on ne garde que les premiers mots. */
    private const MAX_TERMS = 6;

    public function properties(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Property::query()->where('properties.status', '!=', PropertyStatus::Archived->value);
        $this->visiblePropertiesOnly($base, $user);

        $paginator = QueryBuilder::for($base, $request)
            ->allowedFields('id', 'title', 'reference_number')
            ->allowedFilters(AllowedFilter::callback('search', function (Builder $q, mixed $value) {
                $this->matchEveryTerm($q, $value, fn (Builder $inner, string $motif) => $inner
                    ->whereRaw(CaseInsensitive::sql('properties.title').' LIKE ?', [$motif])
                    ->orWhereRaw(CaseInsensitive::sql('properties.reference_number').' LIKE ?', [$motif]));
            }))
            ->allowedSorts('title')
            ->allowedIncludes()
            ->defaultSort('title')
            // Ordre TOTAL : onze titres de la démo sont portés par plusieurs biens, et une page ne
            // doit jamais rendre deux fois le même.
            ->orderBy('properties.id')
            ->paginate();

        return $this->paginated($paginator, GroupContextPropertyResource::collection($paginator)->toArray($request));
    }

    /**
     * `filter[property_id]` est typé par {@see ListGroupContextLeasesRequest} (réparation 1 :
     * `abc` rendait 500, `SQLSTATE[22P02]`).
     */
    public function leases(ListGroupContextLeasesRequest $request): JsonResponse
    {
        $user = $request->user();

        $base = Lease::query();
        if (! $user->isSuperAdmin()) {
            // {@see LeasePolicy::view()} : bailleur, périmètre d'agence, ou locataire.
            $base->where(function (Builder $q) use ($user) {
                $q->where('leases.landlord_id', $user->id)
                    ->orWhereHas('tenant', fn (Builder $t) => $t->where('user_id', $user->id));
                if ($user->agency_id !== null) {
                    $q->orWhere('leases.agency_id', $user->agency_id);
                }
            });
        }

        $paginator = QueryBuilder::for($base, $request)
            ->allowedFields(
                'id', 'reference_number', 'property_id',
                'properties.id', 'properties.title', 'properties.reference_number',
            )
            ->allowedFilters(
                AllowedFilter::exact('property_id'),
                AllowedFilter::callback('search', function (Builder $q, mixed $value) {
                    $this->matchEveryTerm($q, $value, fn (Builder $inner, string $motif) => $inner
                        ->whereRaw(CaseInsensitive::sql('leases.reference_number').' LIKE ?', [$motif])
                        ->orWhereHas('property', fn (Builder $p) => $p->where(fn (Builder $col) => $col
                            ->whereRaw(CaseInsensitive::sql('properties.title').' LIKE ?', [$motif])
                            ->orWhereRaw(CaseInsensitive::sql('properties.reference_number').' LIKE ?', [$motif]))));
                }),
            )
            ->allowedSorts('created_at', 'reference_number')
            ->allowedIncludes('property')
            ->defaultSort('-created_at')
            ->orderBy('leases.id', 'desc')
            ->paginate();

        return $this->paginated($paginator, GroupContextLeaseResource::collection($paginator)->toArray($request));
    }

    /**
     * {@see PropertyPolicy::view()} en requête : le bien de l'acteur, ou un bien de son agence.
     *
     * @param  Builder<Property>  $base
     */
    private function visiblePropertiesOnly(Builder $base, User $user): void
    {
        if ($user->isSuperAdmin()) {
            return;
        }

        $base->where(function (Builder $q) use ($user) {
            $q->where('properties.user_id', $user->id);
            if ($user->agency_id !== null) {
                $q->orWhere('properties.agency_id', $user->agency_id);
            }
        });
    }

    /**
     * Chaque mot saisi doit apparaître quelque part (ET entre les mots, OU entre les colonnes) :
     * « bureau mbour » trouve « Espace de bureau à Mbour ». Les jokers de `LIKE` saisis par
     * l'utilisateur sont échappés — `%` cherche un pourcentage, pas « tout ».
     *
     * @param  callable(Builder, string): mixed  $anyColumn
     */
    private function matchEveryTerm(Builder $q, mixed $value, callable $anyColumn): void
    {
        $saisie = is_array($value) ? implode(' ', array_filter($value, 'is_string')) : (string) $value;
        $mots = array_slice(preg_split('/\s+/u', trim($saisie), -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, self::MAX_TERMS);

        foreach ($mots as $mot) {
            $motif = '%'.addcslashes(CaseInsensitive::fold($mot), '\\%_').'%';
            $q->where(fn (Builder $inner) => $anyColumn($inner, $motif));
        }
    }
}
