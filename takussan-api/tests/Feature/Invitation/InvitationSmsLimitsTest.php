<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Invitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse m1 (bornes) — une invitation par SMS dépense un SMS sous
 * l'expéditeur Takussan : elle est bornée par invitation (une relance par 10 min), par numéro
 * (3 par jour), par invitant (20 par heure) et par agence (plafond journalier, config). La
 * relance envoie APRÈS le commit : aucun SMS ne porte un jeton qu'un rollback annulerait.
 *
 * Rouge sur 84be9f7d : aucune route `invite` ni `resend` n'avait de limiteur (sonde du
 * vérificateur : 8 invitations + 10 relances → 201 ×8, 200 ×10), et `resend` envoyait dans
 * sa transaction.
 */
class InvitationSmsLimitsTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Mail::fake();
        $this->sms = FakeSmsRouter::install();
        $this->agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
    }

    public function test_une_relance_par_dix_minutes_et_par_invitation(): void
    {
        $id = $this->inviter('+221770000821')->assertCreated()->json('data.id');

        $this->postJson("/api/invitations/{$id}/resend")->assertOk();
        $this->postJson("/api/invitations/{$id}/resend")->assertStatus(429);

        $this->travel(11)->minutes();
        $this->postJson("/api/invitations/{$id}/resend")->assertOk();

        $this->assertCount(3, $this->sms->sentTo('+221770000821'));
    }

    public function test_un_numero_ne_recoit_pas_plus_de_trois_invitations_par_jour(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $id = $this->inviter('+221770000822')->assertCreated()->json('data.id');
            $this->postJson("/api/invitations/{$id}/revoke")->assertOk();
        }

        $this->inviter('+221770000822')->assertStatus(429);

        $this->assertCount(3, $this->sms->sentTo('+221770000822'));
        $this->assertSame(3, Invitation::query()->where('phone', '+221770000822')->count());
    }

    public function test_un_invitant_est_borne_par_heure(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->inviter(sprintf('+2217700009%02d', $i))->assertCreated();
        }

        $this->inviter('+221770000999')->assertStatus(429);
        $this->assertSame([], $this->sms->sentTo('+221770000999'));
    }

    public function test_le_plafond_journalier_de_l_agence_refuse_avant_d_ecrire(): void
    {
        config(['sms.invitation_daily_cap_per_agency' => 2]);

        $this->inviter('+221770000831')->assertCreated();
        $this->inviter('+221770000832')->assertCreated();
        $this->inviter('+221770000833')
            ->assertStatus(429)
            ->assertJsonPath('code', 'invitation.sms_daily_cap_reached');

        $this->assertSame(0, Invitation::query()->where('phone', '+221770000833')->count());
        $this->assertSame([], $this->sms->sentTo('+221770000833'));

        // Le plafond ne compte que les SMS : une invitation par e-mail passe.
        $this->postJson("/api/agencies/{$this->agency->id}/service-providers/invite", [
            'email' => 'prestataire@example.com',
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
        ])->assertCreated();
    }

    public function test_la_relance_envoie_apres_le_commit(): void
    {
        $id = $this->inviter('+221770000841')->assertCreated()->json('data.id');

        $niveaux = [];
        Event::listen(NotificationSending::class, function () use (&$niveaux): void {
            $niveaux[] = DB::transactionLevel();
        });
        $base = DB::transactionLevel();

        $this->postJson("/api/invitations/{$id}/resend")->assertOk();

        $this->assertNotEmpty($niveaux);
        $this->assertSame([$base], array_values(array_unique($niveaux)));
    }

    private function inviter(string $numero): TestResponse
    {
        return $this->postJson("/api/agencies/{$this->agency->id}/service-providers/invite", [
            'phone' => $numero,
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
        ]);
    }
}
