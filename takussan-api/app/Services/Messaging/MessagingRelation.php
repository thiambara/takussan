<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Enums\CollaborationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2745 — **la relation d'une personne joignable avec l'appelant**, telle que « Nouvelle
 * conversation » range sa liste : `client`, `equipe`, `proprietaire`, `prestataire`, ou `null`.
 * Un code, jamais un libellé : le front possède le texte (principe 5).
 *
 * ⚠️ **La relation ÉTIQUETTE le périmètre de {@see MessagingReach}, elle ne l'élargit jamais** : elle
 * ne se lit que sur les personnes que la règle rend déjà, et `filter[relation]` ne fait que
 * restreindre. Elle ne doit pas non plus RÉVÉLER un lien que l'appelant n'a pas à connaître :
 *
 *  - `equipe` — un profil agent ou administrateur ACTIF dans l'agence active de l'appelant, et
 *    elle seule (la règle 3 l'ouvre à tout membre) : l'agent d'une autre agence, joint par un fil
 *    passé, n'est pas « équipe » ;
 *  - `proprietaire` — un profil bailleur actif dans cette agence, lu par le PERSONNEL actif qui lit
 *    aussi le carnet des bailleurs (`OwnerProfilePolicy::viewAny`) : un bailleur n'apprend pas qui
 *    d'autre l'agence gère, même d'un correspondant ;
 *  - `client` — le compte d'une fiche à laquelle l'appelant est RATTACHÉ (règle 2b de
 *    `MessagingReach`, la même écriture : {@see MessagingReach::clientsOf()}). Pas toute la
 *    clientèle de l'agence : « mes clients » ;
 *  - `prestataire` — un prestataire en collaboration active avec l'agence, pour le personnel
 *    seulement, et par la policy du carnet des prestataires, comme `proprietaire`.
 *
 * Une personne qui en cumule plusieurs reçoit la première de {@see self::ORDRE}. Une personne
 * joignable sans aucune (un simple correspondant, l'équipe de l'agence d'un groupe qu'on complète,
 * règle 4) reçoit `null`.
 *
 * La ligne de détail est faite de DONNÉES, lues par page en une requête par relation, jamais par
 * personne : le rôle (`agent`/`admin`), le nombre de biens vivants de l'agence (le compte du carnet
 * des bailleurs, `OwnerDirectory::addListColumns()`), le bien du dernier échange — pris dans les
 * seuls fils où l'appelant est encore participant ({@see self::filsVisibles()}).
 */
class MessagingRelation
{
    public const CLIENT = 'client';

    public const EQUIPE = 'equipe';

    public const PROPRIETAIRE = 'proprietaire';

    public const PRESTATAIRE = 'prestataire';

    /** Priorité, de la plus forte à la plus faible. */
    public const ORDRE = [self::EQUIPE, self::PROPRIETAIRE, self::CLIENT, self::PRESTATAIRE];

    private ?int $agencyId;

    private bool $litBailleurs;

    private bool $litPrestataires;

    /** @var list<int> */
    private array $fermees;

    /** @var Builder<Conversation>|null */
    private ?Builder $filsVisibles = null;

    public function __construct(private readonly User $actor, private readonly MessagingReach $reach)
    {
        $this->agencyId = $actor->agency_id !== null ? (int) $actor->agency_id : null;
        $staff = $this->agencyId !== null && $actor->staffAgencyId() === $this->agencyId;
        // Le carnet des bailleurs et celui des prestataires se lisent par leur policy : la relation ne
        // dit pas plus que ce que l'appelant y lirait (le personnel ACTIF, ET la policy).
        $this->litBailleurs = $staff && $actor->can('viewAny', OwnerProfile::class);
        $this->litPrestataires = $staff && $actor->can('viewAny', ServiceProviderProfile::class);
        $this->fermees = app(ConversationAccess::class)->agencesFermeesAuBailleur($actor);
    }

    /**
     * `filter[relation]=<code>` — les personnes dont la relation est EXACTEMENT ce code (la sienne,
     * après priorité). Un code inconnu, vide ou en tableau ne rend personne.
     *
     * @param  Builder<User>  $query
     */
    public function filtre(Builder $query, mixed $value): void
    {
        $code = is_string($value) ? trim($value) : null;
        $predicat = $code !== null && in_array($code, self::ORDRE, true) ? $this->predicat($code) : null;
        if ($predicat === null) {
            $query->whereRaw('1 = 0');

            return;
        }

        $query->where($predicat);
        foreach (self::ORDRE as $plusForte) {
            if ($plusForte === $code) {
                break;
            }
            $avant = $this->predicat($plusForte);
            if ($avant !== null) {
                $query->whereNot($avant);
            }
        }
    }

    /**
     * La relation de chaque identifiant — une requête par relation applicable, jamais par personne.
     *
     * @param  list<int>  $ids
     * @return array<int, string|null>
     */
    public function relations(array $ids): array
    {
        $relations = array_fill_keys($ids, null);
        $restants = $ids;

        foreach (self::ORDRE as $code) {
            $predicat = $this->predicat($code);
            if ($predicat === null || $restants === []) {
                continue;
            }
            $trouves = User::query()->whereIn('users.id', $restants)->where($predicat)
                ->pluck('users.id')->map(fn ($id) => (int) $id)->all();
            foreach ($trouves as $id) {
                $relations[$id] = $code;
            }
            $restants = array_values(array_diff($restants, $trouves));
        }

        return $relations;
    }

