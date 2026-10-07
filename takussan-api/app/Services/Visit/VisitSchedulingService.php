<?php

namespace App\Services\Visit;

use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-075 — Central scheduling rules for {@see PropertyVisit}.
 *
 * Enforces two business invariants that the controller would otherwise
 * duplicate across store/confirm/update:
 *
 *   - **Overlap**: an agent cannot confirm two visits on the same property
 *     whose time windows intersect.
 *   - **Quota**: a visitor cannot hold more than 3 active visits
 *     (`scheduled` + `confirmed`) on a single property at once.
 *
 * Both rules abort with HTTP 422 so the frontend can surface them as
 * validation failures rather than generic server errors.
 */
class VisitSchedulingService
{
    public const MAX_ACTIVE_VISITS_PER_CUSTOMER = 3;

    public const DEFAULT_DURATION_MINUTES = 30;

    /** @var array<int,VisitStatus> */
    public const ACTIVE_STATUSES = [
        VisitStatus::Scheduled,
        VisitStatus::Confirmed,
    ];

    /**
     * TCK-590 (contrainte 6) — l'heure d'une visite se construit à Dakar, côté front comme côté
     * serveur. Le serveur est en UTC (`config/app.php`) et Dakar est à UTC+0 sans heure d'été :
     * les deux coïncident aujourd'hui, et c'est précisément ce qui cachait le défaut du front.
     */
    public const TIMEZONE = 'Africa/Dakar';

    /** La grille des créneaux proposés : premier départ, dernier départ, pas (minutes). */
    public const GRID_FIRST = '09:00';

    public const GRID_LAST = '18:30';

    public const GRID_STEP_MINUTES = 30;

    /** Délai minimal entre maintenant et un créneau proposé. */
    public const SLOT_LEAD_MINUTES = 30;

    /**
     * L'instant tombe-t-il sur un départ de la grille, à Dakar ?
     */
    public static function estSurLaGrille(CarbonInterface $instant): bool
    {
        $local = CarbonImmutable::instance($instant)->setTimezone(self::TIMEZONE);
        $hhmm = $local->format('H:i');

        return $local->second === 0
            && $local->minute % self::GRID_STEP_MINUTES === 0
            && $hhmm >= self::GRID_FIRST
            && $hhmm <= self::GRID_LAST;
    }

    /**
     * TCK-590 — les créneaux d'une journée, à Dakar, avec leur disponibilité.
     *
     * Un créneau est indisponible s'il part dans moins de {@see self::SLOT_LEAD_MINUTES} minutes,
     * ou s'il chevauche une visite CONFIRMÉE du bien — ou de l'agent pressenti, qui ne visite pas
     * deux biens à la fois. Rien n'est rendu sur les visites qui l'occupent : ni qui, ni pourquoi.
     *
     * @return list<array{start: string, label: string, available: bool}>
     */
    public function availableSlots(Property $property, CarbonImmutable $date, ?User $agent = null): array
    {
        $day = $date->setTimezone(self::TIMEZONE)->startOfDay();
        $first = $day->setTimeFromTimeString(self::GRID_FIRST);
        $last = $day->setTimeFromTimeString(self::GRID_LAST);
        $earliest = CarbonImmutable::now()->addMinutes(self::SLOT_LEAD_MINUTES);

        $busy = PropertyVisit::query()
            ->where('status', VisitStatus::Confirmed)
            ->whereNotNull('scheduled_at')
            ->where(function ($q) use ($property, $agent) {
                $q->where('property_id', $property->id);
                if ($agent !== null) {
                    $q->orWhere('agent_id', $agent->id);
                }
            })
            // Une visite confirmée de la veille au soir ne déborde pas sur 09:00 ; on borne
            // large (fenêtre de la journée ± 1 jour) plutôt que de calculer la durée en SQL.
            ->whereBetween('scheduled_at', [$first->subDay()->utc(), $last->addDay()->utc()])
            ->get(['scheduled_at', 'duration_minutes'])
            ->map(fn (PropertyVisit $v) => [
                CarbonImmutable::instance($v->scheduled_at),
                CarbonImmutable::instance($v->scheduled_at)->addMinutes($v->duration_minutes ?? self::DEFAULT_DURATION_MINUTES),
            ]);

        $slots = [];
        for ($start = $first; $start->lte($last); $start = $start->addMinutes(self::GRID_STEP_MINUTES)) {
            $end = $start->addMinutes(self::DEFAULT_DURATION_MINUTES);
            $taken = $busy->contains(fn (array $b) => $start->lt($b[1]) && $end->gt($b[0]));

            $slots[] = [
                'start' => $start->utc()->format('Y-m-d\TH:i:s\Z'),
                'label' => $start->format('H:i'),
                'available' => ! $taken && $start->gte($earliest),
            ];
        }

        return $slots;
    }

