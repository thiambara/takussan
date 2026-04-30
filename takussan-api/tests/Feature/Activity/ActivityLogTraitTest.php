<?php

namespace Tests\Feature\Activity;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * Cross-model sanity check that the Auditable/LogsActivity wiring emits
 * create/update/delete activities on each domain model adopted for TCK-018,
 * AND that sensitive fields configured via `dontLogIfAttributesChangedOnly`
 * are excluded from the recorded changes.
 *
 * Uses a data provider so each model only requires a row here rather than
 * its own near-duplicate test class.
 */
class ActivityLogTraitTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{
     *     factory: class-string<Model>,
     *     updateAttr: string,
     *     updateValue: mixed,
     *     sensitive: array<string, mixed>,
     * }>
     */
    public static function modelProvider(): array
    {
        return [
            'Property' => [
                'factoryModel' => Property::class,
                'updateAttr' => 'title',
                'updateValue' => 'Villa rénovée — audit test',
                'sensitive' => [],
            ],
            'Booking' => [
                'factoryModel' => Booking::class,
                'updateAttr' => 'reference_number',
                'updateValue' => 'BK-AUDIT-0001',
                'sensitive' => [],
            ],
            'Lease' => [
                'factoryModel' => Lease::class,
                'updateAttr' => 'reference_number',
                'updateValue' => 'LS-AUDIT-0001',
                'sensitive' => [],
            ],
            'Invoice' => [
                'factoryModel' => Invoice::class,
                'updateAttr' => 'reference_number',
                'updateValue' => 'INV-AUDIT-0001',
                'sensitive' => [],
            ],
            'Payout' => [
                'factoryModel' => Payout::class,
                'updateAttr' => 'reference_number',
                'updateValue' => 'PO-AUDIT-0001',
                'sensitive' => [],
            ],
            'Customer' => [
                'factoryModel' => Customer::class,
                'updateAttr' => 'first_name',
                'updateValue' => 'Audit-Customer',
                // id_number is explicitly excluded from the log (sensitive PII).
                'sensitive' => ['id_number' => 'SN-123-SENSITIVE'],
            ],
            'BookingPayment' => [
                'factoryModel' => BookingPayment::class,
                'updateAttr' => 'reference_number',
                'updateValue' => 'BPY-AUDIT-0001',
                // transaction_id comes from the payment provider — not logged.
                'sensitive' => ['transaction_id' => 'WAVE-TX-SECRET-1'],
            ],
            'LeasePayment' => [
                'factoryModel' => LeasePayment::class,
                'updateAttr' => 'reference_number',
                'updateValue' => 'LPY-AUDIT-0001',
                'sensitive' => ['transaction_id' => 'WAVE-TX-SECRET-2'],
            ],
        ];
    }

    /**
     * @param  class-string<Model>  $factoryModel
     * @param  array<string, mixed>  $sensitive
     */
    #[DataProvider('modelProvider')]
    public function test_create_update_delete_generate_activities(string $factoryModel, string $updateAttr, mixed $updateValue, array $sensitive): void
    {
        /** @var Factory<Model> $factory */
        $factory = $factoryModel::factory();

        /** @var Model $model */
        $model = $factory->create();

        // --- created ---
        $createdLog = Activity::query()
            ->where('subject_type', $factoryModel)
            ->where('subject_id', $model->getKey())
            ->where('description', 'created')
            ->latest('id')
            ->first();

        $this->assertNotNull($createdLog, "Expected a `created` activity for {$factoryModel}");
        $this->assertSame($factoryModel, $createdLog->subject_type);

        // --- updated (whitelisted field) ---
        $before = Activity::query()->count();
        $model->update([$updateAttr => $updateValue]);

        $this->assertSame(
            $before + 1,
            Activity::query()->count(),
            "Expected one new activity after updating `{$updateAttr}` on {$factoryModel}"
        );

        $updatedLog = Activity::query()
            ->where('subject_type', $factoryModel)
            ->where('subject_id', $model->getKey())
            ->where('description', 'updated')
            ->latest('id')
            ->first();

        $this->assertNotNull($updatedLog);
        $changes = $updatedLog->attribute_changes->toArray();
        $this->assertArrayHasKey($updateAttr, $changes['attributes'] ?? [], "Expected `{$updateAttr}` in activity changes for {$factoryModel}");

        // --- sensitive fields are not logged ---
        if (! empty($sensitive)) {
            $beforeSensitive = Activity::query()->count();
            $model->update($sensitive);

            // Either no new log is emitted (if the sensitive update is alone),
            // or if a log is emitted for bundled changes, the sensitive keys
            // still must not appear. Our models use
            // `dontLogIfAttributesChangedOnly` so an isolated sensitive update
            // must not produce an activity.
            $this->assertSame(
                $beforeSensitive,
                Activity::query()->count(),
                "Sensitive-only update on {$factoryModel} should not emit an activity"
            );

            // Now combine sensitive + a whitelisted change: the log must capture
            // the whitelisted change but the sensitive field must be absent.
            $model->update(array_merge(
                [$updateAttr => is_string($updateValue) ? $updateValue.'-x' : $updateValue],
                $sensitive,
            ));

            $mixedLog = Activity::query()
                ->where('subject_type', $factoryModel)
                ->where('subject_id', $model->getKey())
                ->where('description', 'updated')
                ->latest('id')
                ->first();
            $mixedChanges = $mixedLog->attribute_changes->toArray();
            foreach (array_keys($sensitive) as $sensitiveKey) {
                $this->assertArrayNotHasKey(
                    $sensitiveKey,
                    $mixedChanges['attributes'] ?? [],
                    "Sensitive field `{$sensitiveKey}` leaked into activity log for {$factoryModel}"
                );
                $this->assertArrayNotHasKey(
                    $sensitiveKey,
                    $mixedChanges['old'] ?? [],
                    "Sensitive field `{$sensitiveKey}` leaked into activity log (old) for {$factoryModel}"
                );
            }
        }

        // --- deleted ---
        $model->delete();
        $deletedLog = Activity::query()
            ->where('subject_type', $factoryModel)
            ->where('subject_id', $model->getKey())
            ->where('description', 'deleted')
            ->latest('id')
            ->first();

        $this->assertNotNull($deletedLog, "Expected a `deleted` activity for {$factoryModel}");
    }
}
