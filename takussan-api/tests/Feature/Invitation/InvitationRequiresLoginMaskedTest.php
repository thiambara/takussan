<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2727 (décision du porteur du 2026-11-11, option a) — le 401 `invitation.requires_login` dit à
 * quel compte se connecter sans montrer l'adresse en clair au porteur du jeton : le corps `email` et
 * l'en-tête `X-Invitation-Email` valent le `recipient.masked` de l'aperçu public de la même
 * invitation, par le lien comme par le code.
 */
class InvitationRequiresLoginMaskedTest extends TestCase
{
    use RefreshDatabase;

    private const ADRESSE = 'moussa.ndiaye@exemple.sn';

    private const NUMERO = '+221771234567';

    private Agency $agency;

    private Invitation $invitation;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Cache::flush();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->agency = Agency::factory()->create();
        User::factory()->create(['email' => self::ADRESSE]);
        $profil = OwnerProfile::factory()->create([
            'agency_id' => $this->agency->id,
            'status' => OwnerProfileStatus::Draft->value,
            'user_id' => null,
        ]);
        $this->invitation = Invitation::factory()->create([
            'email' => self::ADRESSE,
            'phone' => null,
            'agency_id' => $this->agency->id,
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $profil->id,
            'role' => 'owner',
        ]);
    }

    private function masqueDeLApercu(): string
    {
        $masque = $this->getJson("/api/public/invitations/{$this->invitation->token}")->assertOk()->json('data.recipient.masked');
        $this->assertIsString($masque);
        $this->assertStringNotContainsString(self::ADRESSE, $masque, 'prémisse : l\'aperçu masque');

        return $masque;
    }

    private function assertSansAdresseEnClair(TestResponse $reponse): void
    {
        $this->assertStringNotContainsString(self::ADRESSE, (string) $reponse->getContent());
        foreach ($reponse->headers->all() as $nom => $valeurs) {
            foreach ($valeurs as $valeur) {
                $this->assertStringNotContainsString(self::ADRESSE, (string) $valeur, "en-tête {$nom}");
            }
        }
    }

    /** AC1 — par le lien, sans session : 401, corps et en-tête valent `recipient.masked`, l'adresse nulle part. */
    public function test_ac1_par_le_lien_le_401_rend_l_adresse_masquee_de_l_apercu(): void
    {
        $masque = $this->masqueDeLApercu();

        $reponse = $this->postJson("/api/invitations/{$this->invitation->token}/accept", [])
            ->assertStatus(401)
            ->assertJsonPath('code', 'invitation.requires_login')
            ->assertJsonPath('requires_login', true)
            ->assertJsonPath('email', $masque)
            ->assertHeader('X-Invitation-Email', $masque)
            ->assertHeader('X-Invitation-Requires-Login', '1');

        $this->assertSansAdresseEnClair($reponse);
        $this->assertSame(InvitationStatus::Sent, $this->invitation->fresh()->status);
    }

    /**
     * Vérification adverse de TCK-2727 — le lien transféré : un appelant CONNECTÉ à un autre compte
     * que celui qui porte l'adresse reçoit le même 401, et l'adresse y reste masquée (corps et en-tête).
     */
    public function test_connecte_a_un_autre_compte_le_401_ne_rend_que_l_adresse_masquee(): void
    {
        $masque = $this->masqueDeLApercu();
        Sanctum::actingAs(User::factory()->create(['email' => 'aissatou.fall@exemple.sn']));

        $reponse = $this->postJson("/api/invitations/{$this->invitation->token}/accept", [])
            ->assertStatus(401)
            ->assertJsonPath('code', 'invitation.requires_login')
            ->assertJsonPath('requires_login', true)
            ->assertJsonPath('email', $masque)
            ->assertHeader('X-Invitation-Email', $masque);

        $this->assertSansAdresseEnClair($reponse);
        $this->assertSame(InvitationStatus::Sent, $this->invitation->fresh()->status);
    }

    /** AC2 — par le code (code juste, numéro d'un autre compte) : le corps `email` vaut la même valeur masquée. */
    public function test_ac2_par_le_code_le_401_rend_la_meme_adresse_masquee(): void
    {
        config(['auth.phone_login.enabled' => true]);
        $sms = FakeSmsRouter::install();
        User::factory()->create(['email' => null, 'phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $masque = $this->masqueDeLApercu();

        $this->postJson("/api/public/invitations/{$this->invitation->token}/code", ['phone' => self::NUMERO])->assertStatus(202);
        $this->app['auth']->forgetGuards();
        $reponse = $this->postJson("/api/public/invitations/{$this->invitation->token}/verify", [
            'phone' => self::NUMERO,
            'code' => $sms->lastCodeFor(self::NUMERO),
        ])
            ->assertStatus(401)
            ->assertJsonPath('code', 'invitation.requires_login')
            ->assertJsonPath('requires_login', true)
            ->assertJsonPath('email', $masque);

        $this->assertSansAdresseEnClair($reponse);
    }
}
