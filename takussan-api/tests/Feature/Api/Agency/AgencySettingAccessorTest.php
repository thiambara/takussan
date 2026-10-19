<?php

namespace Tests\Feature\Api\Agency;

use App\Domain\Settings\AgencySettings;
use App\Http\Requests\AgencyUpdateRequest;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\WatermarkPosition;
use App\Models\Lease;
use App\Models\User;
use App\Services\Tenant\TenantOnboardingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-970 (P47.08) — `agencies.settings` se lit par UN accesseur, `Agency::setting()`, sur la liste
 * unique (`AgencySettings`) que lit aussi `AgencyUpdateRequest`.
 *
 * Avant : chaque lecteur avait sa coercition. `TenantOnboardingService` ne coupait la checklist que
 * sur `=== false`, alors que la règle `boolean` accepte `0` : un admin qui envoyait `0` recevait un
 * 200, et la checklist continuait de se créer.
 */
class AgencySettingAccessorTest extends TestCase
{
    use RefreshDatabase;

    private function leaseChez(Agency $agency): Lease
    {
        $tenant = Customer::factory()->create(['user_id' => User::factory()->create()->id]);

        return Lease::factory()->create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
            'status' => LeaseStatus::Draft,
        ]);
    }

    public function test_un_zero_ecrit_par_l_api_coupe_la_checklist(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['tenant_onboarding_enabled' => 0]])
            ->assertOk();

        $this->assertNull(app(TenantOnboardingService::class)->create($this->leaseChez($agency->refresh())));
    }

    /**
     * @return array<string, array{array<string, mixed>, bool}>
     */
    public static function interrupteurs(): array
    {
        return [
            'false' => [['tenant_onboarding_enabled' => false], false],
            '0' => [['tenant_onboarding_enabled' => 0], false],
            '"0"' => [['tenant_onboarding_enabled' => '0'], false],
            'true' => [['tenant_onboarding_enabled' => true], true],
            '1' => [['tenant_onboarding_enabled' => 1], true],
            'absent' => [[], true],
        ];
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    #[DataProvider('interrupteurs')]
    public function test_la_checklist_suit_l_interrupteur_quelle_que_soit_sa_forme(array $settings, bool $creee): void
    {
        $agency = Agency::factory()->create(['settings' => $settings]);

        $checklist = app(TenantOnboardingService::class)->create($this->leaseChez($agency));

        $this->assertSame($creee, $checklist !== null);
    }

    public function test_les_defauts_sont_ceux_des_anciens_lecteurs(): void
    {
        $agency = new Agency(['settings' => null]);

        $this->assertTrue($agency->setting('watermark_enabled'));
        $this->assertSame(WatermarkPosition::default()->value, $agency->setting('watermark_position'));
        $this->assertSame(60, $agency->setting('watermark_opacity'));
        $this->assertFalse($agency->setting('require_team_two_factor'));
        $this->assertFalse($agency->setting('late_fee_online_collection'));
        $this->assertSame(48, $agency->setting('booking_pending_expiry_hours'));
        $this->assertTrue($agency->setting('tenant_onboarding_enabled'));
    }

    public function test_une_valeur_stockee_est_rendue_dans_son_type(): void
    {
        $agency = new Agency(['settings' => [
            'watermark_enabled' => '0',
            'watermark_opacity' => '35',
            'booking_pending_expiry_hours' => '24',
            'late_fee_online_collection' => 1,
        ]]);

        $this->assertFalse($agency->setting('watermark_enabled'));
        $this->assertSame(35, $agency->setting('watermark_opacity'));
        $this->assertSame(24, $agency->setting('booking_pending_expiry_hours'));
        $this->assertTrue($agency->setting('late_fee_online_collection'));
    }

    public function test_une_valeur_illisible_rend_le_defaut(): void
    {
        $agency = new Agency(['settings' => [
            'watermark_enabled' => 'peut-être',
            'booking_pending_expiry_hours' => 'abc',
            'watermark_position' => ['pas', 'une', 'chaîne'],
        ]]);

        $this->assertTrue($agency->setting('watermark_enabled'));
        $this->assertSame(48, $agency->setting('booking_pending_expiry_hours'));
        $this->assertSame(WatermarkPosition::default()->value, $agency->setting('watermark_position'));
    }

    public function test_une_cle_sans_regle_ne_se_lit_pas(): void
    {
        $this->expectException(InvalidArgumentException::class);

        (new Agency(['settings' => ['timezone' => 'Africa/Dakar']]))->setting('timezone');
    }

    public function test_la_regle_et_l_accesseur_lisent_la_meme_liste(): void
    {
        $regles = array_values(array_filter(
            array_keys((new AgencyUpdateRequest)->rules()),
            fn (string $cle): bool => str_starts_with($cle, 'settings.'),
        ));

        $this->assertSame(
            array_map(fn (string $cle): string => "settings.{$cle}", AgencySettings::keys()),
            $regles,
        );

        foreach (AgencySettings::keys() as $cle) {
            $this->assertSame(AgencySettings::default($cle), (new Agency)->setting($cle), $cle);
        }
    }
}
