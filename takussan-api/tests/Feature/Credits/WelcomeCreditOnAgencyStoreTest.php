<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-633 lot F (ADR-0061 §3) — un titulaire au numéro DÉJÀ vérifié qui crée son espace par
 * `POST /api/agencies` reçoit la bienvenue à la naissance de l'espace : aucun `PhoneVerified` ne
 * viendra plus la rattraper. Vérif. adverse du lot F, V2 : 0 crédit pour toujours.
 */
class WelcomeCreditOnAgencyStoreTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_creer_son_espace_avec_un_numero_deja_verifie_verse_la_bienvenue(): void
    {
        $user = User::factory()->create(['phone' => '+221771230099', 'phone_verified_at' => now()]);
        $this->actingAsApi($user);

        $this->apiPost('/api/agencies', ['name' => 'Agence Teranga'])->assertCreated();

        $agency = Agency::query()->where('primary_admin_id', $user->id)->sole();
        $this->assertSame(500, app(CreditLedger::class)->balance($agency));
    }

    public function test_creer_son_espace_sans_numero_verifie_ne_verse_rien(): void
    {
        $user = User::factory()->create(['phone' => '+221771230098', 'phone_verified_at' => null]);
        $this->actingAsApi($user);

        $this->apiPost('/api/agencies', ['name' => 'Agence Sahel'])->assertCreated();

        $agency = Agency::query()->where('primary_admin_id', $user->id)->sole();
        $this->assertSame(0, app(CreditLedger::class)->balance($agency));
    }
}
