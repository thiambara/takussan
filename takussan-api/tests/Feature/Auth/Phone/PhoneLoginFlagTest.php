<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589 AC2b — `auth.phone_login.enabled` (ADR-0033, faux par défaut) : drapeau
 * éteint, l'entrée par téléphone n'existe pas pour le client (404, avant toute
 * validation), `phone_login` le dit au front, et une invitation sans e-mail reste
 * refusée.
 */
class PhoneLoginFlagTest extends TestCase
{
    use RefreshDatabase;

    public function test_drapeau_eteint_les_deux_routes_rendent_404(): void
    {
        config(['auth.phone_login.enabled' => false]);
        $sms = FakeSmsRouter::install();

        $this->postJson('/api/auth/phone/request-code', ['phone' => '+221770000201'])->assertNotFound();
        $this->postJson('/api/auth/phone/verify-code', ['phone' => '+221770000201', 'code' => '123456'])->assertNotFound();
        // Même un corps invalide rend 404 : la route n'existe pas, elle ne valide rien.
        $this->postJson('/api/auth/phone/request-code', [])->assertNotFound();
        $this->assertSame([], $sms->sent);
    }

    public function test_le_drapeau_est_reflete_par_les_fournisseurs(): void
    {
        config(['auth.phone_login.enabled' => false]);
        $this->getJson('/api/auth/oauth/providers')->assertOk()->assertJsonPath('data.phone_login', false);

        config(['auth.phone_login.enabled' => true]);
        $this->getJson('/api/auth/oauth/providers')->assertOk()->assertJsonPath('data.phone_login', true);
    }

    public function test_le_drapeau_est_eteint_par_defaut(): void
    {
        $this->assertFalse((bool) config('auth.phone_login.enabled'));
    }

    public function test_drapeau_eteint_une_invitation_sans_email_est_refusee(): void
    {
        config(['auth.phone_login.enabled' => false]);
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'phone' => '+221770000202',
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }
}
