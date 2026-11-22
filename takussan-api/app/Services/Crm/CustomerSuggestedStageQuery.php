<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\VisitReportOutcome;
use App\Models\Enums\VisitStatus;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-2591 (ADR-0103 § 5) — l'étape que les faits justifient, PROPOSÉE à l'agent, jamais écrite :
 * le passage reste `PATCH customers/{customer}/pipeline-stage`.
 *
 * **Le fait retenu** est le DERNIER fait postérieur au dernier changement d'étape de la fiche (la
 * dernière ligne du journal qui pose `pipeline_stage`, création comprise ; à défaut — fiche
 * écrite hors journal, seeders — sa création). Pris à la lettre : un fait plus récent mais qui
 * ne propose rien (une visite confirmée sur une fiche `qualified`) masque un fait antérieur qui
 * aurait proposé davantage. À égalité d'instant, le fait le plus avancé. « Postérieur » est
 * strict, sauf quand le dernier changement est la CRÉATION de la fiche ({@see self::after()}).
 *
 * | Fait (`reason`)                                          | Daté par            | Propose       |
 * |----------------------------------------------------------|---------------------|---------------|
 * | `visit_confirmed` — visite confirmée, ni annulée ni manquée | `confirmed_at`    | `prospect`    |
 * | `visit_interested` — compte rendu « intéressé » (TCK-2578) | `reported_at`     | `qualified`   |
 * | `application_created` / `offer_created` (TCK-2579), ni refusée, ni annulée, ni expirée | `created_at` | `negotiating` |
 * | `lease_signed` — bail signé dont la fiche est le locataire | `signed_at`       | `converted`   |
 *
 * Une visite est celle de la fiche (`customer_id`) ou de son compte (`visitor_id` =
 * `customers.user_id`) — la définition de `BookingCustomerFacts` (TCK-2593) —, celle du compte
 * sur un bien de l'agence de la fiche seulement (l'agence est la frontière d'isolation).
 *
 * **Rien n'est proposé** : vers une étape qui n'est pas en avant de l'étape courante (jamais en
 * arrière, jamais sur place), jamais vers `lost` (aucun fait n'y mène), jamais depuis `converted`
 * ou `lost` (étapes closes), et jamais pour un fait ÉCARTÉ — l'écart est journalisé sur la fiche
 * (`event = suggested_stage_dismissed`, le fait en propriétés) par {@see self::dismiss()}, et un
 * fait NOUVEAU propose à nouveau.
 *
 * Pour une page : une requête par source (fiches, journal, visites, comptes rendus, demandes,
 * baux, écarts), jamais une par fiche.
 */
final class CustomerSuggestedStageQuery
{
    public const DISMISSED_EVENT = 'suggested_stage_dismissed';

    public const VISIT_CONFIRMED = 'visit_confirmed';

    public const VISIT_INTERESTED = 'visit_interested';

    public const APPLICATION_CREATED = 'application_created';

    public const OFFER_CREATED = 'offer_created';

    public const LEASE_SIGNED = 'lease_signed';

    /** @var array<string, array{0: CustomerPipelineStage, 1: string}> raison → [étape, type du fait] */
    public const FACTS = [
        self::VISIT_CONFIRMED => [CustomerPipelineStage::Prospect, 'visit'],
        self::VISIT_INTERESTED => [CustomerPipelineStage::Qualified, 'visit_report'],
        self::APPLICATION_CREATED => [CustomerPipelineStage::Negotiating, 'booking'],
        self::OFFER_CREATED => [CustomerPipelineStage::Negotiating, 'booking'],
        self::LEASE_SIGNED => [CustomerPipelineStage::Converted, 'lease'],
    ];

    /** L'ordre du pipeline vivant : une proposition n'avance que dans ce sens. */
    private const ORDER = ['lead', 'prospect', 'qualified', 'negotiating', 'converted'];

    private const PIPELINE_STAGE_NEW = "attribute_changes->'attributes'->>'pipeline_stage'";

    /**
     * @param  list<int>  $ids
     * @return array<int, array{to: string, reason: string, at: string}|null>
     */
    public function forPage(array $ids): array
    {
        $out = array_fill_keys($ids, null);
        if ($ids === []) {
            return $out;
        }

        $stages = Customer::query()->whereIn('id', $ids)->pluck('pipeline_stage', 'id');
        foreach ($this->current($ids) as $customerId => $fact) {
            $stage = $stages[$customerId] ?? null;
            if ($fact['dismissed'] || ! $stage instanceof CustomerPipelineStage || ! self::advances($stage, $fact['to'])) {
                continue;
            }
            $out[$customerId] = [
                'to' => $fact['to']->value,
                'reason' => $fact['reason'],
                'at' => $fact['at']->toIso8601String(),
            ];
        }

        return $out;
    }

    /**
     * La proposition courante d'une fiche, ou `null` — la lecture de `forPage()` pour une fiche.
     *
     * @return array{type: string, id: int, reason: string, to: CustomerPipelineStage, at: CarbonInterface}|null
     */
    public function suggestionFor(Customer $customer): ?array
    {
        $fact = $this->current([(int) $customer->id])[(int) $customer->id] ?? null;
        $stage = $customer->pipeline_stage;
        if ($fact === null || $fact['dismissed'] || ! $stage instanceof CustomerPipelineStage || ! self::advances($stage, $fact['to'])) {
            return null;
        }
        unset($fact['dismissed']);

        return $fact;
    }

    /**
     * Le fait qu'on écarte est JOURNALISÉ sur la fiche, avec son identité : c'est cette trace que
     * relit {@see self::current()}. Un fait nouveau, lui, n'y figure pas.
     *
     * @param  array{type: string, id: int, reason: string, to: CustomerPipelineStage, at: CarbonInterface}  $fact
     */
    public static function dismiss(Customer $customer, User $by, array $fact): void
    {
        activity()
            ->performedOn($customer)
            ->causedBy($by)
            ->withProperties([
                'fact' => $fact['type'],
                'fact_id' => $fact['id'],
                'reason' => $fact['reason'],
                'to' => $fact['to']->value,
            ])
            ->event(self::DISMISSED_EVENT)
            ->log(self::DISMISSED_EVENT);
    }

    private static function advances(CustomerPipelineStage $from, CustomerPipelineStage $to): bool
    {
        $a = array_search($from->value, self::ORDER, true);
        $b = array_search($to->value, self::ORDER, true);

        // `converted` (fin du pipeline vivant) et `lost` (hors de l'ordre) ne reçoivent rien.
        return $a !== false && $b !== false && $from !== CustomerPipelineStage::Converted && $b > $a;
    }

    /**
     * Le dernier fait postérieur au dernier changement d'étape, par fiche, et s'il a été écarté.
     *
     * @param  list<int>  $ids
     * @return array<int, array{type: string, id: int, reason: string, to: CustomerPipelineStage, at: CarbonInterface, dismissed: bool}>
     */
    private function current(array $ids): array
    {
        $since = $this->lastStageChanges($ids);
        $best = [];
        foreach ($this->facts($ids) as $fact) {
            $customerId = $fact['customer_id'];
            if (! isset($since[$customerId]) || ! self::after($fact['at'], $since[$customerId])) {
                continue;
            }
            $rank = array_search($fact['to']->value, self::ORDER, true);
            $key = [$fact['at']->getTimestamp(), $rank, $fact['id']];
            if (! isset($best[$customerId]) || $key > $best[$customerId]['key']) {
                $best[$customerId] = ['key' => $key, 'fact' => $fact];
            }
        }

        $dismissed = $this->dismissedFacts(array_keys($best));
        $out = [];
        foreach ($best as $customerId => ['fact' => $fact]) {
            unset($fact['customer_id']);
            $out[$customerId] = $fact + ['dismissed' => isset($dismissed[$customerId][$fact['type'].':'.$fact['id']])];
        }

        return $out;
    }

    /**
     * Postérieur au dernier changement d'étape — strictement, sauf quand ce « changement » est la
     * création de la fiche. Les horodatages sont à la seconde : une fiche créée puis son premier
     * fait saisi dans la foulée (fiche puis candidature, `findOrCreateFromUser` puis visite) peuvent
     * partager la seconde. L'étape de création est un défaut, pas une décision prise au vu du
     * fait : ce fait-là compte. Un fait du même instant qu'un changement d'étape à la main, non.
     * Limite connue : si la ligne du journal de création et `customers.created_at` tombent de part
     * et d'autre d'une seconde, la création se lit comme un changement, et le fait de la même
     * seconde est écarté.
     *
     * @param  array{at: CarbonInterface, creation: bool}  $since
     */
    private static function after(CarbonInterface $at, array $since): bool
    {
        return $since['creation'] ? $at->greaterThanOrEqualTo($since['at']) : $at->greaterThan($since['at']);
    }

    /**
     * Le dernier changement d'étape de chaque fiche, et s'il est sa création (même instant).
     *
     * @param  list<int>  $ids
     * @return array<int, array{at: CarbonInterface, creation: bool}>
     */
    private function lastStageChanges(array $ids): array
    {
        $since = Customer::query()->whereIn('id', $ids)->pluck('created_at', 'id')
            ->map(fn ($at) => ['at' => $at !== null ? Carbon::parse($at) : Carbon::createFromTimestamp(0), 'creation' => true])
            ->all();

        Activity::query()
            ->where('subject_type', Customer::class)
            ->whereIn('subject_id', $ids)
            ->whereRaw(self::PIPELINE_STAGE_NEW.' IS NOT NULL')
            ->groupBy('subject_id')
            ->selectRaw('subject_id, MAX(created_at) as at')
            ->get()
            ->each(function ($row) use (&$since): void {
                $id = (int) $row->subject_id;
                $at = Carbon::parse($row->at);
                $since[$id] = ['at' => $at, 'creation' => isset($since[$id]) && $at->equalTo($since[$id]['at'])];
            });

        return $since;
    }

    /**
     * @param  list<int>  $ids
     * @return list<array{customer_id: int, type: string, id: int, reason: string, to: CustomerPipelineStage, at: CarbonInterface}>
     */
    private function facts(array $ids): array
    {
        $facts = [];
        $push = function (string $reason, iterable $rows) use (&$facts): void {
            [$to, $type] = self::FACTS[$reason];
            foreach ($rows as $row) {
                $facts[] = [
                    'customer_id' => (int) $row->customer_id,
                    'type' => $type,
                    'id' => (int) $row->fact_id,
                    'reason' => $reason,
                    'to' => $to,
                    'at' => Carbon::parse($row->at),
                ];
            }
        };

        // La visite de la fiche, ou celle de son compte — celle-ci sur un bien de l'agence de la
        // fiche seulement : l'agence est la frontière, la visite faite chez une autre agence n'est
        // pas un fait de cette fiche (ni sa proposition, ni son heure ne doivent fuiter).
        $visits = fn () => DB::table('property_visits as v')
            ->join('customers as c', fn (JoinClause $j) => $j
                ->on('c.id', '=', 'v.customer_id')
                ->orOn('c.user_id', '=', 'v.visitor_id'))
            ->leftJoin('properties as p', 'p.id', '=', 'v.property_id')
            ->whereIn('c.id', $ids)
            ->where(fn ($w) => $w
                ->whereColumn('v.customer_id', 'c.id')
                ->orWhereRaw('p.agency_id IS NOT DISTINCT FROM c.agency_id'));

        $push(self::VISIT_CONFIRMED, $visits()
            ->whereNotNull('v.confirmed_at')
            ->whereNotIn('v.status', [VisitStatus::Cancelled->value, VisitStatus::NoShow->value])
            ->get(['c.id as customer_id', 'v.id as fact_id', 'v.confirmed_at as at']));

        $push(self::VISIT_INTERESTED, $visits()
            ->where('v.report_outcome', VisitReportOutcome::Interested->value)
            ->whereNotNull('v.reported_at')
            ->get(['c.id as customer_id', 'v.id as fact_id', 'v.reported_at as at']));

        $bookings = DB::table('bookings')
            ->whereIn('customer_id', $ids)
            ->whereNull('deleted_at')
            ->whereNotIn('status', [BookingStatus::Rejected->value, BookingStatus::Cancelled->value, BookingStatus::Expired->value])
            ->get(['customer_id', 'id as fact_id', 'created_at as at', 'kind']);
        $push(self::APPLICATION_CREATED, $bookings->where('kind', BookingKind::Application->value));
        $push(self::OFFER_CREATED, $bookings->where('kind', BookingKind::Offer->value));

        $push(self::LEASE_SIGNED, DB::table('leases')
            ->whereIn('tenant_id', $ids)
            ->whereNull('deleted_at')
            ->whereNotNull('signed_at')
            ->get(['tenant_id as customer_id', 'id as fact_id', 'signed_at as at']));

        return $facts;
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array<string, true>> fiche → « type:id » écartés
     */
    private function dismissedFacts(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $out = [];
        Activity::query()
            ->where('subject_type', Customer::class)
            ->whereIn('subject_id', $ids)
            ->where('event', self::DISMISSED_EVENT)
            ->get(['subject_id', 'properties'])
            ->each(function (Activity $log) use (&$out): void {
                $type = $log->properties->get('fact');
                $id = $log->properties->get('fact_id');
                if (is_string($type) && is_numeric($id)) {
                    $out[(int) $log->subject_id][$type.':'.(int) $id] = true;
                }
            });

        return $out;
    }
}
