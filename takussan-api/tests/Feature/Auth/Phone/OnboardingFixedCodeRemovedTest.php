<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ReadsPhoneCodes;
use Tests\TestCase;

/**
 * TCK-589 AC1b — le code fixe `123456` n'ouvre plus aucun des quatre onboardings, en
 * environnement `testing` : la garde d'autrefois était `! production`, et valait donc
 * pour toute préproduction. Le faux routeur émet un AUTRE code, que le test n'utilise pas.
 *
 * Rouge sur `5f872f1f` (accepté). Ablation : remettre la ligne dans un seul service →
 * son cas rougit, et lui seul.
 */
class OnboardingFixedCodeRemovedTest extends TestCase
{
    use ReadsPhoneCodes, RefreshDatabase;

    private const CODE_FIXE = '123456';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->assertTrue(app()->environment('testing'));

        $this->user = User::factory()->create(['phone' => '+221770000004', 'phone_verified_at' => null]);
        Sanctum::actingAs($this->user);

        // Un vrai code est émis, et n'est PAS 123456 : le refus ne tient pas à l'absence de code.
        do {
            Cache::flush();
            $code = $this->issuePhoneCode($this->user);
        } while ($code === self::CODE_FIXE);
    }

    public function test_agent(): void
    {
        $agent = AgentProfile::factory()->create([
            'user_id' => $this->user->id,
            'status' => AgentProfileStatus::Draft->value,
        ]);

        $this->postJson('/api/agent/onboard/complete', [
            'agent_profile_id' => $agent->id,
            'phone_otp' => ['code' => self::CODE_FIXE],
        ])->assertStatus(422)->assertJsonValidationErrors(['phone_otp.code']);

        $this->assertNull($this->user->fresh()->phone_verified_at);
    }

    public function test_bailleur(): void
    {
        $owner = OwnerProfile::factory()->create([
            'user_id' => $this->user->id,
            'status' => OwnerProfileStatus::Draft->value,
        ]);

        $this->postJson('/api/owner/onboard/complete', [
            'owner_profile_id' => $owner->id,
            'phone_otp' => ['code' => self::CODE_FIXE],
        ])->assertStatus(422)->assertJsonValidationErrors(['phone_otp.code']);

        $this->assertNull($this->user->fresh()->phone_verified_at);
    }

    public function test_prestataire(): void
    {
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $this->user->id,
            'status' => ServiceProviderProfileStatus::Draft->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $sp->id,
            'agency_id' => Agency::factory()->create()->id,
            'status' => CollaborationStatus::Paused->value,
            'started_at' => now()->toDateString(),
        ]);

        $this->postJson('/api/service-provider/onboard/complete', [
            'sp_profile_id' => $sp->id,
            'phone_otp' => ['code' => self::CODE_FIXE],
        ])->assertStatus(422)->assertJsonValidationErrors(['phone_otp.code']);

        $this->assertNull($this->user->fresh()->phone_verified_at);
    }

    public function test_hote(): void
    {
        $this->postJson('/api/host/individual/onboard', [
            'agency' => ['name' => 'Espace test', 'primary_city' => 'Dakar', 'currency' => 'XOF'],
            'phone_otp' => ['phone' => '+221770000004', 'code' => self::CODE_FIXE],
            'preferences' => ['primary_property_type' => 'apartment'],
            'cgu_accepted' => true,
        ])->assertStatus(422)->assertJsonValidationErrors(['phone_otp.code']);

        $this->assertNull($this->user->fresh()->phone_verified_at);
        $this->assertSame(0, Agency::query()->count());
    }
}
