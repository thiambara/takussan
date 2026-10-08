<?php

namespace App\Services\Calendar;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * TCK-591 — les événements d'agenda d'un utilisateur, pour la console (`GET /api/calendar`) et pour
 * le flux iCalendar (ADR-0034). Un seul corps : le flux rend exactement ce que la console rendrait.
 *
 * ## Le périmètre (non super-admin)
 *
 * Il ne lit plus `$user->agency_id` — l'agence du profil actif QUEL QU'IL SOIT : un bailleur de
 * l'agence voyait les réservations et visites de tous les biens de l'agence. Les biens visibles sont :
 *
 *   · ceux dont l'appelant est propriétaire (`user_id`) ;
 *   · ceux de l'agence où il est PERSONNEL (`$staffAgencyId`, prédicat de TCK-587) ;
 *   · ceux dont il est collaborateur accepté — branche conservée telle quelle (dette D-66 : ni
 *     élargie, ni retirée ; `accepted_at` n'est écrit par rien).
 *
 * La branche « visite dont je suis l'agent » (`agent_id = moi`) ne s'ajoute plus SANS condition :
 * un agent retiré de l'agence voyait encore, dans son agenda, les visites qui lui restaient
 * assignées. Elle n'est plus qu'un filtre (`mine`), à l'intérieur du périmètre.
 *
 * Les tâches sont personnelles (même règle que `TaskPolicy::view`) ; les interventions planifiées
 * suivent le périmètre des biens, plus celles assignées à l'appelant (le prestataire).
 */
class CalendarEventCollector
{
    public const TYPES = ['booking', 'visit', 'task', 'lease_event', 'maintenance'];

    /** Les types que la console demande quand l'appel n'en nomme aucun (contrat d'origine). */
    public const DEFAULT_TYPES = ['booking', 'visit'];

    /**
     * @param  list<string>  $types
     * @param  list<int>  $propertyIds
     * @return Collection<int, array<string, mixed>>
     */
    public function collect(
        User $user,
        ?int $staffAgencyId,
        Carbon $start,
        Carbon $end,
        array $types,
        bool $mine = false,
        ?int $propertyId = null,
        array $propertyIds = [],
        ?int $agencyFilter = null,
    ): Collection {
        $isAdmin = $user->isSuperAdmin();
        $userId = (int) $user->id;
        // TCK-591 (verif-591 B1) — une affectation n'ouvre l'agenda que dans les agences où l'on est
        // personnel ; le prestataire, qui n'est personnel nulle part, garde ses interventions.
        $staffAgencyIds = $isAdmin ? [] : app(MembershipCapabilityResolver::class)->staffAgencyIds($user);
        $memberAgencyIds = $isAdmin ? [] : app(MembershipCapabilityResolver::class)->memberAgencyIds($user);
        $isProvider = ! $isAdmin && $user->serviceProviderProfile()->active()->exists();
        // verif-591 passe 2 (N2, ADR-0034) — une agence donnée (le lien, ou le profil actif de la
        // console) borne aussi les tâches et interventions à CETTE agence : un flux n'agrège jamais
        // deux agences. Le lien de A servait la tâche et l'intervention de B au même agent ; révoqué
        // ou divulgué dans A, il exposait B, qui ne pouvait ni le voir ni le couper. « Toutes mes
        // agences » reste la forme de `GET /api/tasks`.
        if (! $isAdmin && $staffAgencyId !== null) {
            $staffAgencyIds = array_values(array_intersect($staffAgencyIds, [$staffAgencyId]));
            $memberAgencyIds = array_values(array_intersect($memberAgencyIds, [$staffAgencyId]));
        }
        // Le prestataire n'est borné nulle part, sauf dans l'agenda d'une agence.
        $unboundedProvider = $isProvider && $staffAgencyId === null;

        $restrict = function (Builder $q, string $propertyKey = 'property_id') use ($propertyId, $propertyIds, $agencyFilter, $isAdmin, $userId, $staffAgencyId): void {
            if ($propertyId) {
                $q->where($propertyKey, $propertyId);
            }
            if ($propertyIds !== []) {
                $q->whereIn($propertyKey, $propertyIds);
            }
            if ($agencyFilter !== null) {
                $q->whereHas('property', fn (Builder $p) => $p->where('agency_id', $agencyFilter));
            }
            if (! $isAdmin) {
                $q->whereHas('property', fn (Builder $p) => self::scopeVisibleProperties($p, $userId, $staffAgencyId));
            }
        };

        $events = collect();

        if (in_array('booking', $types, true)) {
            $events = $events->merge($this->bookings($start, $end, $restrict));
        }
        if (in_array('visit', $types, true)) {
            $events = $events->merge($this->visits($start, $end, $restrict, $mine, $userId));
        }
        if (in_array('task', $types, true)) {
            $events = $events->merge($this->tasks($start, $end, $mine, $userId, $isAdmin, $staffAgencyIds, $memberAgencyIds));
        }
        if (in_array('lease_event', $types, true)) {
            $events = $events->merge($this->leaseEvents($start, $end, $restrict));
        }
        if (in_array('maintenance', $types, true)) {
            $events = $events->merge($this->maintenance($start, $end, $restrict, $mine, $userId, $isAdmin, $propertyId, $propertyIds, $agencyFilter, $staffAgencyIds, $unboundedProvider));
        }

        return $events->sortBy('start')->values();
    }

    /**
     * Les biens qu'un non-super-admin voit dans son agenda.
     */
    public static function scopeVisibleProperties(Builder $p, int $userId, ?int $staffAgencyId): void
    {
        $p->where(function (Builder $inner) use ($userId, $staffAgencyId): void {
            $inner->where('user_id', $userId);
            if ($staffAgencyId !== null) {
                $inner->orWhere('agency_id', $staffAgencyId);
            }
            // D-66 — branche collaborateur conservée telle quelle.
            $inner->orWhereHas('collaborators', function (Builder $c) use ($userId): void {
                $c->where('user_id', $userId)->whereNotNull('accepted_at');
            });
        });
    }

    /** @return Collection<int, array<string, mixed>> */
    private function bookings(Carbon $start, Carbon $end, \Closure $restrict): Collection
    {
        $query = Booking::query()
            ->whereIn('status', [BookingStatus::Confirmed, BookingStatus::Pending])
            ->whereDate('start_date', '<=', $end)
            ->whereDate('end_date', '>=', $start);
        $restrict($query);

        return $query->with('property:id,title,slug')->get()->map(fn (Booking $b) => [
            'key' => "booking-{$b->id}",
            'id' => $b->id,
            'type' => 'booking',
            'title' => $b->property?->title ?? __('messages.booking'),
            'start' => $b->start_date instanceof Carbon ? $b->start_date->toDateTimeString() : (string) $b->start_date,
            'end' => $b->end_date instanceof Carbon ? $b->end_date->toDateTimeString() : (string) $b->end_date,
            'status' => $b->status,
            'all_day' => true,
            'reference' => $b->reference_number,
            'property_id' => $b->property_id,
            'property_slug' => $b->property?->slug,
            'resource_url' => "/app/bookings/{$b->id}",
        ]);
    }

    /** @return Collection<int, array<string, mixed>> */
    private function visits(Carbon $start, Carbon $end, \Closure $restrict, bool $mine, int $userId): Collection
    {
        $query = PropertyVisit::query()
            ->whereIn('status', [VisitStatus::Scheduled, VisitStatus::Confirmed])
            ->whereDate('scheduled_at', '>=', $start)
            ->whereDate('scheduled_at', '<=', $end);
        $restrict($query);
        if ($mine) {
            $query->where('agent_id', $userId);
        }

        return $query->with('property:id,title,slug')->get()->map(function (PropertyVisit $v) {
            $startAt = $v->scheduled_at;
            $endAt = $startAt && $v->duration_minutes
                ? $startAt->copy()->addMinutes((int) $v->duration_minutes)
                : $startAt;

            return [
                'key' => "visit-{$v->id}",
                'id' => $v->id,
                'type' => 'visit',
                'title' => $v->property?->title ?? __('messages.visit'),
                'start' => $startAt?->toDateTimeString(),
                'end' => $endAt?->toDateTimeString(),
                'status' => $v->status,
                'all_day' => false,
                'duration_minutes' => $v->duration_minutes,
                'property_id' => $v->property_id,
                'property_slug' => $v->property?->slug,
                'resource_url' => "/app/visits/{$v->id}",
            ];
        });
    }

    /**
     * Les tâches personnelles à échéance dans la fenêtre — celles que l'utilisateur a créées ou
     * qui lui sont assignées (`mine` : assignées seulement). Le titre est celui que l'agent a
     * écrit ; la description ne sort pas.
     *
     * @param  list<int>  $staffAgencyIds
     * @param  list<int>  $memberAgencyIds
     * @return Collection<int, array<string, mixed>>
     */
    private function tasks(Carbon $start, Carbon $end, bool $mine, int $userId, bool $isAdmin, array $staffAgencyIds, array $memberAgencyIds): Collection
    {
        $query = Task::query()
            ->whereNotNull('due_at')
            ->where('due_at', '>=', $start->copy()->startOfDay())
            ->where('due_at', '<=', $end->copy()->endOfDay())
            ->where('status', '!=', TaskStatus::Cancelled->value);

        $assigned = function (Builder $q) use ($userId, $isAdmin, $staffAgencyIds): void {
            $q->where('assigned_to_id', $userId);
            if (! $isAdmin) {
                $q->parentAgencyIn($staffAgencyIds);
            }
        };

        if ($mine) {
            $query->where($assigned);
        } else {
            $created = function (Builder $q) use ($userId, $isAdmin, $memberAgencyIds): void {
                $q->where('created_by_id', $userId);
                if (! $isAdmin) {
                    $q->parentAgencyIn($memberAgencyIds);
                }
            };
            $query->where(fn (Builder $q) => $q->where($assigned)->orWhere($created));
        }

        return $query->get()->map(fn (Task $t) => [
            'key' => "task-{$t->id}",
            'id' => $t->id,
            'type' => 'task',
            'title' => $t->title,
            'start' => $t->due_at?->toDateTimeString(),
            'end' => $t->due_at?->toDateTimeString(),
            'status' => $t->status?->value,
            'all_day' => false,
            'taskable_type' => match ($t->taskable_type) {
                Customer::class => 'customer',
                Property::class => 'property',
                default => null,
            },
            'taskable_id' => $t->taskable_id,
            'property_id' => $t->taskable_type === Property::class ? $t->taskable_id : null,
            'resource_url' => '/app/tasks',
        ]);
    }

    /**
     * La fin et le renouvellement des baux vivants, en journée entière. Le titre est celui du bien :
     * ni le nom du locataire ni son téléphone (données d'un tiers).
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function leaseEvents(Carbon $start, Carbon $end, \Closure $restrict): Collection
    {
        $query = Lease::query()
            ->whereIn('status', [LeaseStatus::Active, LeaseStatus::PendingSignature, LeaseStatus::Terminating])
            ->where(function (Builder $q) use ($start, $end) {
                $q->whereBetween('end_date', [$start->toDateString(), $end->toDateString()])
                    ->orWhereBetween('renewal_date', [$start->toDateString(), $end->toDateString()]);
            });
        $restrict($query);

        $events = collect();
        foreach ($query->with('property:id,title,slug')->get() as $lease) {
            foreach (['end' => $lease->end_date, 'renewal' => $lease->renewal_date] as $kind => $date) {
                if ($date === null) {
                    continue;
                }
                $day = Carbon::parse($date);
                if ($day->lt($start->copy()->startOfDay()) || $day->gt($end->copy()->endOfDay())) {
                    continue;
                }
                $events->push([
                    'key' => "lease_event-{$lease->id}-{$kind}",
                    'id' => $lease->id,
                    'type' => 'lease_event',
                    'kind' => $kind,
                    'title' => $lease->property?->title ?? $lease->reference_number,
                    'start' => $day->copy()->startOfDay()->toDateTimeString(),
                    'end' => $day->copy()->startOfDay()->toDateTimeString(),
                    'status' => $lease->status?->value,
                    'all_day' => true,
                    'reference' => $lease->reference_number,
                    'property_id' => $lease->property_id,
                    'property_slug' => $lease->property?->slug,
                    'resource_url' => "/app/leases/{$lease->id}",
                ]);
            }
        }

        return $events;
    }

    /**
     * Les interventions planifiées : celles des biens du périmètre, et celles assignées à
     * l'appelant (le prestataire, qui n'a aucun bien).
     *
     * TCK-592 — expression équivalente de `MaintenanceRequest::scopeVisibleTo()`, remplacée à sa
     * fusion.
     *
     * @param  list<int>  $propertyIds
     * @param  list<int>  $staffAgencyIds
     * @return Collection<int, array<string, mixed>>
     */
    private function maintenance(
        Carbon $start,
        Carbon $end,
        \Closure $restrict,
        bool $mine,
        int $userId,
        bool $isAdmin,
        ?int $propertyId,
        array $propertyIds,
        ?int $agencyFilter,
        array $staffAgencyIds = [],
        bool $isProvider = false,
    ): Collection {
        // L'intervention assignée à l'appelant : au prestataire partout, au personnel dans ses agences.
        $assigned = function (Builder $q) use ($userId, $isAdmin, $isProvider, $staffAgencyIds): void {
            $q->where('assigned_to', $userId);
            if (! $isAdmin && ! $isProvider) {
                $q->whereHas('property', fn (Builder $p) => $p->whereIn('agency_id', $staffAgencyIds));
            }
        };

        $query = MaintenanceRequest::query()
            ->whereNotNull('scheduled_at')
            ->whereDate('scheduled_at', '>=', $start)
            ->whereDate('scheduled_at', '<=', $end)
            ->whereNotIn('status', [
                MaintenanceStatus::Completed->value,
                MaintenanceStatus::Closed->value,
                MaintenanceStatus::Cancelled->value,
                MaintenanceStatus::Rejected->value,
            ]);

        if ($mine) {
            $query->where($assigned);
        }

        if ($isAdmin) {
            $restrict($query);
        } else {
            if ($propertyId) {
                $query->where('property_id', $propertyId);
            }
            if ($propertyIds !== []) {
                $query->whereIn('property_id', $propertyIds);
            }
            $query->where(function (Builder $q) use ($restrict, $assigned): void {
                $q->where($assigned)
                    ->orWhere(fn (Builder $scoped) => $restrict($scoped));
            });
        }

        return $query->with('property:id,title,slug')->get()->map(fn (MaintenanceRequest $m) => [
            'key' => "maintenance-{$m->id}",
            'id' => $m->id,
            'type' => 'maintenance',
            'title' => $m->property?->title ?? $m->title,
            'start' => $m->scheduled_at?->toDateTimeString(),
            'end' => $m->scheduled_at?->toDateTimeString(),
            'status' => $m->status?->value,
            'all_day' => false,
            'property_id' => $m->property_id,
            'property_slug' => $m->property?->slug,
            'resource_url' => "/app/maintenance/{$m->id}",
        ]);
    }
}
