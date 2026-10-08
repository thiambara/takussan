<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\Integration;
use App\Models\KycDossier;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-589 AC14 — `GET /api/agencies/{agency}/setup-status` : sept étapes lues sur
 * l'état réel. Une agence neuve les rend toutes à `false` ; chaque condition posée
 * fait passer SA ligne, et elle seule ; l'agent de l'agence reçoit 403.
 *
 * Rouge sur `5f872f1f` : la route n'existait pas.
 */
class AgencySetupStatusTest extends TestCase
{
    use RefreshDatabase;

    private const STEPS = [
        'kyc_verified',
        'logo',
        'commission_rate',
        'payment_integration',
        'first_member',
        'first_published_property',
        'admin_two_factor',
    ];

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['commission_rate' => null]);
        // L'admin GET sans 2FA : la lecture n'est pas une action protégée, et
        // c'est précisément l'étape `admin_two_factor` qui le lui dit.
        $this->admin = $this->actingAsRole('agency_admin', [
            'agency' => $this->agency,
            'two_factor_enabled' => false,
            'two_factor_secret' => null,
        ]);
    }

    public function test_une_agence_neuve_rend_les_sept_etapes_a_faux(): void
    {
        $this->getJson($this->url())
            ->assertOk()
            ->assertJsonPath('data.complete', false)
            ->assertExactJson(['data' => [
                'complete' => false,
                'steps' => array_map(fn (string $key) => ['key' => $key, 'done' => false], self::STEPS),
            ]]);
    }

    /** @return array<string, array{0: string}> */
    public static function steps(): array
    {
        return array_combine(self::STEPS, array_map(fn (string $key) => [$key], self::STEPS));
    }

    #[DataProvider('steps')]
    public function test_chaque_condition_fait_passer_sa_ligne_et_elle_seule(string $step): void
    {
        $this->poser($step);

        $this->assertSame(
            array_map(fn (string $key) => ['key' => $key, 'done' => $key === $step], self::STEPS),
            $this->getJson($this->url())->assertOk()->json('data.steps'),
        );
    }

    public function test_toutes_les_conditions_posees_rendent_complete(): void
    {
        foreach (self::STEPS as $step) {
            $this->poser($step);
        }

        $this->getJson($this->url())->assertOk()->assertJsonPath('data.complete', true);
    }

    public function test_une_integration_qui_n_encaisse_pas_ou_inactive_ne_compte_pas(): void
    {
        Integration::factory()->create(['agency_id' => $this->agency->id, 'provider' => 'twilio', 'is_active' => true]);
        Integration::factory()->create(['agency_id' => $this->agency->id, 'provider' => 'wave', 'is_active' => false]);

        $this->assertFalse($this->etape('payment_integration'));
    }

    public function test_le_profil_d_agent_du_fondateur_n_est_pas_un_membre(): void
    {
        AgentProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);

        $this->assertFalse($this->etape('first_member'));
    }

    public function test_un_brouillon_n_est_pas_un_bien_publie(): void
    {
        Property::factory()->draft()->create(['agency_id' => $this->agency->id]);

        $this->assertFalse($this->etape('first_published_property'));
    }

    public function test_un_second_admin_sans_2fa_laisse_l_etape_ouverte(): void
    {
        $this->admin->forceFill(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET])->save();
        $second = User::factory()->create(['two_factor_enabled' => false]);
        $this->materializeRoleProfile($second, 'agency_admin', $this->agency);

        $this->assertFalse($this->etape('admin_two_factor'));
    }

    public function test_un_agent_de_l_agence_recoit_403(): void
    {
        $this->actingAsRole('agent', ['agency' => $this->agency]);

        $this->getJson($this->url())->assertForbidden();
    }

    public function test_l_admin_d_une_autre_agence_recoit_403(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);

        $this->getJson($this->url())->assertForbidden();
    }

    private function poser(string $step): void
    {
        match ($step) {
            'kyc_verified' => KycDossier::query()->create([
                'subject_type' => Agency::class,
                'subject_id' => $this->agency->id,
                'status' => KycDossierStatus::Verified,
                'metadata' => [],
            ]),
            'logo' => $this->poserLogo(),
            'commission_rate' => $this->agency->forceFill(['commission_rate' => 8.5])->save(),
            'payment_integration' => Integration::factory()->create([
                'agency_id' => $this->agency->id,
                'provider' => 'wave',
                'is_active' => true,
            ]),
            'first_member' => AgentProfile::query()->create([
                'user_id' => User::factory()->create()->id,
                'agency_id' => $this->agency->id,
                'status' => AgentProfileStatus::Active,
            ]),
            'first_published_property' => Property::factory()->published()->create([
                'agency_id' => $this->agency->id,
                'is_test' => false,
            ]),
            'admin_two_factor' => $this->admin->forceFill([
                'two_factor_enabled' => true,
                'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
            ])->save(),
        };
    }

    private function poserLogo(): void
    {
        Storage::fake(config('media-library.public_disk_name'));
        $this->agency->addMedia(UploadedFile::fake()->image('logo.png', 240, 80))->toMediaCollection('logo');
    }

    private function etape(string $key): bool
    {
        $steps = collect($this->getJson($this->url())->assertOk()->json('data.steps'));

        return (bool) $steps->firstWhere('key', $key)['done'];
    }

    private function url(): string
    {
        return "/api/agencies/{$this->agency->id}/setup-status";
    }
}
