<?php

namespace Database\Seeders\Engagement;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyVisit;
use Carbon\Carbon;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Backfills Spatie activity_log rows for the main auditable models.
 * Writes straight to the DB for speed instead of using the activity() helper.
 */
class ActivityLogBackfillSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $buffer = [];

        $this->collectFrom(Property::query(), 'property', ['created' => 'created', 'updated' => 'updated'], $buffer);
        $this->collectFrom(Lease::query(), 'lease', ['created' => 'created', 'updated' => 'updated'], $buffer);
        $this->collectFrom(Booking::query(), 'booking', ['created' => 'created', 'updated' => 'updated'], $buffer);
        $this->collectFrom(LeasePayment::query(), 'lease_payment', ['created' => 'created', 'updated' => 'updated'], $buffer);
        $this->collectFrom(LeasePayment::query()->whereNotNull('paid_at'), 'lease_payment', ['paid' => 'marked as paid'], $buffer);
        $this->collectFrom(BookingPayment::query(), 'booking_payment', ['created' => 'created', 'updated' => 'updated'], $buffer);
        $this->collectFrom(MaintenanceRequest::query(), 'maintenance', ['created' => 'created', 'updated' => 'updated'], $buffer);
        $this->collectFrom(PropertyVisit::query(), 'property_visit', ['created' => 'created', 'updated' => 'updated'], $buffer);
        $this->collectFrom(Customer::query(), 'customer', ['created' => 'created', 'updated' => 'updated'], $buffer);

        foreach (array_chunk($buffer, 500) as $chunk) {
            DB::table('activity_log')->insert($chunk);
        }
    }

    /**
     * @param  Builder  $query
     * @param  array<string, string>  $events
     * @param  array<int, array<string, mixed>>  $buffer
     */
    private function collectFrom($query, string $logName, array $events, array &$buffer): void
    {
        $model = $query->getModel();
        $subjectType = get_class($model);

        $query->clone()->chunkById(500, function ($items) use ($logName, $events, $subjectType, &$buffer) {
            foreach ($items as $item) {
                foreach ($events as $event => $description) {
                    $buffer[] = [
                        'log_name' => $logName,
                        'description' => $description,
                        'subject_id' => $item->id,
                        'subject_type' => $subjectType,
                        'event' => $event,
                        'causer_id' => null,
                        'causer_type' => null,
                        'properties' => json_encode([]),
                        'attribute_changes' => null,
                        'created_at' => $item->created_at ?? Carbon::now(),
                        'updated_at' => $item->updated_at ?? $item->created_at ?? Carbon::now(),
                    ];
                }
            }
        });
    }
}
