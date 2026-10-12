<?php

namespace Tests\Feature\Credits;

use App\Events\Auth\PhoneVerified;
use App\Events\Onboarding\SpaceCreated;
use App\Models\Agency;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F — les deux événements du lot C déclenchent l'offre, chacun une fois. */
class WelcomeCreditListenersTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_verification_du_numero_credite_l_espace(): void
    {
        $admin = User::factory()->create(['phone' => '+221771234560', 'phone_verified_at' => now()]);
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        event(new PhoneVerified($admin));

        $this->assertSame(500, app(CreditLedger::class)->balance($agency));
    }

    public function test_la_naissance_de_l_espace_le_credite_une_seule_fois(): void
    {
        $admin = User::factory()->create(['phone' => '+221771234561', 'phone_verified_at' => now()]);
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        event(new SpaceCreated($agency));
        event(new SpaceCreated($agency));

        $this->assertSame(500, app(CreditLedger::class)->balance($agency));
    }
}
