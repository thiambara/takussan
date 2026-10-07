<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589 AC6 — une invitation adressée à un NUMÉRO part par SMS (drapeau
 * `auth.phone_login.enabled` allumé) : envoi, relance et rappel au numéro, jamais
 * par `Mail`, même quand un compte non vérifié porte ce numéro ; l'acceptation crée
 * un compte sans e-mail, au numéro vérifié. Un numéro injoignable est refusé,
 * drapeau éteint comme allumé.
 *
 * Rouge sur `5f872f1f` : l'e-mail était exigé, le téléphone stocké tel quel et
 * jamais utilisé (`InvitationService` n'envoyait que par `Mail::to()`).
 */
class InvitationBySmsTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000801';

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

    public function test_l_invitation_part_par_sms_au_numero_et_s_accepte_sans_email(): void
    {
        $this->inviter()->assertCreated()->assertJsonPath('data.phone', self::NUMERO)->assertJsonPath('data.email', null);

        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        Mail::assertNothingOutgoing();

        $token = $this->jetonDuDernierSms();
        $this->app['auth']->forgetGuards();
        $this->postJson("/api/invitations/{$token}/accept", ['first_name' => 'Awa', 'last_name' => 'Ndiaye'])
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted');

        $user = User::query()->where('phone', self::NUMERO)->whereNotNull('phone_verified_at')->sole();
        $this->assertNull($user->email);
        $this->assertNull($user->email_verified_at);
    }

    public function test_un_numero_porte_par_un_compte_non_verifie_recoit_quand_meme_le_sms(): void
    {
        $porteur = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => null]);

        $this->inviter()->assertCreated()->assertJsonPath('data.invited_user_id', null);

        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        Mail::assertNothingOutgoing();

        // L'acceptation crée un compte NEUF : le porteur non vérifié n'est pas fusionné.
        $this->app['auth']->forgetGuards();
        $this->postJson("/api/invitations/{$this->jetonDuDernierSms()}/accept", [])->assertOk();
        $this->assertNull($porteur->fresh()->phone_verified_at);
        $this->assertSame(2, User::query()->where('phone', self::NUMERO)->count());
    }

    public function test_la_relance_et_le_rappel_partent_par_sms(): void
    {
        $id = $this->inviter()->assertCreated()->json('data.id');

        $this->postJson("/api/invitations/{$id}/resend")->assertOk();
        $this->assertCount(2, $this->sms->sentTo(self::NUMERO));

        $this->travel(InvitationService::REMINDER_OFFSET_DAYS + 1)->days();
        app(InvitationService::class)->remindPending();
        $this->assertCount(3, $this->sms->sentTo(self::NUMERO));
        $this->assertNotNull(Invitation::query()->findOrFail($id)->last_reminded_at);

        Mail::assertNothingOutgoing();
    }

    public function test_une_seconde_invitation_au_meme_numero_rend_409(): void
    {
        $this->inviter()->assertCreated();

        $this->inviter()->assertStatus(409);
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
    }

    /** @return array<string, array{0: bool}> */
    public static function drapeau(): array
    {
        return ['drapeau allumé' => [true], 'drapeau éteint' => [false]];
    }

    #[DataProvider('drapeau')]
    public function test_un_numero_injoignable_est_refuse(bool $allume): void
    {
        config(['auth.phone_login.enabled' => $allume]);

        $this->postJson("/api/agencies/{$this->agency->id}/service-providers/invite", [
            'email' => 'prestataire@example.com',
            'phone' => '+330612345678',
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
        ])->assertStatus(422)->assertJsonValidationErrors('phone');

        $this->assertSame(0, Invitation::query()->count());
    }

    private function inviter(): TestResponse
    {
        return $this->postJson("/api/agencies/{$this->agency->id}/service-providers/invite", [
            'phone' => self::NUMERO,
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
        ]);
    }

    private function jetonDuDernierSms(): string
    {
        $messages = $this->sms->sentTo(self::NUMERO);
        $this->assertMatchesRegularExpression('/token=([A-Za-z0-9]{64})/', end($messages)['message']);
        preg_match('/token=([A-Za-z0-9]{64})/', end($messages)['message'], $m);

        return $m[1];
    }
}
