<?php

namespace Tests\Feature\Api;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\LeaseSignature;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\Channels\SmsChannel;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Lease\LeaseSignatureOtpService;
use App\Services\Notifications\Sms\SmsRouterDriver;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-596 §4B (ADR-0042) — un bail se signe par un code à usage unique sur un PDF figé et haché.
 * Avant : `activate` posait `active` sur la seule autorité du gestionnaire, sans preuve, et un
 * renouvellement `pending_signature` n'avait aucun chemin vers `active`.
 */
class LeaseSignatureTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    private User $tenantUser;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        Storage::fake(config('media-library.disk_name'));

        // VERIF-596 M2 — le VRAI gabarit, rendu en HTML sans le pied de page horodaté : un bail
        // modifié ne rend un autre contrat QUE si le gabarit imprime ce qui a changé. (L'ancien faux
        // rendu imprimait `late_fee_percent`, que le vrai contrat n'imprimait pas.)
        $this->mock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(fn (string $template, array $data) => self::stableRender($template, $data));
        });

        $this->agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $this->agency->id]);
        $this->tenantUser = User::factory()->create(['phone_verified_at' => null]);
        $tenant = Customer::factory()->create(['user_id' => $this->tenantUser->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $this->agency->id,
            'late_fee_percent' => 5,
        ]);
    }

    // ─── Outils ──────────────────────────────────────────────────────────────────────────────

    /** @param  array<string, mixed>  $data */
    private static function stableRender(string $template, array $data): string
    {
        return (string) preg_replace('/Document généré le [^<]*/u', '', view($template, $data)->render());
    }

    private function frozenBytes(): string
    {
        return (string) $this->lease->fresh()->frozenContractBytes();
    }

    private function requestSignature(?User $by = null): TestResponse
    {
        Sanctum::actingAs($by ?? $this->owner);

        return $this->postJson("/api/leases/{$this->lease->id}/signature-request");
    }

    private function sendCode(User $as, string $role): TestResponse
    {
        Sanctum::actingAs($as);

        return $this->postJson("/api/leases/{$this->lease->id}/signature/otp", ['role' => $role]);
    }

    /** Le dernier code envoyé à `$user` (le canal est simulé, le code est lu dans la notification). */
    private function lastCode(User $user): string
    {
        $code = null;
        Notification::assertSentTo($user, LeaseSignatureCodeNotification::class, function (LeaseSignatureCodeNotification $n) use (&$code) {
            $code = $n->code;

            return true;
        });

        return (string) $code;
    }

    private function sign(User $as, string $role, string $code): TestResponse
    {
        Sanctum::actingAs($as);

        return $this->postJson("/api/leases/{$this->lease->id}/signature", ['role' => $role, 'code' => $code]);
    }

    /** Envoie le code puis le saisit. */
    private function signWithCode(User $as, string $role): TestResponse
    {
        $this->sendCode($as, $role)->assertStatus(202);

        return $this->sign($as, $role, $this->lastCode($as));
    }

    private function wrongCode(string $right): string
    {
        return $right === '000000' ? '111111' : '000000';
    }

    // ─── Parcours ────────────────────────────────────────────────────────────────────────────

    public function test_two_signatures_activate_the_lease_and_generate_the_schedule_once(): void
    {
        $this->requestSignature()->assertOk()
            ->assertJsonPath('data.status', LeaseStatus::PendingSignature->value)
            ->assertJsonPath('data.contract_sha256', hash('sha256', $this->frozenBytes()));

        $this->signWithCode($this->tenantUser, 'tenant')->assertOk()
            ->assertJsonPath('data.status', LeaseStatus::PendingSignature->value);
        Bus::assertNotDispatched(GenerateLeasePaymentSchedule::class);

        $this->signWithCode($this->owner, 'landlord')->assertOk()
            ->assertJsonPath('data.status', LeaseStatus::Active->value);

        $lease = $this->lease->fresh();
        $this->assertSame(LeaseStatus::Active, $lease->status);
        $this->assertNotNull($lease->signed_at);
        $this->assertSame(2, $lease->currentSignatures()->count());
        Bus::assertDispatchedTimes(GenerateLeasePaymentSchedule::class, 1);

        // Terminal : un bail actif ne se re-signe ni ne se redemande.
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(409)->assertJsonPath('code', 'lease_signature.not_requested');
        $this->requestSignature()->assertStatus(422)->assertJsonPath('code', 'lease_signature.not_requestable');
        Bus::assertDispatchedTimes(GenerateLeasePaymentSchedule::class, 1);
    }

    public function test_the_landlord_may_sign_first(): void
    {
        $this->requestSignature()->assertOk();
        $this->signWithCode($this->owner, 'landlord')->assertOk()->assertJsonPath('data.status', 'pending_signature');
        $this->signWithCode($this->tenantUser, 'tenant')->assertOk()->assertJsonPath('data.status', 'active');
    }

    public function test_a_party_cannot_sign_twice_for_the_same_role(): void
    {
        $this->requestSignature()->assertOk();
        $this->signWithCode($this->tenantUser, 'tenant')->assertOk();

        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(409)->assertJsonPath('code', 'lease_signature.already_signed');
        $this->assertSame(1, LeaseSignature::query()->count());
    }

    public function test_signing_before_the_request_is_refused(): void
    {
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(409)->assertJsonPath('code', 'lease_signature.not_requested');
        Notification::assertNothingSentTo($this->tenantUser);
    }

    public function test_notifications_follow_the_flow(): void
    {
        $this->requestSignature()->assertOk();
        $this->assertSame(2, AppNotification::query()->where('code', 'lease.signature_requested')->count());

        $this->signWithCode($this->tenantUser, 'tenant')->assertOk();
        $this->assertSame(
            [$this->owner->id],
            AppNotification::query()->where('code', 'lease.signed_by_party')->pluck('user_id')->all()
        );

        $this->signWithCode($this->owner, 'landlord')->assertOk();
        $this->assertEqualsCanonicalizing(
            [$this->owner->id, $this->tenantUser->id],
            AppNotification::query()->where('code', 'lease.signature_completed')->pluck('user_id')->all()
        );
    }

    // ─── Le code ─────────────────────────────────────────────────────────────────────────────

    public function test_five_wrong_codes_lock_the_signature_even_for_the_right_code(): void
    {
        $this->requestSignature()->assertOk();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        $right = $this->lastCode($this->tenantUser);

        for ($i = 0; $i < LeaseSignatureOtpService::MAX_ATTEMPTS - 1; $i++) {
            $this->sign($this->tenantUser, 'tenant', $this->wrongCode($right))
                ->assertStatus(422)->assertJsonPath('code', 'lease_signature.invalid_code');
        }
        // Le 5ᵉ faux pose le verrou et le dit.
        $this->sign($this->tenantUser, 'tenant', $this->wrongCode($right))
            ->assertStatus(423)->assertJsonPath('code', 'lease_signature.code_locked');

        $this->sign($this->tenantUser, 'tenant', $right)->assertStatus(423)->assertJsonPath('code', 'lease_signature.code_locked');
        $this->travel(61)->seconds();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(423)->assertJsonPath('code', 'lease_signature.code_locked');
        $this->assertSame(0, LeaseSignature::query()->count());

        // Le verrou tombe après 15 min ; un nouveau code est alors émis.
        $this->travel(LeaseSignatureOtpService::LOCK_SECONDS)->seconds();
        $this->signWithCode($this->tenantUser, 'tenant')->assertOk();
    }

    /**
     * VERIF-596 m1 — un renvoi ne remet pas le compteur à zéro : 4 faux, un nouveau code, 1 faux →
     * verrou. Avant, « 4 faux puis renvoi » se répétait sans fin (12 faux, puis le bon code → 200).
     */
    public function test_wrong_attempts_survive_a_resend(): void
    {
        $this->requestSignature()->assertOk();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        $first = $this->lastCode($this->tenantUser);
        for ($i = 0; $i < LeaseSignatureOtpService::MAX_ATTEMPTS - 1; $i++) {
            $this->sign($this->tenantUser, 'tenant', $this->wrongCode($first))->assertStatus(422);
        }

        $this->travel(61)->seconds();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        $second = $this->lastCode($this->tenantUser);

        $this->sign($this->tenantUser, 'tenant', $this->wrongCode($second))
            ->assertStatus(423)->assertJsonPath('code', 'lease_signature.code_locked');
        $this->sign($this->tenantUser, 'tenant', $second)->assertStatus(423);
        $this->assertSame(0, LeaseSignature::query()->count());
    }

    public function test_four_wrong_codes_do_not_lock(): void
    {
        $this->requestSignature()->assertOk();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        $right = $this->lastCode($this->tenantUser);

        for ($i = 0; $i < LeaseSignatureOtpService::MAX_ATTEMPTS - 1; $i++) {
            $this->sign($this->tenantUser, 'tenant', $this->wrongCode($right))->assertStatus(422);
        }

        $this->sign($this->tenantUser, 'tenant', $right)->assertOk();
    }

    public function test_a_right_code_is_consumed_by_its_use(): void
    {
        $this->requestSignature()->assertOk();
        $otp = app(LeaseSignatureOtpService::class);
        $lease = $this->lease->fresh();

        $code = $otp->issue($lease, $this->tenantUser, 'tenant', 'mail', 'x•••@example.com');
        $this->assertNotNull($otp->attempt($lease, $this->tenantUser, 'tenant', $code));
        $this->assertNull($otp->attempt($lease, $this->tenantUser, 'tenant', $code));
    }

    /** Second chemin : le code d'un rôle ne signe pas l'autre, ni pour un autre utilisateur. */
    public function test_a_code_is_bound_to_its_signer_and_role(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $this->requestSignature()->assertOk();
        $this->sendCode($this->owner, 'landlord')->assertStatus(202);
        $ownerCode = $this->lastCode($this->owner);

        $this->sign($agent, 'landlord', $ownerCode)->assertStatus(422)->assertJsonPath('code', 'lease_signature.invalid_code');
        $this->assertSame(0, LeaseSignature::query()->count());
    }

    public function test_a_replayed_code_is_refused_after_the_contract_is_refrozen(): void
    {
        $this->requestSignature()->assertOk();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        $code = $this->lastCode($this->tenantUser);
        $this->sign($this->tenantUser, 'tenant', $code)->assertOk();

        Sanctum::actingAs($this->owner);
        $this->patchJson("/api/leases/{$this->lease->id}", ['late_fee_percent' => 7])->assertOk();
        $this->requestSignature()->assertOk();

        $this->sign($this->tenantUser, 'tenant', $code)->assertStatus(422)->assertJsonPath('code', 'lease_signature.invalid_code');
    }

    /** Second chemin du rejeu : un code émis AVANT que le contrat change, jamais utilisé, est mort. */
    public function test_a_code_issued_for_a_previous_contract_is_dead(): void
    {
        $this->requestSignature()->assertOk();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        $code = $this->lastCode($this->tenantUser);

        Sanctum::actingAs($this->owner);
        $this->patchJson("/api/leases/{$this->lease->id}", ['late_fee_percent' => 7])->assertOk();
        $this->requestSignature()->assertOk();

        $this->sign($this->tenantUser, 'tenant', $code)->assertStatus(422)->assertJsonPath('code', 'lease_signature.invalid_code');
        $this->assertSame(0, LeaseSignature::query()->count());
    }

    /** Second chemin : retirer un garant défige aussi. */
    public function test_detaching_a_guarantor_while_pending_unfreezes_the_contract(): void
    {
        $guarantor = Guarantor::factory()->create();
        $this->lease->guarantors()->attach($guarantor->id);
        $this->requestSignature()->assertOk();

        Sanctum::actingAs($this->owner);
        $this->deleteJson("/api/leases/{$this->lease->id}/guarantors/{$guarantor->id}")->assertSuccessful();

        $this->assertNull($this->lease->fresh()->contract_sha256);
    }

    public function test_a_resend_waits_sixty_seconds(): void
    {
        $this->requestSignature()->assertOk();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(429)->assertJsonPath('code', 'lease_signature.resend_too_soon');

        $this->travel(61)->seconds();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        Notification::assertSentToTimes($this->tenantUser, LeaseSignatureCodeNotification::class, 2);
    }

    /** SMS bornés : 10 envois par heure et par utilisateur, même espacés de plus de 60 s. */
    public function test_code_sending_is_bounded_per_hour(): void
    {
        $this->tenantUser->forceFill(['phone_verified_at' => now()])->save();
        $this->requestSignature()->assertOk();

        for ($i = 0; $i < 10; $i++) {
            $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
            $this->travel(61)->seconds();
        }
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(429);

        Notification::assertSentToTimes($this->tenantUser, LeaseSignatureCodeNotification::class, 10);
    }

    /**
     * Second chemin du SMS : critique ne veut pas dire illimité. Le canal réel (sans le faux
     * `Notification`) borne le code comme tout SMS, à 5 par heure et par utilisateur.
     */
    public function test_the_real_sms_channel_bounds_signature_codes_too(): void
    {
        $this->owner->forceFill(['phone' => '+221771234567', 'phone_verified_at' => now()])->save();
        $this->mock(SmsRouterDriver::class, function ($mock) {
            $mock->shouldReceive('send')->times(5)->andReturn([]);
        });
        $channel = app(SmsChannel::class);

        for ($i = 0; $i < 7; $i++) {
            $channel->send($this->owner, new LeaseSignatureCodeNotification('123456', 'LS-1', 10, LeaseSignatureCodeNotification::CHANNEL_SMS));
        }
    }

    public function test_the_code_goes_by_sms_to_a_verified_phone_else_by_mail(): void
    {
        $this->owner->forceFill(['phone' => '+221771234567', 'phone_verified_at' => now()])->save();
        $this->requestSignature()->assertOk();

        $this->sendCode($this->owner, 'landlord')->assertStatus(202)
            ->assertJsonPath('data.channel', 'sms')
            ->assertJsonPath('data.destination', '••••••••••67');
        Notification::assertSentTo($this->owner, LeaseSignatureCodeNotification::class,
            fn (LeaseSignatureCodeNotification $n, array $channels) => $channels === [SmsChannel::class]);

        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202)->assertJsonPath('data.channel', 'mail');
        Notification::assertSentTo($this->tenantUser, LeaseSignatureCodeNotification::class,
            fn (LeaseSignatureCodeNotification $n, array $channels) => $channels === ['mail']);
    }

    // ─── Le contrat figé ─────────────────────────────────────────────────────────────────────

    public function test_a_lease_modified_between_signatures_invalidates_the_pending_signature(): void
    {
        $this->requestSignature()->assertOk();
        $this->signWithCode($this->tenantUser, 'tenant')->assertOk();

        Sanctum::actingAs($this->owner);
        $this->patchJson("/api/leases/{$this->lease->id}", ['late_fee_percent' => 9])->assertOk();
        $this->assertNull($this->lease->fresh()->contract_sha256);

        // Défigé : plus rien ne se signe tant que le contrat n'est pas refigé.
        $this->sendCode($this->owner, 'landlord')->assertStatus(409)->assertJsonPath('code', 'lease_signature.not_requested');

        $this->requestSignature()->assertOk();
        $this->signWithCode($this->owner, 'landlord')->assertOk()->assertJsonPath('data.status', 'pending_signature');
        $this->assertSame(1, $this->lease->fresh()->currentSignatures()->count());
        Bus::assertNotDispatched(GenerateLeasePaymentSchedule::class);

        $this->travel(61)->seconds();
        $this->signWithCode($this->tenantUser, 'tenant')->assertOk()->assertJsonPath('data.status', 'active');
    }

    /** Second chemin : le garant n'est pas une colonne du bail, mais il est dans le contrat. */
    public function test_attaching_a_guarantor_while_pending_unfreezes_the_contract(): void
    {
        $this->requestSignature()->assertOk();
        $this->signWithCode($this->tenantUser, 'tenant')->assertOk();

        Sanctum::actingAs($this->owner);
        $this->postJson("/api/leases/{$this->lease->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop'])->assertSuccessful();

        $this->assertNull($this->lease->fresh()->contract_sha256);
        $this->sendCode($this->owner, 'landlord')->assertStatus(409);
    }

    /** Second chemin : une écriture hors route (service, script) défige aussi — la garde est sur le modèle. */
    public function test_a_direct_model_write_unfreezes_but_a_neutral_column_does_not(): void
    {
        $this->requestSignature()->assertOk();

        $this->lease->fresh()->update(['metadata' => ['note' => 'x']]);
        $this->assertNotNull($this->lease->fresh()->contract_sha256);

        $this->lease->fresh()->update(['payment_day' => 12]);
        $this->assertNull($this->lease->fresh()->contract_sha256);
    }

    public function test_the_contract_pdf_serves_the_frozen_file(): void
    {
        $this->requestSignature()->assertOk();

        Sanctum::actingAs($this->tenantUser);
        $body = $this->get("/api/leases/{$this->lease->id}/contract/pdf")->assertOk()->getContent();

        $this->assertStringContainsString('Contrat de bail', $body);
        $this->assertStringContainsString("5 % de l'échéance impayée", html_entity_decode($body, ENT_QUOTES));
        $this->assertSame(hash('sha256', $body), $this->lease->fresh()->contract_sha256);
    }

    /**
     * VERIF-596 B1 — le contrat figé est une PREUVE : aucune route générique ne le supprime, ni l'admin
     * de l'agence (`MediaPolicy::delete` l'accordait par `agency_id`), ni le super-admin (`Gate::before`).
     */
    public function test_no_one_deletes_the_frozen_contract_through_the_generic_media_route(): void
    {
        $this->requestSignature()->assertOk();
        $this->signWithCode($this->tenantUser, 'tenant')->assertOk();
        $this->signWithCode($this->owner, 'landlord')->assertOk()->assertJsonPath('data.status', 'active');
        $media = $this->lease->fresh()->getFirstMedia('signed_contract');

        Sanctum::actingAs($this->agencyAdmin($this->agency));
        $this->deleteJson("/api/media/{$media->id}")->assertForbidden()->assertJsonPath('code', 'media.evidence_locked');
        $this->actingAsRole('super_admin');
        $this->deleteJson("/api/media/{$media->id}")->assertForbidden()->assertJsonPath('code', 'media.evidence_locked');

        $this->assertNotNull($this->lease->fresh()->getFirstMedia('signed_contract'));
    }

    /**
     * VERIF-596 B1 — fermé à l'échec : un contrat figé disparu (ou altéré) n'est JAMAIS remplacé par un
     * rendu à la volée, et l'on ne signe plus une empreinte sans document.
     */
    public function test_a_missing_frozen_contract_closes_download_and_signing(): void
    {
        $this->requestSignature()->assertOk();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        $code = $this->lastCode($this->tenantUser);
        $this->lease->fresh()->getFirstMedia('signed_contract')->delete();

        Sanctum::actingAs($this->tenantUser);
        $this->get("/api/leases/{$this->lease->id}/contract/pdf", ['Accept' => 'application/json'])
            ->assertStatus(409)->assertJsonPath('code', 'lease_signature.contract_missing');
        $this->sign($this->tenantUser, 'tenant', $code)->assertStatus(409)->assertJsonPath('code', 'lease_signature.contract_missing');
        $this->assertSame(0, LeaseSignature::query()->count());
    }

    public function test_an_altered_frozen_contract_is_not_served(): void
    {
        $this->requestSignature()->assertOk();
        $media = $this->lease->fresh()->getFirstMedia('signed_contract');
        Storage::disk($media->disk)->put($media->getPathRelativeToRoot(), '%PDF-1.4 un autre contrat');

        Sanctum::actingAs($this->tenantUser);
        $this->get("/api/leases/{$this->lease->id}/contract/pdf", ['Accept' => 'application/json'])
            ->assertStatus(409)->assertJsonPath('code', 'lease_signature.contract_missing');
    }

    public function test_a_tenant_without_account_cannot_be_asked_to_sign(): void
    {
        $this->lease->tenant->forceFill(['user_id' => null])->save();

        $this->requestSignature()->assertStatus(422)->assertJsonPath('code', 'lease_signature.tenant_without_account');
        $this->assertSame(LeaseStatus::Draft, $this->lease->fresh()->status);
    }

    public function test_a_renewal_pending_signature_can_be_signed(): void
    {
        $this->lease->forceFill(['status' => LeaseStatus::PendingSignature])->save();

        $this->requestSignature()->assertOk();
        $this->signWithCode($this->tenantUser, 'tenant')->assertOk();
        $this->signWithCode($this->owner, 'landlord')->assertOk()->assertJsonPath('data.status', 'active');
    }

    // ─── La preuve ───────────────────────────────────────────────────────────────────────────

    public function test_the_proof_records_ip_hash_and_channel_and_never_exposes_ip(): void
    {
        $this->requestSignature()->assertOk();
        $this->sendCode($this->tenantUser, 'tenant')->assertStatus(202);
        Sanctum::actingAs($this->tenantUser);
        $response = $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])
            ->withHeader('User-Agent', 'NavigateurDePreuve/1.0')
            ->postJson("/api/leases/{$this->lease->id}/signature", ['role' => 'tenant', 'code' => $this->lastCode($this->tenantUser)])
            ->assertOk()
            ->assertJsonPath('data.signatures.0.role', 'tenant')
            ->assertJsonPath('data.signatures.0.method', 'otp')
            ->assertJsonPath('data.signatures.0.current', true);

        $proof = LeaseSignature::query()->sole();
        $this->assertSame('203.0.113.7', $proof->ip_address);
        $this->assertSame('NavigateurDePreuve/1.0', $proof->user_agent);
        $this->assertSame($this->lease->fresh()->contract_sha256, $proof->document_sha256);
        $this->assertSame('mail', $proof->otp_channel);
        $this->assertStringContainsString('•••@', (string) $proof->otp_destination);
        $this->assertSame($this->tenantUser->id, $proof->user_id);

        $this->assertStringNotContainsString('203.0.113.7', $response->getContent());
        $this->assertStringNotContainsString('NavigateurDePreuve', $response->getContent());
        Sanctum::actingAs($this->owner);
        $show = $this->getJson("/api/leases/{$this->lease->id}")->assertOk();
        $this->assertStringNotContainsString('203.0.113.7', $show->getContent());
        $show->assertJsonPath('data.can_sign_as', ['landlord'])->assertJsonPath('data.can_request_signature', true);
    }

    // ─── Qui signe ───────────────────────────────────────────────────────────────────────────

    public function test_a_third_party_cannot_sign_either_role(): void
    {
        $this->requestSignature()->assertOk();
        $stranger = User::factory()->create();

        $this->sendCode($stranger, 'tenant')->assertForbidden();
        $this->sendCode($stranger, 'landlord')->assertForbidden();
        $this->sign($stranger, 'tenant', '123456')->assertForbidden();
        Notification::assertNothingSentTo($stranger);
    }

    /** Le locataire ne signe pas pour le bailleur, ni le bailleur pour le locataire. */
    public function test_a_party_cannot_sign_the_other_role(): void
    {
        $this->requestSignature()->assertOk();

        $this->sendCode($this->tenantUser, 'landlord')->assertForbidden();
        $this->sendCode($this->owner, 'tenant')->assertForbidden();
    }

    public function test_super_admin_cannot_sign_for_either_party(): void
    {
        $this->requestSignature()->assertOk();
        $admin = $this->actingAsRole('super_admin');

        $this->sendCode($admin, 'tenant')->assertForbidden();
        $this->sendCode($admin, 'landlord')->assertForbidden();
        $this->sign($admin, 'tenant', '123456')->assertForbidden();
        $this->sign($admin, 'landlord', '123456')->assertForbidden();
        $this->assertSame(0, LeaseSignature::query()->count());
    }

    public function test_a_viewer_collaborator_of_the_property_cannot_sign_as_landlord(): void
    {
        $collaborator = User::factory()->create();
        $this->lease->property->collaborators()->create(['user_id' => $collaborator->id, 'role' => 'viewer', 'accepted_at' => now()]);
        $this->requestSignature()->assertOk();

        $this->sendCode($collaborator, 'landlord')->assertForbidden();
        $this->sign($collaborator, 'landlord', '123456')->assertForbidden();
    }

    public function test_an_agent_without_leases_sign_cannot_sign_for_the_landlord(): void
    {
        $this->requestSignature()->assertOk();

        $this->sendCode($this->agentWithout($this->agency, Capability::LeasesSign), 'landlord')->assertForbidden();
    }

    public function test_an_agent_with_leases_sign_signs_on_behalf_of_the_landlord(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $this->requestSignature()->assertOk();

        $this->signWithCode($agent, 'landlord')->assertOk()
            ->assertJsonPath('data.signatures.0.on_behalf_of_name', $this->owner->getFullNameAttribute());

        $proof = LeaseSignature::query()->sole();
        $this->assertSame($agent->id, $proof->user_id);
        $this->assertSame($this->owner->id, $proof->on_behalf_of_user_id);
        // Le bailleur, pour le compte duquel on a signé, est prévenu.
        $this->assertSame(1, AppNotification::query()->where('code', 'lease.signed_by_party')->where('user_id', $this->owner->id)->count());
    }

    /** Un agent d'une AUTRE agence, titulaire de `leases.sign` chez lui, ne signe pas ce bail. */
    public function test_an_agent_of_another_agency_cannot_sign_for_the_landlord(): void
    {
        $this->requestSignature()->assertOk();

        $this->sendCode($this->agencyAgent(Agency::factory()->create()), 'landlord')->assertForbidden();
    }

    public function test_a_blocked_landlord_cannot_sign(): void
    {
        $this->requestSignature()->assertOk();
        OwnerProfile::query()->where('user_id', $this->owner->id)->where('agency_id', $this->agency->id)
            ->update(['status' => OwnerProfileStatus::Blocked->value]);

        $this->sendCode($this->owner, 'landlord')->assertForbidden();
    }

    /** Second chemin : le bailleur bloqué ENTRE l'envoi du code et la saisie. */
    public function test_a_landlord_blocked_after_receiving_the_code_cannot_use_it(): void
    {
        $this->requestSignature()->assertOk();
        $this->sendCode($this->owner, 'landlord')->assertStatus(202);
        $code = $this->lastCode($this->owner);
        OwnerProfile::query()->where('user_id', $this->owner->id)->where('agency_id', $this->agency->id)
            ->update(['status' => OwnerProfileStatus::Blocked->value]);

        $this->sign($this->owner, 'landlord', $code)->assertForbidden();
        $this->assertSame(0, LeaseSignature::query()->count());
    }

    public function test_only_the_lease_manager_requests_the_signature(): void
    {
        $this->requestSignature($this->tenantUser)->assertForbidden();
        $this->requestSignature(User::factory()->create())->assertForbidden();
        $this->assertSame(LeaseStatus::Draft, $this->lease->fresh()->status);
    }

    public function test_an_invalid_role_or_code_format_is_a_validation_error(): void
    {
        $this->requestSignature()->assertOk();

        $this->sendCode($this->tenantUser, 'guarantor')->assertStatus(422)->assertJsonValidationErrors('role');
        $this->sign($this->tenantUser, 'tenant', '12ab56')->assertStatus(422)->assertJsonValidationErrors('code');
        Sanctum::actingAs($this->tenantUser);
        $this->postJson("/api/leases/{$this->lease->id}/signature/otp", ['role' => 'tenant', 'code' => '123456'])
            ->assertStatus(422)->assertJsonValidationErrors('code');
    }

    // ─── La voie papier (ADR-0042 §6) ────────────────────────────────────────────────────────

    private function activateOnPaper(?UploadedFile $file, ?User $by = null): TestResponse
    {
        Sanctum::actingAs($by ?? $this->owner);

        return $this->post(
            "/api/leases/{$this->lease->id}/activate",
            $file === null ? [] : ['contract' => $file],
            ['Accept' => 'application/json']
        );
    }

    public function test_paper_activation_requires_the_scanned_contract(): void
    {
        $this->activateOnPaper(null)->assertStatus(422)->assertJsonValidationErrors('contract');
        $this->activateOnPaper(UploadedFile::fake()->create('bail.exe', 10, 'application/octet-stream'))
            ->assertStatus(422)->assertJsonValidationErrors('contract');
        $this->assertSame(LeaseStatus::Draft, $this->lease->fresh()->status);
    }

    public function test_paper_activation_from_pending_signature_records_paper_proofs(): void
    {
        $this->requestSignature()->assertOk();
        $this->signWithCode($this->tenantUser, 'tenant')->assertOk();

        $this->activateOnPaper(UploadedFile::fake()->create('bail-signe.pdf', 200, 'application/pdf'))
            ->assertOk()->assertJsonPath('data.status', 'active');

        $lease = $this->lease->fresh();
        $paper = $lease->currentSignatures();
        $this->assertCount(2, $paper);
        $this->assertSame(['paper', 'paper'], $paper->pluck('method')->all());
        $this->assertSame([$this->owner->id, $this->owner->id], $paper->pluck('recorded_by_id')->all());
        $this->assertSame($lease->contract_sha256, hash('sha256', (string) Storage::disk(config('media-library.disk_name'))->get($lease->getFirstMedia('signed_contract')->getPathRelativeToRoot())));
        Bus::assertDispatchedTimes(GenerateLeasePaymentSchedule::class, 1);
    }

    /**
     * VERIF-596 M1 — second chemin vers la preuve du bailleur : la voie papier exige `leases.sign`
     * comme la voie par code. L'agent sans la capacité recevait 200 et le bail passait `active`.
     */
    public function test_an_agent_without_leases_sign_cannot_activate_on_paper(): void
    {
        $agent = $this->agentWithout($this->agency, Capability::LeasesSign);
        Sanctum::actingAs($agent);
        $this->getJson("/api/leases/{$this->lease->id}")->assertOk()->assertJsonPath('data.can_activate_on_paper', false);

        $this->activateOnPaper(UploadedFile::fake()->image('nimporte.png'), $agent)->assertForbidden();
        $this->assertSame(LeaseStatus::Draft, $this->lease->fresh()->status);
        $this->assertSame(0, LeaseSignature::query()->count());
    }

    /**
     * VERIF-596 passe 2 (n1) — le refus vient AVANT la validation : sans fichier, l'agent sans
     * `leases.sign` reçoit 403, jamais 422 et la liste des champs attendus. Le test précédent
     * restait vert sans la clause de `ActivateLeaseRequest` (la garde du service le rattrapait).
     */
    public function test_an_agent_without_leases_sign_and_without_a_file_is_refused_before_validation(): void
    {
        Sanctum::actingAs($this->agentWithout($this->agency, Capability::LeasesSign));

        $this->postJson("/api/leases/{$this->lease->id}/activate")->assertForbidden()->assertJsonMissingPath('errors');
        $this->assertSame(LeaseStatus::Draft, $this->lease->fresh()->status);
    }

    public function test_an_agent_with_leases_sign_and_the_landlord_activate_on_paper(): void
    {
        $agent = $this->agencyAgent($this->agency);
        Sanctum::actingAs($agent);
        $this->getJson("/api/leases/{$this->lease->id}")->assertOk()->assertJsonPath('data.can_activate_on_paper', true);

        $this->activateOnPaper(UploadedFile::fake()->create('bail.pdf', 50, 'application/pdf'), $agent)->assertOk();
    }

    public function test_super_admin_has_no_paper_path(): void
    {
        $admin = $this->actingAsRole('super_admin');

        $this->activateOnPaper(UploadedFile::fake()->create('bail.pdf', 50, 'application/pdf'), $admin)->assertForbidden();
        $this->assertSame(LeaseStatus::Draft, $this->lease->fresh()->status);
    }

    public function test_a_third_party_cannot_activate_on_paper(): void
    {
        $this->activateOnPaper(null, User::factory()->create())->assertForbidden();
        $this->activateOnPaper(UploadedFile::fake()->create('bail.pdf', 10, 'application/pdf'), $this->tenantUser)->assertForbidden();
        $this->assertSame(LeaseStatus::Draft, $this->lease->fresh()->status);
    }
}
