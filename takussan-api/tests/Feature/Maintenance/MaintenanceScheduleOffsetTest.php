<?php

namespace Tests\Feature\Maintenance;

use App\Models\AppNotification;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2700 — une heure d'intervention envoyée avec son décalage est l'instant qu'elle désigne, au
 * `PATCH` comme à l'acceptation (TCK-2680) : une seule conversion, `MaintenanceRequest::scheduledInstant()`.
 *
 * Rouge avant TCK-2700 : le cast `datetime` écrivait l'heure murale reçue — `11:00+01:00` était
 * stocké `11:00` (UTC), une heure trop tard.
 */
class MaintenanceScheduleOffsetTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const SCHEDULE = 'maintenance.schedule_changed';

    /** Le fuseau PHP par défaut à l'entrée du test, rendu en `tearDown` (m1). */
    private string $fuseauParDefaut;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fuseauParDefaut = date_default_timezone_get();
        $this->travelTo(Carbon::parse('2026-11-11 08:00:00', 'UTC'));
    }

    protected function tearDown(): void
    {
        date_default_timezone_set($this->fuseauParDefaut);
        parent::tearDown();
    }

    /** AC1 — 11:00+01:00 → 10 h UTC, relue 10 h à Dakar. */
    public function test_une_heure_avec_decalage_est_convertie(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => '2026-11-12T11:00:00+01:00'])
            ->assertOk()
            ->assertJsonPath('data.scheduled_at', '2026-11-12T10:00:00+00:00');

        $this->assertSame('2026-11-12 10:00:00', $this->colonne($mr));
        $this->assertSame('10:00', $mr->refresh()->scheduled_at->copy()->setTimezone(MaintenanceRequest::SCHEDULED_TIMEZONE)->format('H:i'));
    }

    /** AC2 — sans décalage : l'heure de Dakar, stockée comme avant. */
    public function test_une_heure_sans_decalage_est_inchangee(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => '2026-11-12T10:00:00'])->assertOk();

        $this->assertSame('2026-11-12 10:00:00', $this->colonne($mr));
    }

    /** AC3 — le même instant, écrit avec un autre décalage, n'est pas un passage déplacé. */
    public function test_le_meme_instant_avec_un_autre_decalage_n_annonce_rien(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, [
            'accepted_at' => now(),
            'scheduled_at' => Carbon::parse('2026-11-12 10:00:00', 'UTC'),
        ]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => '2026-11-12T11:00:00+01:00'])->assertOk();

        $this->assertSame('2026-11-12 10:00:00', $this->colonne($mr));
        $this->assertSame(0, AppNotification::query()->where('code', self::SCHEDULE)->count());
    }

    /** Un déplacement réel exprimé avec décalage s'annonce, avec l'instant converti. */
    public function test_un_deplacement_avec_decalage_s_annonce_converti(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Assigned, [
            'accepted_at' => now(),
            'scheduled_at' => Carbon::parse('2026-11-12 10:00:00', 'UTC'),
        ]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => '2026-11-13T15:00:00+01:00'])->assertOk();

        $avis = AppNotification::query()->where('user_id', $tenant->id)->where('code', self::SCHEDULE)->sole();
        $this->assertTrue(Carbon::parse($avis->params['scheduled_at'])->equalTo(Carbon::parse('2026-11-13 14:00:00', 'UTC')));
    }

    /** `null` retire toujours l'heure. */
    public function test_null_retire_l_heure(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, [
            'scheduled_at' => Carbon::parse('2026-11-12 10:00:00', 'UTC'),
        ]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => null])->assertOk();

        $this->assertNull($this->colonne($mr));
    }

    /** La conversion partagée : sans décalage, Dakar ; avec, l'instant ; un objet date, son instant. */
    public function test_la_conversion_partagee(): void
    {
        $this->assertSame('2026-11-12 10:00:00', MaintenanceRequest::scheduledInstant('2026-11-12T10:00:00')->format('Y-m-d H:i:s'));
        $this->assertSame('2026-11-12 10:00:00', MaintenanceRequest::scheduledInstant('2026-11-12T11:00:00+01:00')->format('Y-m-d H:i:s'));
        $this->assertSame('2026-11-12 10:00:00', MaintenanceRequest::scheduledInstant(Carbon::parse('2026-11-12 05:00:00', 'America/New_York'))->format('Y-m-d H:i:s'));
        $this->assertSame(config('app.timezone'), MaintenanceRequest::scheduledInstant('2026-11-12T11:00:00+01:00')->getTimezone()->getName());
    }

    /**
     * Vérification adverse de TCK-2700 (m1) — « sans décalage = heure de Dakar » est éprouvable : Africa/Dakar
     * étant à UTC+0, il faut un fuseau PHP par défaut qui ne l'est pas pour distinguer « lu à Dakar » de « lu au
     * fuseau par défaut ». Sous Asia/Tokyo (UTC+9), `10:00` lu à Dakar est 10:00 UTC ; lu sans fuseau, 01:00 UTC.
     * Rouge si la conversion parse sans `SCHEDULED_TIMEZONE`.
     */
    public function test_sans_decalage_se_lit_a_dakar_quel_que_soit_le_fuseau_par_defaut(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);
        date_default_timezone_set('Asia/Tokyo');

        $this->assertSame('2026-11-12 10:00:00', MaintenanceRequest::scheduledInstant('2026-11-12T10:00:00')->utc()->format('Y-m-d H:i:s'));

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => '2026-11-12T10:00:00'])->assertOk();
        $this->assertSame('2026-11-12 10:00:00', DB::table('maintenance_requests')->where('id', $mr->id)->value('scheduled_at'));
    }

    /** Le service convertit lui aussi : un appelant qui lui passe un objet date d'un autre fuseau. */
    public function test_l_acceptation_par_le_service_convertit(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        app(MaintenanceRequestService::class)->accept($mr, $provider, Carbon::parse('2026-11-12 05:00:00', 'America/New_York'));

        $this->assertSame('2026-11-12 10:00:00', $this->colonne($mr));
    }

    private function colonne(MaintenanceRequest $mr): ?string
    {
        $brut = DB::table('maintenance_requests')->where('id', $mr->id)->value('scheduled_at');

        return $brut === null ? null : Carbon::parse($brut)->format('Y-m-d H:i:s');
    }
}