    /**
     * Abort with 422 if confirming `$visit` would overlap another
     * confirmed visit on the same property. Accepts optional override
     * values for reschedule scenarios (update endpoint).
     *
     * Pass `$lockForUpdate = true` when called inside a DB transaction
     * to pessimistically lock the candidate rows and close the TOCTOU
     * window between the read and the subsequent status flip.
     */
    public function assertNoOverlap(
        PropertyVisit $visit,
        ?Carbon $scheduledAt = null,
        ?int $durationMinutes = null,
        bool $lockForUpdate = false,
    ): void {
        $start = $scheduledAt ?? $visit->scheduled_at;
        if (! $start) {
            return;
        }
        $duration = $durationMinutes ?? $visit->duration_minutes ?? self::DEFAULT_DURATION_MINUTES;
        $end = $start->copy()->addMinutes($duration);

        $query = PropertyVisit::query()
            ->where('property_id', $visit->property_id)
            // TCK-590 — une visite pas encore enregistrée (planification console) n'a pas d'id :
            // `id != NULL` ne vaut jamais vrai en SQL, et aurait écarté toutes les candidates.
            ->when($visit->exists, fn ($q) => $q->where('id', '!=', $visit->id))
            ->where('status', VisitStatus::Confirmed)
            ->whereNotNull('scheduled_at');

        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

        $overlap = $query
            ->get(['id', 'scheduled_at', 'duration_minutes'])
            ->first(function (PropertyVisit $other) use ($start, $end) {
                $otherStart = $other->scheduled_at;
                if (! $otherStart) {
                    return false;
                }
                $otherDuration = $other->duration_minutes ?? self::DEFAULT_DURATION_MINUTES;
                $otherEnd = $otherStart->copy()->addMinutes($otherDuration);

                return $start->lt($otherEnd) && $end->gt($otherStart);
            });

        abort_if(
            $overlap !== null,
            422,
            'Another confirmed visit already overlaps this time slot on this property.'
        );
    }

    /**
     * Transactional confirm: re-read the visit with a row lock, run the
     * overlap guard against freshly-locked candidate rows, then flip the
     * status to `confirmed` inside the same transaction.
     *
     * Two concurrent `POST /confirm` calls used to both pass the
     * non-locking overlap check and both win; the row lock here
     * serializes them so only one can confirm.
     */
    public function confirmOrFail(PropertyVisit $visit): PropertyVisit
    {
        return DB::transaction(function () use ($visit) {
            $fresh = PropertyVisit::query()
                ->whereKey($visit->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $fresh->status === VisitStatus::Scheduled,
                422,
                'Only scheduled visits can be confirmed.'
            );

            $this->assertNoOverlap($fresh, lockForUpdate: true);

            $fresh->update(['status' => VisitStatus::Confirmed]);

            return $fresh;
        });
    }

