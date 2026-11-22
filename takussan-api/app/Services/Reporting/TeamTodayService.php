<?php

namespace App\Services\Reporting;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\RoleDelegation;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;

/**
 * TCK-2623 ([ADR-0096](../../../../docs/adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md))
 * — « Équipe aujourd'hui » : une ligne par agent ACTIF de l'agence, avec ses visites du jour, ses
 * demandes de contact à traiter et son absence en cours.
 *
 * **« Aujourd'hui » est le jour de Dakar**, quel que soit le fuseau du serveur : ses bornes sont
 * calculées à Dakar, puis converties dans le fuseau de l'application avant d'entrer dans une requête
 * (Laravel lie une date par son heure murale, sans la convertir). Africa/Dakar est à UTC+0 et
 * l'application en UTC : la conversion ne change rien aujourd'hui, elle rend la règle indépendante
 * de la configuration.
 *
 * Chaque indicateur est UNE requête groupée, quel que soit l'effectif (règle de `PortfolioMetrics`,
 * comme {@see TeamPerformanceService}).
 */
class TeamTodayService
{
    public const TIMEZONE = 'Africa/Dakar';

    /** Une visite annulée ou manquée n'occupe pas la journée : la règle de l'accueil de l'agent. */
    private const VISITES_ECARTEES = [VisitStatus::Cancelled, VisitStatus::NoShow];

    /** @return array{date: string, agents: list<array<string, mixed>>} */
    public function forToday(Agency $agency): array
    {
        $aDakar = CarbonImmutable::now(self::TIMEZONE)->startOfDay();
        $debut = $aDakar->setTimezone(config('app.timezone'));
        $fin = $aDakar->addDay()->setTimezone(config('app.timezone'));
        $agencyId = (int) $agency->id;

        $agents = AgentProfile::query()
            ->active()
            ->where('agency_id', $agencyId)
            // `media` : `avatarUrl()` lit la première photo de profil, une requête par compte sans lui.
            ->with(['user:id,first_name,last_name,username', 'user.media'])
            ->orderBy('id')
            ->get();
        $ids = $agents->pluck('user_id')->map(fn ($id) => (int) $id)->all();

        $visites = PropertyVisit::query()
            ->whereIn('agent_id', $ids)
            ->where('scheduled_at', '>=', $debut)
            ->where('scheduled_at', '<', $fin)
            ->whereNotIn('status', array_map(static fn (VisitStatus $s): string => $s->value, self::VISITES_ECARTEES))
            ->whereHas('property', fn ($q) => $q->where('agency_id', $agencyId))
            ->toBase()
            ->selectRaw('agent_id, COUNT(*) AS n, MIN(scheduled_at) AS premiere')
            ->groupBy('agent_id')
            ->get()
            ->keyBy('agent_id');

        $demandes = PropertyContactLead::query()
            ->aTraiter()
            ->where('agency_id', $agencyId)
            ->whereIn('recipient_user_id', $ids)
            ->toBase()
            ->selectRaw('recipient_user_id, COUNT(*) AS n')
            ->groupBy('recipient_user_id')
            ->pluck('n', 'recipient_user_id');

        // L'absence EN COURS : la règle du cycle de vie des délégations (`active()`, TCK-456), et non
        // `enVigueur()` (qui confère des droits) ni le `current` de la liste (qui garde les absences à
        // venir). Deux absences actives d'un même agent ne devraient pas coexister (refus des
        // chevauchements, TCK-591) ; si c'était le cas, la plus lointaine l'emporte.
        $absences = RoleDelegation::query()
            ->absences()
            ->active()
            ->where('agency_id', $agencyId)
            ->whereIn('replaces_user_id', $ids)
            ->with('user:id,first_name,last_name,username')
            ->orderBy('ends_at')
            ->orderBy('id')
            ->get()
            ->keyBy('replaces_user_id');

        return [
            'date' => $aDakar->toDateString(),
            'agents' => $agents->map(function (AgentProfile $profile) use ($visites, $demandes, $absences): array {
                $id = (int) $profile->user_id;
                $user = $profile->user;
                $absence = $absences[$id] ?? null;
                $premiere = $visites[$id]->premiere ?? null;

                return [
                    'user_id' => $id,
                    'name' => $user?->nameWithoutContact(),
                    'avatar_url' => $user?->avatarUrl(),
                    'visits_today_count' => (int) ($visites[$id]->n ?? 0),
                    // Une colonne lue par `toBase()` sort en chaîne : relue dans le fuseau de l'application.
                    'first_visit_at' => $premiere !== null ? BaseResource::instantOnWire(Carbon::parse($premiere, config('app.timezone'))) : null,
                    'open_leads_count' => (int) ($demandes[$id] ?? 0),
                    'current_absence' => $absence === null ? null : [
                        'ends_at' => BaseResource::instantOnWire($absence->ends_at),
                        'substitute' => $this->personne($absence->user),
                    ],
                ];
            })->values()->all(),
        ];
    }

    /** @return array{id: int, name: string}|null */
    private function personne(?User $user): ?array
    {
        return $user === null ? null : ['id' => (int) $user->id, 'name' => $user->nameWithoutContact()];
    }
}
