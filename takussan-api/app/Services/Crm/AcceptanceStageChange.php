<?php

namespace App\Services\Crm;

use App\Models\Activity;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\CustomerPipelineStage;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2874 (ADR-0110 § 8, qui précise ADR-0103 § 5) — accepter une candidature ou une offre
 * CONFIRME l'étape « Négociation » que {@see CustomerSuggestedStageQuery} propose déjà pour ce fait :
 * la fiche y passe si elle est en Prospect ou Qualifié — jamais depuis Nouveau, Gagné ou Perdu,
 * jamais en arrière, jamais pour un séjour. Rien ne change pour les autres faits.
 *
 * **Le changement est journalisé comme tout changement d'étape** : une ligne `updated` du journal
 * de la fiche, `attribute_changes.attributes.pipeline_stage` (la forme que relisent
 * `CustomerSuggestedStageQuery` et le fil de la fiche), plus le fait en propriétés (`cause`,
 * `booking_id`). Le journal automatique est suspendu le temps de l'écriture : sans quoi deux lignes
 * pour un même changement, dont une sans le fait.
 *
 * **Le retour arrière** ({@see self::undo()}) : dans les 24 h, et seulement si le DERNIER changement
 * d'étape de la fiche est encore celui-ci (409 sinon, 422 passé le délai). Il est journalisé de même
 * (`cause = stage_change_undone`, `undoes` = la ligne défaite) ; ce dernier changement n'étant plus
 * une acceptation, un second retour est refusé (409).
 *
 * Ce que l'acceptation a fait est aussi gardé sur la réservation (`metadata.stage_change` : `from`,
 * `to`, `at`, `undone_at`) : `BookingResource::stage_change` le sert sans requête par ligne.
 */
final class AcceptanceStageChange
{
    public const CAUSE = 'booking_accepted';

    public const UNDO_CAUSE = 'stage_change_undone';

    public const UNDO_WINDOW_HOURS = 24;

    /** Les étapes depuis lesquelles l'acceptation fait avancer la fiche (ADR-0110 § 8). */
    public const FROM = [CustomerPipelineStage::Prospect, CustomerPipelineStage::Qualified];

    public const TO = CustomerPipelineStage::Negotiating;

    /**
     * Dans la transaction de `BookingService::confirm()`, après le passage à `confirmed`. Rend le
     * changement fait (écrit aussi sur la réservation), ou `null` quand la fiche ne bouge pas.
     *
     * @return array{from: string, to: string, at: string}|null
     */
    public static function advance(Booking $booking): ?array
    {
        if (! in_array($booking->kind, [BookingKind::Application, BookingKind::Offer], true) || $booking->customer_id === null) {
            return null;
        }

        /** @var Customer|null $customer */
        $customer = Customer::query()->whereKey($booking->customer_id)->lockForUpdate()->first();
        $from = $customer?->pipeline_stage;
        if ($customer === null || ! in_array($from, self::FROM, true)) {
            return null;
        }

        self::write($customer, $from, self::TO, ['cause' => self::CAUSE, 'booking_id' => (int) $booking->id]);

        $change = ['from' => $from->value, 'to' => self::TO->value, 'at' => now()->toIso8601String()];
        $booking->forceFill(['metadata' => array_merge($booking->metadata ?? [], ['stage_change' => $change])])->save();

        return $change;
    }

    /**
     * Défaire le changement d'étape fait par l'acceptation (ADR-0110 § 8). L'autorisation (personnel
     * de l'agence de la fiche) est jugée avant, par `CustomerPolicy::undoPipelineStage`.
     */
    public static function undo(Customer $customer): Customer
    {
        return DB::transaction(function () use ($customer): Customer {
            /** @var Customer $locked */
            $locked = Customer::query()->whereKey($customer->getKey())->lockForUpdate()->firstOrFail();

            $last = self::lastStageChange($locked);
            $properties = $last?->properties;
            $to = $last !== null ? CustomerPipelineStage::tryFrom((string) data_get($last->attribute_changes, 'attributes.pipeline_stage')) : null;
            $from = $last !== null ? CustomerPipelineStage::tryFrom((string) data_get($last->attribute_changes, 'old.pipeline_stage')) : null;

            // L'étape a changé depuis l'acceptation (ou rien à défaire) : 409, le geste ne vaut plus.
            abort_code_if(
                $last === null || $properties?->get('cause') !== self::CAUSE
                    || $to === null || $from === null || $locked->pipeline_stage !== $to,
                409,
                'customer.stage_undo_unavailable',
            );
            abort_code_if(
                Carbon::parse($last->created_at)->addHours(self::UNDO_WINDOW_HOURS)->isPast(),
                422,
                'customer.stage_undo_expired',
            );

            $bookingId = (int) $properties->get('booking_id');
            self::write($locked, $to, $from, ['cause' => self::UNDO_CAUSE, 'undoes' => (int) $last->id, 'booking_id' => $bookingId]);

            /** @var Booking|null $booking */
            $booking = Booking::query()->whereKey($bookingId)->lockForUpdate()->first();
            if ($booking !== null && is_array($booking->metadata['stage_change'] ?? null)) {
                $metadata = $booking->metadata;
                $metadata['stage_change']['undone_at'] = now()->toIso8601String();
                $booking->forceFill(['metadata' => $metadata])->save();
            }

            return $locked->refresh();
        });
    }

    /**
     * Le changement que sert `BookingResource::stage_change` : `undoable_until` = l'instant + 24 h,
     * `null` une fois défait. Qu'aucun autre changement ne soit venu depuis ne se dit qu'au geste (409).
     *
     * @return array{from: string, to: string, at: string, undoable_until: string|null, undone_at: string|null}|null
     */
    public static function forBooking(Booking $booking): ?array
    {
        $change = $booking->metadata['stage_change'] ?? null;
        if (! is_array($change) || ! isset($change['from'], $change['to'], $change['at'])) {
            return null;
        }
        $undoneAt = $change['undone_at'] ?? null;

        return [
            'from' => (string) $change['from'],
            'to' => (string) $change['to'],
            'at' => Carbon::parse($change['at'])->toIso8601String(),
            'undoable_until' => $undoneAt === null ? Carbon::parse($change['at'])->addHours(self::UNDO_WINDOW_HOURS)->toIso8601String() : null,
            'undone_at' => $undoneAt !== null ? Carbon::parse($undoneAt)->toIso8601String() : null,
        ];
    }

    /** La dernière ligne du journal de la fiche qui pose `pipeline_stage`. */
    private static function lastStageChange(Customer $customer): ?Activity
    {
        return Activity::query()
            ->where('subject_type', $customer->getMorphClass())
            ->where('subject_id', $customer->getKey())
            ->whereRaw("(attribute_changes->'attributes'->>'pipeline_stage') IS NOT NULL")
            ->orderByDesc('id')
            ->first();
    }

    /** @param  array<string, mixed>  $properties */
    private static function write(Customer $customer, CustomerPipelineStage $from, CustomerPipelineStage $to, array $properties): void
    {
        $customer->disableLogging();
        try {
            $customer->update(['pipeline_stage' => $to]);
        } finally {
            $customer->enableLogging();
        }

        activity()
            ->useLog(class_basename(Customer::class))
            ->performedOn($customer)
            ->event('updated')
            ->withChanges([
                'attributes' => ['pipeline_stage' => $to->value],
                'old' => ['pipeline_stage' => $from->value],
            ])
            ->withProperties($properties)
            ->log('updated');
    }
}