    /**
     * Abort with 422 if the visitor already holds
     * {@see self::MAX_ACTIVE_VISITS_PER_CUSTOMER} active visits on the
     * same property. Called at creation time only.
     *
     * Pass `$lockForUpdate = true` when invoked inside a DB transaction
     * to pessimistically lock the candidate rows; without it, two
     * concurrent requests could both read `count = 3` and both insert.
     */
    public function assertQuota(
        Property $property,
        ?User $visitor,
        ?int $customerId = null,
        bool $lockForUpdate = false,
    ): void {
        if (! $visitor && ! $customerId) {
            // Anonymous requests are rate-limited at the route level.
            return;
        }

        $query = PropertyVisit::query()
            ->where('property_id', $property->id)
            ->whereIn('status', self::ACTIVE_STATUSES);

        if ($visitor) {
            $query->where(function ($q) use ($visitor, $customerId) {
                $q->where('visitor_id', $visitor->id);
                if ($customerId) {
                    $q->orWhere('customer_id', $customerId);
                }
            });
        } elseif ($customerId) {
            $query->where('customer_id', $customerId);
        }

        if ($lockForUpdate) {
            // ⚠ Le verrou porte sur le BIEN, pas sur les visites — même correction, même
            // raison que `PropertyCollaboratorController::assertCommissionWithinCapLocked()`.
            //
            // PostgreSQL refuse `FOR UPDATE` sur un agrégat (« FOR UPDATE is not allowed with
            // aggregate functions »), ce qui a rendu le défaut visible. Mais le défaut n'était
            // pas syntaxique : verrouiller les visites EXISTANTES ne ferme pas la course que ce
            // quota garde. Deux demandes simultanées d'un même visiteur sur un bien à 2 visites
            // actives lisent toutes deux 2, concluent toutes deux que 2 < 3, et le visiteur
            // finit à 4. C'est un INSERT concurrent — aucun verrou de ligne existante ne le voit.
            //
            // Verrouiller la ligne du bien sérialise TOUS les écrivains de visites sur ce bien,
            // insertions comprises, sur n'importe quel moteur. Plus large que nécessaire — le
            // quota est par couple (bien, visiteur) — mais les demandes de visite sont rares et
            // un seul patron vaut mieux que deux à retenir.
            Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();
        }

        abort_if(
            $query->count() >= self::MAX_ACTIVE_VISITS_PER_CUSTOMER,
            422,
            sprintf(
                'You already have %d active visits on this property. Cancel one before requesting another.',
                self::MAX_ACTIVE_VISITS_PER_CUSTOMER,
            )
        );
    }

    /**
     * Transactional create: enforce the per-customer quota with a row
     * lock on the existing active visits before inserting. Closes the
     * TOCTOU window where two parallel requests from the same visitor
     * could both pass `assertQuota` and end up with `count + 2` active
     * visits.
     *
     * @param  array<string,mixed>  $attributes  payload passed to PropertyVisit::create
     */
    public function createOrFail(Property $property, ?User $visitor, array $attributes): PropertyVisit
    {
        return DB::transaction(function () use ($property, $visitor, $attributes) {
            $this->assertQuota(
                $property,
                $visitor,
                $attributes['customer_id'] ?? null,
                lockForUpdate: true,
            );

            return PropertyVisit::create($attributes);
        });
    }

    /**
     * TCK-590 — la planification par le personnel : la visite naît CONFIRMÉE, donc le garde de
     * chevauchement court avant l'insertion, sous le même verrou de bien que le quota.
     *
     * @param  array<string,mixed>  $attributes
     */
    public function createConfirmedOrFail(Property $property, ?User $visitor, array $attributes): PropertyVisit
    {
        return DB::transaction(function () use ($property, $visitor, $attributes) {
            $this->assertQuota($property, $visitor, $attributes['customer_id'] ?? null, lockForUpdate: true);

            $candidate = new PropertyVisit($attributes);
            $candidate->property_id = $property->id;
            $this->assertNoOverlap($candidate, lockForUpdate: true);

            return PropertyVisit::create(array_merge($attributes, ['status' => VisitStatus::Confirmed]));
        });
    }

    /**
     * TCK-590 — le visiteur propose un autre créneau : nouvelle heure, et la visite REPASSE en
     * attente de confirmation (`scheduled`), même si elle était confirmée. Le créneau ne doit
     * chevaucher aucune visite confirmée du bien.
     */
    public function rescheduleOrFail(PropertyVisit $visit, CarbonInterface $scheduledAt): PropertyVisit
    {
        return DB::transaction(function () use ($visit, $scheduledAt) {
            $fresh = PropertyVisit::query()->whereKey($visit->id)->lockForUpdate()->firstOrFail();

            abort_unless(
                in_array($fresh->status, self::ACTIVE_STATUSES, true),
                422,
                __('visits.reschedule_inactive'),
            );

            $this->assertNoOverlap($fresh, Carbon::instance($scheduledAt), lockForUpdate: true);

            $fresh->update([
                'scheduled_at' => $scheduledAt,
                'status' => VisitStatus::Scheduled,
            ]);

            return $fresh;
        });
    }
}
