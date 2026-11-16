<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\Invitation\InvitationCodeAcceptance;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2939 (ADR-0094, amendement du 2026-11-15 § 4) — l'invité corrige le numéro que l'agence a mal saisi : pour une
 * invitation par SMS au numéro A, `POST …/code` avec `phone: B` envoie le code à B, `…/verify` accepte l'invitation pour
 * le compte au numéro B vérifié, l'invitation est réadressée à B et le journal le dit, numéros masqués. Une invitation
 * PARTAGÉE (ADR-0123 § 4) refuse la correction : la preuve du numéro saisi par l'admin est sa seule garde.
 */
class InvitationCodePhoneChangeTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO_A = '+221771234567';

    private const NUMERO_B = '+221779876543';

    private FakeSmsRouter $sms;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Cache::flush();
        Mail::fake();
        $this->sms = FakeSmsRouter::install();
        $this->agency = Agency::factory()->create();
    }

    /** AC2 — le code part à B ; l'invitation est acceptée pour le compte né au numéro B vérifié ; journalisé. */
    public function test_le_numero_corrige_recoit_le_code_et_l_invitation_est_acceptee_sur_ce_numero(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [$invitation, $profil] = $this->invitationBailleur();

        $this->code($invitation, '+221 77 987 65 43')->assertStatus(202);
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO_B));
        $this->assertSame([], $this->sms->sentTo(self::NUMERO_A), 'rien ne part au numéro mal saisi');

        $this->verifier($invitation, ['phone' => self::NUMERO_B, 'code' => $this->sms->lastCodeFor(self::NUMERO_B)])
            ->assertOk()
            ->assertJsonPath('invitation.status', 'accepted');

        $compte = User::query()->where('phone', self::NUMERO_B)->sole();
        $this->assertNotNull($compte->phone_verified_at);
        $this->assertSame(0, User::query()->where('phone', self::NUMERO_A)->count(), 'aucun compte au numéro A');
        $this->assertSame($compte->id, (int) $profil->fresh()->user_id);
        $this->assertSame(self::NUMERO_B, $invitation->fresh()->phone, 'l\'invitation est réadressée au numéro vérifié');

        $journal = Activity::query()->where('event', InvitationCodeAcceptance::EVENT_PHONE_CORRECTED)->sole();
        $this->assertSame($invitation->id, (int) $journal->subject_id);
        $this->assertSame($compte->id, (int) $journal->causer_id);
        $proprietes = (string) json_encode($journal->properties);
        $this->assertStringNotContainsString('771234567', $proprietes, 'numéros masqués au journal');
        $this->assertStringNotContainsString('779876543', $proprietes, 'numéros masqués au journal');
    }

    /** Le compte qui a DÉJÀ vérifié B reçoit l'invitation, sans compte neuf. */
    public function test_le_compte_qui_a_verifie_le_numero_corrige_recoit_l_invitation(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [$invitation, $profil] = $this->invitationBailleur();
        $existant = User::factory()->create(['email' => null, 'phone' => self::NUMERO_B, 'phone_verified_at' => now()]);
        $avant = User::query()->count();

        $this->code($invitation, self::NUMERO_B)->assertStatus(202);
        $this->verifier($invitation, ['phone' => self::NUMERO_B, 'code' => $this->sms->lastCodeFor(self::NUMERO_B)])->assertOk();

        $this->assertSame($avant, User::query()->count());
        $this->assertSame($existant->id, (int) $profil->fresh()->user_id);
    }

    /** Le numéro de l'invitation redonné tel quel n'est pas une correction : rien n'est journalisé. */
    public function test_le_meme_numero_n_est_pas_une_correction(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [$invitation] = $this->invitationBailleur();

        $this->code($invitation, self::NUMERO_A)->assertStatus(202);
        $this->verifier($invitation, ['phone' => self::NUMERO_A, 'code' => $this->sms->lastCodeFor(self::NUMERO_A)])->assertOk();

        $this->assertSame(0, Activity::query()->where('event', InvitationCodeAcceptance::EVENT_PHONE_CORRECTED)->count());
        $this->assertSame(self::NUMERO_A, $invitation->fresh()->phone);
    }

    /** Un code faux sur le numéro corrigé ne réadresse rien : l'invitation garde A, rien n'est journalisé. */
    public function test_un_code_faux_ne_readresse_pas_l_invitation(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [$invitation] = $this->invitationBailleur();

        $this->code($invitation, self::NUMERO_B)->assertStatus(202);
        $this->verifier($invitation, ['phone' => self::NUMERO_B, 'code' => '000000'])->assertStatus(422);

        $this->assertSame(self::NUMERO_A, $invitation->fresh()->phone);
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
        $this->assertSame(0, Activity::query()->where('event', InvitationCodeAcceptance::EVENT_PHONE_CORRECTED)->count());
    }

    /** ADR-0123 § 4 — une invitation partagée refuse un numéro corrigé, à l'envoi comme à la vérification ; rien ne part. */
    public function test_une_invitation_partagee_refuse_le_numero_corrige(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [$invitation] = $this->invitationBailleur(['metadata' => ['delivery' => Invitation::DELIVERY_SHARE]]);

        $this->code($invitation, self::NUMERO_B)->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->verifier($invitation, ['phone' => self::NUMERO_B, 'code' => '123456'])->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->assertSame([], $this->sms->sentTo(self::NUMERO_B));

        // Sans numéro, le code part toujours au numéro de l'invitation.
        $this->code($invitation)->assertStatus(202);
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO_A));
    }

    /** Mêmes limiteurs : le seau de vérification est celui du numéro CORRIGÉ, partagé avec `auth/phone/verify-code`. */
    public function test_le_limiteur_de_verification_compte_sur_le_numero_corrige(): void
    {
        [$invitation] = $this->invitationBailleur();

        for ($i = 0; $i < AppServiceProvider::PHONE_VERIFY_PER_WINDOW; $i++) {
            $this->verifier($invitation, ['phone' => self::NUMERO_B, 'code' => '000000'])->assertStatus(422);
        }
        $this->verifier($invitation, ['phone' => self::NUMERO_B, 'code' => '000000'])->assertStatus(429);
        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO_B, 'code' => '000000'])->assertStatus(429);
        // Le seau du numéro mal saisi reste entier.
        $this->verifier($invitation, ['code' => '000000'])->assertStatus(422);
    }

    private function code(Invitation $invitation, ?string $phone = null): TestResponse
    {
        return $this->postJson("/api/public/invitations/{$invitation->token}/code", $phone === null ? [] : ['phone' => $phone]);
    }

    /** @param  array<string, mixed>  $corps */
    private function verifier(Invitation $invitation, array $corps): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson("/api/public/invitations/{$invitation->token}/verify", $corps);
    }

    /**
     * @param  array<string, mixed>  $attributs
     * @return array{0: Invitation, 1: OwnerProfile}
     */
    private function invitationBailleur(array $attributs = []): array
    {
        $profil = OwnerProfile::factory()->create(['agency_id' => $this->agency->id, 'status' => 'draft', 'user_id' => null]);
        $invitation = Invitation::factory()->create([
            'email' => null,
            'phone' => self::NUMERO_A,
            'agency_id' => $this->agency->id,
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $profil->id,
            'role' => 'owner',
            ...$attributs,
        ]);

        return [$invitation, $profil];
    }
}