    /**
     * La ligne de détail de chaque personne, sous forme de données.
     *
     * @param  array<int, string|null>  $relations
     * @return array<int, array<string, mixed>|null>
     */
    public function details(array $relations): array
    {
        $parCode = fn (string $code) => array_keys(array_filter($relations, fn ($r) => $r === $code));
        $details = array_fill_keys(array_keys($relations), null);

        $equipe = $parCode(self::EQUIPE);
        if ($equipe !== []) {
            $admins = AgencyAdminProfile::query()->active()->where('agency_id', $this->agencyId)
                ->whereIn('user_id', $equipe)->pluck('user_id')->map(fn ($id) => (int) $id)->all();
            foreach ($equipe as $id) {
                $details[$id] = ['role' => in_array($id, $admins, true) ? 'admin' : 'agent'];
            }
        }

        $proprietaires = $parCode(self::PROPRIETAIRE);
        if ($proprietaires !== []) {
            $comptes = DB::table('properties')
                ->selectRaw('user_id, COUNT(*) as n')
                ->where('agency_id', $this->agencyId)
                ->whereIn('user_id', $proprietaires)
                ->whereNull('deleted_at')
                ->whereNull('archived_at')
                ->groupBy('user_id')
                ->pluck('n', 'user_id');
            foreach ($proprietaires as $id) {
                $details[$id] = ['properties_count' => (int) ($comptes[$id] ?? 0)];
            }
        }

        $clients = $parCode(self::CLIENT);
        if ($clients !== []) {
            $biens = $this->biensDuDernierEchange($clients);
            foreach ($clients as $id) {
                $details[$id] = ['property' => $biens[$id] ?? null];
            }
        }

        return $details;
    }

    /**
     * Les fils où l'appelant est ENCORE participant et qu'il voit — la source du « dernier échange »,
     * du bien comme du tri. Un fil quitté ou dont il a été retiré n'en est pas (`activeOnly`), ni un
     * fil d'une agence fermée au bailleur parti ({@see MessagingReach::filsFermes()}, TCK-2753) :
     * leur `last_message_at` avance sans lui, et leur bien n'est plus « son » échange.
     *
     * @return Builder<Conversation>
     */
    public function filsVisibles(): Builder
    {
        if ($this->filsVisibles === null) {
            $this->filsVisibles = app(ConversationAccess::class)
                ->participatingQuery($this->actor, activeOnly: true)
                ->select('conversations.id');
            if ($this->fermees !== []) {
                $this->filsVisibles->whereNotIn('conversations.id', fn (QueryBuilder $c) => $this->reach->filsFermes($c, $this->actor, $this->fermees));
            }
        }

        return $this->filsVisibles;
    }

    /**
     * @param  list<int>  $clients
     * @return array<int, array{title: string, city: string|null}>
     */
    private function biensDuDernierEchange(array $clients): array
    {
        $bienParClient = DB::query()
            ->fromSub(fn (QueryBuilder $q) => $q
                ->selectRaw('DISTINCT ON (cp.user_id) cp.user_id, COALESCE(cv.property_id, l.property_id) AS property_id')
                ->from('conversation_participants as cp')
                ->join('conversations as cv', 'cv.id', '=', 'cp.conversation_id')
                ->leftJoin('leases as l', 'l.id', '=', 'cv.lease_id')
                ->whereIn('cp.user_id', $clients)
                ->whereIn('cv.id', $this->filsVisibles()->toBase())
                ->whereRaw('COALESCE(cv.property_id, l.property_id) IS NOT NULL')
                ->orderBy('cp.user_id')
                ->orderByRaw('cv.last_message_at DESC NULLS LAST')
                ->orderByDesc('cv.id'), 'dernier')
            ->pluck('property_id', 'user_id');

        if ($bienParClient->isEmpty()) {
            return [];
        }

        $biens = Property::query()
            ->with('address:id,addressable_id,addressable_type,city')
            ->whereIn('id', $bienParClient->values()->unique()->all())
            ->get(['id', 'title'])
            ->keyBy('id');

        $rendus = [];
        foreach ($bienParClient as $client => $bienId) {
            $bien = $biens[$bienId] ?? null;
            if ($bien !== null) {
                $rendus[(int) $client] = ['title' => $bien->title, 'city' => $bien->address?->city];
            }
        }

        return $rendus;
    }

    /** Le prédicat SQL d'une relation pour CET appelant — `null` quand elle ne peut pas s'appliquer. */
    private function predicat(string $code): ?Closure
    {
        $agence = $this->agencyId;

        return match ($code) {
            self::EQUIPE => $agence === null ? null : fn (Builder $q) => $q
                ->whereHas('agentProfiles', fn (Builder $p) => $p->active()->where('agency_id', $agence))
                ->orWhereHas('agencyAdminProfiles', fn (Builder $p) => $p->active()->where('agency_id', $agence)),
            self::PROPRIETAIRE => ! $this->litBailleurs ? null : fn (Builder $q) => $q
                ->whereHas('ownerProfiles', fn (Builder $p) => $p->active()->where('agency_id', $agence)),
            self::CLIENT => fn (Builder $q) => $q
                ->whereIn('users.id', fn (QueryBuilder $sub) => $this->reach->clientsOf($sub, $this->actor, $this->fermees)),
            self::PRESTATAIRE => ! $this->litPrestataires ? null : fn (Builder $q) => $q
                ->whereIn('users.id', fn (QueryBuilder $sub) => $sub->select('spp.user_id')
                    ->from('service_provider_profiles as spp')
                    ->join('service_provider_agency_collaborations as spc', 'spc.service_provider_profile_id', '=', 'spp.id')
                    ->whereNull('spp.deleted_at')
                    ->whereNull('spc.deleted_at')
                    ->where('spc.agency_id', $agence)
                    ->where('spc.status', CollaborationStatus::Active->value)),
            default => null,
        };
    }
}
