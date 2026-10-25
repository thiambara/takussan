<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\ApiTestCase;

/**
 * P234.04 (TCK-2280) — le téléphone que l'agence saisit à l'invitation n'atteint pas le compte
 * (`acceptAsNewUser` ne l'écrit que pour une invitation SANS e-mail). Décision du porteur : il
 * reste une donnée de la fiche d'agence (`metadata.phone` du profil), rendue dans les carnets — le
 * compte n'est pas touché.
 */
class TelephoneSaisiALInvitationTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    public function test_le_numero_saisi_reste_sur_la_fiche_de_l_agence_et_le_carnet_le_rend(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiPost("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'bailleur@example.sn',
            'phone' => self::NUMERO,
            'first_name' => 'Awa',
            'last_name' => 'Sarr',
            'owner_type' => 'individual',
        ])->assertCreated();
        $invitation = Invitation::query()->sole();

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Awa',
            'last_name' => 'Sarr',
            'password' => 'Un-mot-de-passe-1',
        ])->assertOk();
        $this->assertNull(User::query()->where('email', 'bailleur@example.sn')->sole()->phone);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $ligne = collect($this->apiGet("/api/owners?filter[agency_id]={$agency->id}&fields[owner_profiles]=id,metadata&include=user")
            ->assertOk()
            ->json('data'))->firstWhere('id', $invitation->invitable_id);
        $this->assertSame(self::NUMERO, $ligne['metadata']['phone'] ?? null);
    }
}
