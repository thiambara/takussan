<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeaseSignature;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Account\DeletionStepUpService;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Lease\LeaseSignatureOtpService;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-1354 (P72.04) — un code à usage unique accepté par le fournisseur, puis dit `failed` par son
 * accusé, lève le délai de renvoi de son sujet : le destinataire peut redemander un code tout de
 * suite, au lieu d'attendre la fin d'un délai posé pour un code qui n'arrivera pas. Un test par
 * envoi de code : vérification du téléphone, step-up de la suppression du compte, signature de bail.
 */
class OtpLateFailureResendTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE = '+221771234567';

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.quiet_hours.enabled', false);
        Integration::create([
            'provider' => 'sms_orange',
            'agency_id' => null,
            'credentials' => ['client_id' => 'cid', 'client_secret' => 'csec', 'sender_address' => 'tel:+221771111111'],
            'metadata' => [],
            'is_active' => true,
        ]);
        Http::preventStrayRequests();
        Http::fake([
            'api.orange.com/oauth/*' => Http::response(['access_token' => 'tok', 'expires_in' => 3600]),
            'api.orange.com/smsmessaging/*' => Http::sequence()
                ->push(['outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/1']], 201)
                ->push(['outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/2']], 201),
        ]);
    }

    private function phoneUser(array $attributes = []): User
    {
        return User::factory()->create(['phone' => self::PHONE, 'phone_verified_at' => now()] + $attributes);
    }

    /** L'accusé du dernier SMS accepté par Orange pour ce numéro. */
    private function accuse(string $status): void
    {
        $attempt = NotificationDeliveryAttempt::query()
            ->where('provider', 'orange')
            ->latest('id')
            ->firstOrFail();
        $this->assertSame(SmsResult::STATUS_SENT, $attempt->status);
        app(DeliveryAttemptUpdater::class)->applyStatus('orange', (string) $attempt->provider_message_id, $status,
            failureReason: $status === 'failed' ? 'UNDELIV' : null,
            statusPrecedence: DeliveryAttemptUpdater::SMS_STATUS_PRECEDENCE);
    }

    public function test_le_code_de_verification_du_telephone_perdu_leve_le_delai_de_renvoi(): void
    {
        $user = $this->phoneUser(['phone_verified_at' => null]);
        $codes = app(PhoneVerificationService::class);
        $this->assertTrue($codes->sendOtp($user));
        $this->assertFalse($codes->canResend($user));

        $this->accuse('failed');

        $this->assertTrue($codes->canResend($user));
        $this->assertSame(0, $codes->resendAvailableIn($user));
    }

    public function test_le_code_d_un_numero_sans_compte_perdu_leve_le_delai_de_ce_numero(): void
    {
        $codes = app(PhoneVerificationService::class);
        $this->assertTrue($codes->sendCodeTo('login', self::PHONE));
        $this->assertFalse($codes->canSendTo('login', self::PHONE));

        $this->accuse('failed');

        $this->assertTrue($codes->canSendTo('login', self::PHONE));
    }

    public function test_le_code_du_step_up_de_suppression_perdu_leve_le_delai_de_renvoi(): void
    {
        $user = $this->phoneUser(['email_verified_at' => null]);
        $stepUp = app(DeletionStepUpService::class);
        $this->assertNotNull($stepUp->sendCode($user));
        $this->assertFalse($stepUp->canResend($user));

        $this->accuse('failed');

        $this->assertTrue($stepUp->canResend($user));
    }

    public function test_le_code_de_signature_de_bail_perdu_leve_le_delai_de_renvoi(): void
    {
        $tenantUser = $this->phoneUser();
        $bytes = '%PDF-1.4 contrat fige';
        $lease = Lease::factory()->create([
            'tenant_id' => Customer::factory()->create(['user_id' => $tenantUser->id])->id,
        ]);
        $lease->addMediaFromString($bytes)->usingFileName('contrat.pdf')->toMediaCollection('signed_contract');
        $lease->forceFill(['status' => LeaseStatus::PendingSignature, 'contract_sha256' => hash('sha256', $bytes)])->save();

        $sent = app(LeaseSignatureService::class)->sendCode($lease->fresh(), $tenantUser, LeaseSignature::ROLE_TENANT);
        $this->assertSame('sms', $sent['channel']);
        $otp = app(LeaseSignatureOtpService::class);
        $this->assertFalse($otp->canResend($lease, $tenantUser, LeaseSignature::ROLE_TENANT));

        $this->accuse('failed');

        $this->assertTrue($otp->canResend($lease, $tenantUser, LeaseSignature::ROLE_TENANT));
    }

    public function test_un_code_livre_garde_son_delai_de_renvoi(): void
    {
        $user = $this->phoneUser(['phone_verified_at' => null]);
        $codes = app(PhoneVerificationService::class);
        $this->assertTrue($codes->sendOtp($user));

        $this->accuse('delivered');

        $this->assertFalse($codes->canResend($user));
    }

    public function test_un_accuse_failed_ne_leve_que_le_delai_du_code_qu_il_concerne(): void
    {
        $user = $this->phoneUser(['phone_verified_at' => null]);
        $other = User::factory()->create(['phone' => '+221771234568', 'phone_verified_at' => null]);
        $codes = app(PhoneVerificationService::class);
        $this->assertTrue($codes->sendOtp($other));
        $this->assertTrue($codes->sendOtp($user));

        $this->accuse('failed');

        $this->assertTrue($codes->canResend($user));
        $this->assertFalse($codes->canResend($other));
    }
}
