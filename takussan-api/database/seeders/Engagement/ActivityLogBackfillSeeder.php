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
use App\Models\User;
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

        // TCK-2378 — chaque ligne nomme son auteur quand l'action en a un : l'agent du bail, de la
        // visite ou de la réservation, l'agent qui a saisi le client, le demandeur de l'intervention.
        // L'échéancier des loyers est écrit par le système : sa création reste sans auteur. Le
        // journal semé n'en nommait aucun (25 415 lignes, `causer_id` toujours nul).
        $agentDuBail = Lease::query()->pluck('agent_id', 'id');
        $parBien = fn (Property $p) => $p->agency_id ? $this->ctx->agentAu($p->agency_id, $p->created_at) : null;

        $this->collectFrom(Property::query(), 'property', ['created' => 'created', 'updated' => 'updated'], $buffer, $parBien);
        $this->collectFrom(Lease::query(), 'lease', ['created' => 'created', 'updated' => 'updated'], $buffer, fn (Lease $l) => $l->agent_id);
        $this->collectFrom(Booking::query(), 'booking', ['created' => 'created', 'updated' => 'updated'], $buffer, fn (Booking $b) => $b->created_by_id);
        $this->collectFrom(LeasePayment::query(), 'lease_payment', ['created' => 'created'], $buffer, fn () => null);
        $this->collectFrom(LeasePayment::query()->whereNotNull('paid_at'), 'lease_payment', ['updated' => 'updated', 'paid' => 'marked as paid'], $buffer, fn (LeasePayment $p) => $agentDuBail[$p->lease_id] ?? null);
        $this->collectFrom(BookingPayment::query(), 'booking_payment', ['created' => 'created', 'updated' => 'updated'], $buffer, fn () => null);
        $this->collectFrom(MaintenanceRequest::query(), 'maintenance', ['created' => 'created', 'updated' => 'updated'], $buffer, fn (MaintenanceRequest $m) => $m->requester_id);
        $this->collectFrom(PropertyVisit::query(), 'property_visit', ['created' => 'created', 'updated' => 'updated'], $buffer, fn (PropertyVisit $v) => $v->agent_id);
        $this->collectFrom(Customer::query(), 'customer', ['created' => 'created', 'updated' => 'updated'], $buffer, fn (Customer $c) => $c->added_by_id);

        foreach (array_chunk($buffer, 500) as $chunk) {
            DB::table('activity_log')->insert($chunk);
        }
    }

    /**
     * @param  Builder  $query
     * @param  array<string, string>  $events
     * @param  array<int, array<string, mixed>>  $buffer
     * @param  \Closure(mixed): ?int  $auteur  l'utilisateur qui a fait l'action, `null` pour le système
     */
    private function collectFrom($query, string $logName, array $events, array &$buffer, \Closure $auteur): void
    {
        $model = $query->getModel();
        $subjectType = get_class($model);
        $causerType = (new User)->getMorphClass();

        $query->clone()->chunkById(500, function ($items) use ($logName, $events, $subjectType, $causerType, $auteur, &$buffer) {
            foreach ($items as $item) {
                $causerId = $auteur($item);
                foreach ($events as $event => $description) {
                    // Une modification date de la dernière écriture, pas de la création.
                    $le = $event === 'created' ? $item->created_at : ($item->updated_at ?? $item->created_at);
                    $buffer[] = [
                        'log_name' => $logName,
                        'description' => $description,
                        'subject_id' => $item->id,
                        'subject_type' => $subjectType,
                        'event' => $event,
                        'causer_id' => $causerId,
                        'causer_type' => $causerId !== null ? $causerType : null,
                        'properties' => json_encode([]),
                        'attribute_changes' => null,
                        'created_at' => $le ?? Carbon::now(),
                        'updated_at' => $le ?? Carbon::now(),
                    ];
                }
            }
        });
    }
}
