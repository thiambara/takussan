<?php

namespace Tests\Feature\Database\Seeders;

use App\Domain\Notifications\NotificationCode;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use App\Models\User;
use Database\Seeders\Engagement\AppNotificationSeeder;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1324 (P128.04) — le seeder écrit chaque notification par code et paramètres bruts, comme
 * `NotificationService::send` : sans code, la cloche retombait sur des phrases françaises figées et
 * le rendu par code n'apparaissait jamais en développement.
 */
class AppNotificationSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_chaque_ligne_creee_porte_un_code_du_catalogue_et_ses_parametres(): void
    {
        $lease = Lease::factory()->create();
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'paid_at' => now()->subDays(2),
            'due_date' => now()->subDays(5)->toDateString(),
        ]);
        PropertyVisit::factory()->create(['agent_id' => User::factory()->create()->id]);
        MaintenanceRequest::factory()->create(['assigned_to' => User::factory()->create()->id]);
        MaintenanceRequest::factory()->create(['assigned_to' => null]);
        Booking::factory()->create();

        app()->instance(SeedingContext::class, new SeedingContext);
        app(AppNotificationSeeder::class)->run();

        $lignes = AppNotification::query()->get();
        $this->assertNotEmpty($lignes);

        foreach ($lignes as $ligne) {
            $code = NotificationCode::tryFrom((string) $ligne->code);
            $this->assertNotNull($code, "ligne #{$ligne->id} sans code du catalogue ({$ligne->title})");
            $this->assertSame($code->type(), $ligne->type, $code->value);
            $this->assertSame(
                [],
                array_diff(array_keys($code->params()), array_keys($ligne->params ?? [])),
                "{$code->value} : paramètre déclaré absent",
            );
            $this->assertNotNull($ligne->target, $code->value);
        }

        $this->assertEqualsCanonicalizing(
            [
                NotificationCode::LeasePaymentReceivedLandlord->value,
                NotificationCode::VisitRequested->value,
                NotificationCode::MaintenanceAssigned->value,
            ],
            $lignes->pluck('code')->unique()->values()->all(),
        );
    }
}
