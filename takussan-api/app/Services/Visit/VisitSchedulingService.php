<?php

namespace App\Services\Visit;

use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * TCK-075 — Central scheduling rules for {@see PropertyVisit}.
 *
 * TCK-3005 — les INVARIANTS du calendrier (chevauchement, quota, agent libre, ordre des verrous) et
 * le calcul des créneaux ; toute transition d'une visite vit dans {@see GestesDeLaVisite}, qui les appelle.
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
     * TCK-2744 (contre-vérification) — chaque créneau se juge sur `[début, début + $durationMinutes)`,
     * l'intervalle que `confirm` comparera ({@see self::assertNoOverlap()}, {@see self::assertAgentFree()}) :
     * jugée sur 30 min, une visite de 45 min voyait 09:30 libre devant une occupation de 10:00, que la
     * confirmation refusait. Sans durée, celle d'une visite qui n'en porte pas.
     *
     * @return list<array{start: string, label: string, available: bool}>
     */
    public function availableSlots(Property $property, CarbonImmutable $date, ?User $agent = null, ?int $durationMinutes = null): array
    {
        $duration = $durationMinutes ?? self::DEFAULT_DURATION_MINUTES;
        $day = $date->setTimezone(self::TIMEZONE)->startOfDay();
        $first = $day->setTimeFromTimeString(self::GRID_FIRST);
        $last = $day->setTimeFromTimeString(self::GRID_LAST);
        $earliest = CarbonImmutable::now()->addMinutes(self::SLOT_LEAD_MINUTES);

        $busy = PropertyVisit::query()
            ->where('status', VisitStatus::Confirmed)
            ->whereNotNull('scheduled_at')
            // TCK-2502 — une visite à tranche n'a pas d'heure : elle n'occupe aucun créneau.
            ->whereNull('preferred_window')
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
            $end = $start->addMinutes($duration);
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
     * Pass `$lockForUpdate = true` when called inside a DB transaction: the PROPERTY row is locked
     * (a no-op when the caller already holds it, which every writer does —
     * {@see self::verrouillerBienPuisVisite()}), closing the TOCTOU window between the read and the
     * write, inserts included. TCK-2744 (d1) — it used to lock the OTHER confirmed visits of the
     * property instead: two `update`s on two visits of the same property, each holding its own visit,
     * then waited for each other's (PostgreSQL 40P01, 19 runs out of 20).
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

        if ($lockForUpdate) {
            $this->verrouillerBien((int) $visit->property_id);
        }

        $query = PropertyVisit::query()
            ->where('property_id', $visit->property_id)
            // TCK-590 — une visite pas encore enregistrée (planification console) n'a pas d'id :
            // `id != NULL` ne vaut jamais vrai en SQL, et aurait écarté toutes les candidates.
            ->when($visit->exists, fn ($q) => $q->where('id', '!=', $visit->id))
            ->where('status', VisitStatus::Confirmed)
            ->whereNotNull('scheduled_at')
            // TCK-2502 — ni une visite à tranche, dont l'heure n'est pas fixée.
            ->whereNull('preferred_window');

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

        abort_code_if(
            $overlap !== null,
            422,
            'visit.slot_overlap'
        );
    }

    /**
     * TCK-2744 — un agent n'a qu'une visite à la fois : 422 `visit.agent_overlap` si l'agent a déjà une
     * visite qui OCCUPE (confirmée, à heure fixée — la définition de {@see self::assertNoOverlap()} et
     * de la grille {@see self::availableSlots()}) sur l'intervalle semi-ouvert `[début, début + durée)`,
     * quelle que soit l'agence du bien : la personne compte, pas l'agence. Une durée absente vaut
     * {@see self::DEFAULT_DURATION_MINUTES}, des deux côtés. Rien n'est jugé sans agent ni heure.
     *
     * Le refus ne dit rien de la visite qui occupe l'agent (ni id, ni bien, ni agence). Point de
     * sérialisation : la ligne `users` de l'agent, verrouillée AVANT la lecture de ses visites —
     * deux confirmations simultanées sur deux biens verrouillent chacune leur bien, jamais l'autre
     * (`takussan-api/CLAUDE.md`, piège n° 2 : la ligne parent). À appeler dans la transaction qui
     * écrit, après {@see self::assertNoOverlap()} : quand le bien et l'agent sont pris, c'est
     * `visit.slot_overlap` qui sort.
     */
    public function assertAgentFree(
        PropertyVisit $visit,
        ?int $agentId,
        ?CarbonInterface $start,
        ?int $durationMinutes,
        bool $lockForUpdate = false,
    ): void {
        if ($agentId === null || $start === null) {
            return;
        }
        $start = CarbonImmutable::instance($start);
        $end = $start->addMinutes($durationMinutes ?? self::DEFAULT_DURATION_MINUTES);

        if ($lockForUpdate) {
            User::query()->whereKey($agentId)->lockForUpdate()->first(['id']);
        }

        $occupee = PropertyVisit::query()
            ->where('agent_id', $agentId)
            ->when($visit->exists, fn ($q) => $q->where('id', '!=', $visit->id))
            ->where('status', VisitStatus::Confirmed)
            ->whereNotNull('scheduled_at')
            ->whereNull('preferred_window')
            ->get(['id', 'scheduled_at', 'duration_minutes'])
            ->contains(function (PropertyVisit $other) use ($start, $end): bool {
                $otherStart = CarbonImmutable::instance($other->scheduled_at);
                $otherEnd = $otherStart->addMinutes($other->duration_minutes ?? self::DEFAULT_DURATION_MINUTES);

                return $start->lt($otherEnd) && $end->gt($otherStart);
            });

        abort_code_if($occupee, 422, 'visit.agent_overlap');
    }

    /**
     * TCK-2744 (d1) — L'ORDRE DES VERROUS de tout écrivain d'une visite, et il n'y en a qu'un : la
     * ligne du BIEN, puis celle de la visite, puis ({@see self::assertAgentFree()}) celle de l'agent.
     * Le bien est le point de sérialisation des visites d'un bien (`takussan-api/CLAUDE.md`, piège
     * n° 2 : la ligne parent) ; deux écrivains d'un même bien s'y attendent au lieu de se croiser sur
     * leurs visites. Les transitions de {@see GestesDeLaVisite} (confirmer, proposer un créneau, clore,
     * absent, annuler), `update`, `claim` et `bulk-assign` passent ici ; `GestesDeLaVisite::planifier`
     * n'a pas encore de visite et verrouille le bien seul. Le compte rendu, qui ne tient qu'UNE ligne,
     * ne peut pas fermer de cycle.
     * `VisitAgentOverlapTest::test_chaque_ecrivain_verrouille_le_bien_puis_la_visite_puis_l_agent`
     * épingle l'ordre, chemin par chemin.
     *
     * @return PropertyVisit la visite relue sous verrou
     */
    public function verrouillerBienPuisVisite(PropertyVisit $visit): PropertyVisit
    {
        $this->verrouillerBien((int) $visit->property_id);

        return PropertyVisit::query()->whereKey($visit->getKey())->lockForUpdate()->firstOrFail();
    }

    /** La ligne du bien sous verrou, corbeille comprise : un bien supprimé garde ses visites. */
    public function verrouillerBien(int $propertyId): void
    {
        Property::withTrashed()->whereKey($propertyId)->lockForUpdate()->first(['id']);
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

        abort_code_if(
            $query->count() >= self::MAX_ACTIVE_VISITS_PER_CUSTOMER,
            422,
            'visit.active_limit_reached',
            ['max' => self::MAX_ACTIVE_VISITS_PER_CUSTOMER]
        );
    }
}
