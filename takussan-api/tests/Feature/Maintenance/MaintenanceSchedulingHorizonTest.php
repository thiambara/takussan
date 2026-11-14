<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2715 — le passage d'une intervention ne se pose pas au-delà d'un an
 * (`MaintenanceRequest::SCHEDULING_HORIZON_MONTHS`), ni à l'acceptation (`POST …/accept`, TCK-2680)
 * ni au `PATCH` : les deux routes écrivent la même colonne. La borne se juge sur l'instant désigné,
 * après conversion du décalage (`MaintenanceRequest::scheduledInstant()`, TCK-2700).
 *
 * Maintenant : 2026-11-11 08:00 UTC (Africa/Dakar est à UTC+0) ; la borne : 2027-11-11 08:00 UTC,
 * incluse.
 *
 * Rouge avant TCK-2715 : `2027-11-12` (et `2099`) étaient acceptés sur les deux routes.
 */
class MaintenanceSchedulingHorizonTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const SOUS_LA_BORNE = '2027-11-10T08:00:00';

    private const AU_DELA = '2027-11-12T08:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-11 08:00:00', 'UTC'));
    }

    private function colonne(MaintenanceRequest $mr): ?string
    {
        return DB::table('maintenance_requests')->where('id', $mr->id)->value('scheduled_at');
    }

    /** AC1 — le prestataire assigné : un an moins un jour passe et pose l'heure. */
    public function test_ac1_acceptation_sous_la_borne(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => self::SOUS_LA_BORNE])->assertOk();

        $this->assertSame('2027-11-10 08:00:00', $this->colonne($mr));
        $this->assertNotNull($mr->refresh()->accepted_at);
    }

    /** AC1 — un an et un jour : 422 sur `scheduled_at`, rien n'est posé, pas même l'acceptation. */
    public function test_ac1_acceptation_au_dela_de_la_borne(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => self::AU_DELA])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['scheduled_at']);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2099-11-12T10:00:00'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['scheduled_at']);

        $mr->refresh();
        $this->assertNull($mr->accepted_at);
        $this->assertNull($mr->scheduled_at);
    }

    /** AC2 — l'agent qui gère l'intervention : 422 au-delà, 200 en deçà. */
    public function test_ac2_patch_des_deux_cotes_de_la_borne(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($this->agentOf($agency));
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => self::AU_DELA])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['scheduled_at']);
        $this->assertNull($this->colonne($mr));

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => self::SOUS_LA_BORNE])->assertOk();
        $this->assertSame('2027-11-10 08:00:00', $this->colonne($mr));
    }

    /** La borne est incluse : exactement un an d'ici passe ; une seconde de plus, non. */
    public function test_la_borne_est_incluse(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => '2027-11-11T08:00:01'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['scheduled_at']);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => '2027-11-11T08:00:00'])->assertOk();
        $this->assertSame('2027-11-11 08:00:00', $this->colonne($mr));
    }

    /**
     * Vérification adverse de TCK-2715 (m1) — le 29 février. Un an après le 29 février 2028 est le
     * 28 février 2029 (`addMonthsNoOverflow`), pas le 1er mars : `addMonths` déborde au 1er mars, et
     * un `before_or_equal:+12 months` de Laravel aussi (`strtotime` normalise le 29 février 2029 en
     * 1er mars). Maintenant : 2028-02-29 23:59:59 UTC, d'où la borne 2029-02-28 23:59:59 incluse.
     */
    public function test_le_29_fevrier_borne_au_28_fevrier_suivant(): void
    {
        $this->travelTo(Carbon::parse('2028-02-29 23:59:59', 'UTC'));
        ['mr' => $mr, 'landlord' => $landlord, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => '2029-03-01T00:00:00'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['scheduled_at']);
        $this->assertNull($this->colonne($mr));
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => '2029-02-28T23:59:59'])->assertOk();
        $this->assertSame('2029-02-28 23:59:59', $this->colonne($mr));

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2029-03-01T00:00:00'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['scheduled_at']);
        $this->assertNull($mr->refresh()->accepted_at);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2029-02-28T23:59:59'])->assertOk();
        $this->assertNotNull($mr->refresh()->accepted_at);
    }

    /**
     * AC3 — la borne lit l'instant, pas la chaîne. `07:30-01:00` est 08:30 UTC, au-delà ; `08:30+01:00`
     * est 07:30 UTC, en deçà — l'heure murale de chacune dit l'inverse.
     *
     * @return array<string, array{0: string, 1: string, 2: int}>
     */
    public static function decalages(): array
    {
        return [
            'accept, sous la borne en murale, au-delà en instant' => ['accept', '2027-11-11T07:30:00-01:00', 422],
            'accept, au-delà en murale, sous la borne en instant' => ['accept', '2027-11-11T08:30:00+01:00', 200],
            'patch, sous la borne en murale, au-delà en instant' => ['patch', '2027-11-11T07:30:00-01:00', 422],
            'patch, au-delà en murale, sous la borne en instant' => ['patch', '2027-11-11T08:30:00+01:00', 200],
        ];
    }

    #[DataProvider('decalages')]
    public function test_ac3_la_borne_lit_l_instant_converti(string $route, string $valeur, int $statut): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        if ($route === 'accept') {
            Sanctum::actingAs($provider);
            $reponse = $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => $valeur]);
        } else {
            Sanctum::actingAs($landlord);
            $reponse = $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => $valeur]);
        }

        $reponse->assertStatus($statut);
        if ($statut === 422) {
            $reponse->assertJsonValidationErrors(['scheduled_at']);
            $this->assertNull($this->colonne($mr));
        } else {
            $this->assertSame('2027-11-11 07:30:00', $this->colonne($mr));
        }
    }

    /** AC4 — un compte qui n'est pas le prestataire assigné prend 403, pas 422, même au-delà de la borne. */
    public function test_ac4_un_tiers_prend_403_avant_la_borne(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($this->providerFor($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => self::AU_DELA])->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2099-11-12T10:00:00'])->assertForbidden();

        $this->assertNull($mr->refresh()->accepted_at);
    }

    /** Une valeur illisible reste un 422 de la règle `date`, jamais un 500 de la conversion ; `null` retire toujours l'heure. */
    public function test_valeur_illisible_et_null(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, [
            'scheduled_at' => Carbon::parse('2026-11-12 10:00:00', 'UTC'),
        ]);

        Sanctum::actingAs($landlord);
        foreach (['pas une date', ['2027-11-12']] as $valeur) {
            $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => $valeur])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['scheduled_at']);
        }
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => null])->assertOk();
        $this->assertNull($this->colonne($mr));

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => 'pas une date'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['scheduled_at']);
    }

    /** Le message nomme la borne, dans la langue de la requête (`wo` = le texte français). */
    public function test_le_message_dit_un_an(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($landlord);
        $fr = $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => self::AU_DELA], ['Accept-Language' => 'fr'])
            ->json('errors.scheduled_at.0');
        $this->assertSame(__('maintenance.errors.beyond_scheduling_horizon', [], 'fr'), $fr);
        $this->assertStringContainsString('un an', $fr);
        $this->assertStringContainsString('year', __('maintenance.errors.beyond_scheduling_horizon', [], 'en'));
        $this->assertSame(__('maintenance.errors.beyond_scheduling_horizon', [], 'fr'), __('maintenance.errors.beyond_scheduling_horizon', [], 'wo'));
    }
}
