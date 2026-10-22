<?php

namespace Tests\Feature\Invitation;

use App\Jobs\SendDeferredSmsJob;
use App\Models\Agency;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
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

    /**
     * TCK-1344 (P132.05) — le compte qui naît de l'invitation garde la langue dans laquelle elle
     * est partie (`metadata.locale`), au lieu du défaut `fr` de la colonne.
     */
    public function test_le_compte_ne_de_l_invitation_garde_sa_langue(): void
    {
        $this->inviter()->assertCreated();
        $invitation = Invitation::query()->sole();
        $invitation->forceFill(['metadata' => [...($invitation->metadata ?? []), 'locale' => 'en']])->save();

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/invitations/{$this->jetonDuDernierSms()}/accept", ['first_name' => 'Awa', 'last_name' => 'Ndiaye'])->assertOk();

        $this->assertSame('en', User::query()->where('phone', self::NUMERO)->sole()->preferred_language);
    }

    /**
     * TCK-1346 (P132.04) — un SMS d'invitation reporté par les heures calmes (le job reçoit le
     * texte et le contexte que le canal a remis au routeur) n'est pas envoyé au matin si
     * l'invitation a été révoquée ou relancée (jeton neuf) pendant la nuit ; l'abandon s'écrit.
     */
    public function test_un_sms_reporte_n_est_pas_envoye_si_l_invitation_a_ete_revoquee_la_nuit(): void
    {
        $this->inviter()->assertCreated();
        $nuit = end($this->sms->sent);
        $job = new SendDeferredSmsJob([$nuit['to']], $nuit['message'], $nuit['context']);

        $this->postJson('/api/invitations/'.Invitation::query()->sole()->id.'/revoke')->assertOk();
        Log::spy();
        app()->call([$job, 'handle']);

        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        Log::shouldHaveReceived('info')->withArgs(fn (string $m) => str_contains($m, '[sms.deferred]'))->once();
    }

    public function test_un_sms_reporte_n_est_pas_envoye_si_l_invitation_a_ete_relancee_la_nuit(): void
    {
        $this->inviter()->assertCreated();
        $nuit = end($this->sms->sent);
        $job = new SendDeferredSmsJob([$nuit['to']], $nuit['message'], $nuit['context']);

        $this->postJson('/api/invitations/'.Invitation::query()->sole()->id.'/resend')->assertOk();
        $this->assertCount(2, $this->sms->sentTo(self::NUMERO));
        app()->call([$job, 'handle']);

        $this->assertCount(2, $this->sms->sentTo(self::NUMERO));
    }

    public function test_un_sms_reporte_d_une_invitation_toujours_valide_part_au_matin(): void
    {
        $this->inviter()->assertCreated();
        $nuit = end($this->sms->sent);

        app()->call([new SendDeferredSmsJob([$nuit['to']], $nuit['message'], $nuit['context']), 'handle']);

        $this->assertCount(2, $this->sms->sentTo(self::NUMERO));
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

    /**
     * P132.02 (TCK-1252) — le rappel part 2 jours après la DERNIÈRE émission (la relance comprise),
     * et non 2 jours après la création : une invitation relancée à J+3 ne reçoit pas son rappel
     * dans l'heure qui suit.
     */
    public function test_le_rappel_part_deux_jours_apres_la_relance_et_non_dans_l_heure(): void
    {
        $id = $this->inviter()->assertCreated()->json('data.id');

        $this->travel(InvitationService::REMINDER_OFFSET_DAYS + 1)->days();
        app(InvitationService::class)->remindPending();
        $this->assertCount(2, $this->sms->sentTo(self::NUMERO));

        $this->postJson("/api/invitations/{$id}/resend")->assertOk();
        $this->assertCount(3, $this->sms->sentTo(self::NUMERO));

        $this->travel(1)->hours();
        app(InvitationService::class)->remindPending();
        $this->assertCount(3, $this->sms->sentTo(self::NUMERO), 'aucun rappel une heure après la relance');

        $this->travel(InvitationService::REMINDER_OFFSET_DAYS)->days();
        app(InvitationService::class)->remindPending();
        $this->assertCount(4, $this->sms->sentTo(self::NUMERO), 'un rappel deux jours après la relance');
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

    /** @return array<string, array{0: string, 1: array<string, string>, 2: string}> */
    public static function saisiesHumaines(): array
    {
        $agent = ['role' => 'agent'];
        $owner = ['owner_type' => 'individual'];

        return [
            'agent, forme espacée' => ['agents', $agent, '+221 77 000 08 01'],
            'agent, forme nationale' => ['agents', $agent, '77 000 08 01'],
            'propriétaire, forme espacée' => ['owners', $owner, '+221 77 000 08 01'],
            'propriétaire, forme nationale' => ['owners', $owner, '77 000 08 01'],
            'prestataire, forme espacée' => ['service-providers', [], '+221 77 000 08 01'],
            'prestataire, forme nationale' => ['service-providers', [], '77 000 08 01'],
        ];
    }

    /**
     * P125.04 (TCK-1283) — les trois invitations par téléphone acceptent la forme que leur message
     * d'erreur donne en exemple (« +221 77 123 45 67 ») et la forme nationale, comme la visite et la
     * demande de contact (`TelephoneSaisi`, TCK-590) : le numéro est rangé et joint en E.164.
     *
     * @param  array<string, string>  $champs
     */
    #[DataProvider('saisiesHumaines')]
    public function test_une_invitation_a_un_numero_saisi_en_forme_humaine_part_en_e164(string $cible, array $champs, string $saisie): void
    {
        $this->postJson("/api/agencies/{$this->agency->id}/{$cible}/invite", [
            'phone' => $saisie,
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            ...$champs,
        ])->assertCreated()->assertJsonPath('data.phone', self::NUMERO);

        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
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
