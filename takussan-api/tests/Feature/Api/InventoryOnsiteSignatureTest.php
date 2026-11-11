<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Lease\LeaseSignatureOtpService;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use App\Services\Pdf\DocumentPdfService;
use App\Services\Signature\SignatureOtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2646 (ADR-0098) — le locataire signe l'état des lieux sur l'appareil d'un membre du personnel :
 * il trace, puis saisit le code reçu par SMS au numéro VÉRIFIÉ de son compte. Jamais au téléphone de
 * la fiche `Customer`, que l'agence saisit elle-même.
 */
class InventoryOnsiteSignatureTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    private const TENANT_PHONE = '+221771234567';

    private const CUSTOMER_PHONE = '+221779876543';

    private Agency $agency;

    private User $owner;

    private User $tenantUser;

    private Customer $tenant;

    private Property $property;

    private Lease $lease;

    private Inventory $inventory;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($this->agency)->create();
        $this->property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $this->agency->id]);
        $this->tenantUser = User::factory()->create(['phone' => self::TENANT_PHONE, 'phone_verified_at' => now()]);
        // La fiche porte un AUTRE numéro : celui que l'agence a saisi.
        $this->tenant = Customer::factory()->create(['user_id' => $this->tenantUser->id, 'phone' => self::CUSTOMER_PHONE]);
        $this->lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => $this->tenant->id,
            'agency_id' => $this->agency->id,
        ]);
        $this->agent = $this->agencyAgent($this->agency);
        $this->inventory = Inventory::factory()->create([
            'lease_id' => $this->lease->id,
            'property_id' => $this->property->id,
            'tenant_id' => $this->tenant->id,
            'conducted_by' => $this->agent->id,
        ]);
    }

    // ─── Outils ──────────────────────────────────────────────────────────────────────────────

    private function sendCode(User $as): TestResponse
    {
        Sanctum::actingAs($as);

        return $this->postJson("/api/inventories/{$this->inventory->id}/sign/onsite-code");
    }

    /** @param  array<string, mixed>  $extra */
    private function sign(User $as, ?string $code, array $extra = []): TestResponse
    {
        Sanctum::actingAs($as);

        return $this->postJson("/api/inventories/{$this->inventory->id}/sign", array_filter([
            'role' => 'tenant',
            'signature' => self::SIGNATURE,
            'code' => $code,
        ] + $extra, fn ($v) => $v !== null));
    }

    private function lastCode(): string
    {
        $code = null;
        Notification::assertSentTo($this->tenantUser, LeaseSignatureCodeNotification::class, function (LeaseSignatureCodeNotification $n) use (&$code) {
            $code = $n->code;

            return true;
        });

        return (string) $code;
    }

    private function wrongCode(string $right): string
    {
        return $right === '000000' ? '111111' : '000000';
    }

    // ─── AC1 — le code part au numéro vérifié du compte, et la preuve est gardée ─────────────

    public function test_ac1_le_code_part_au_numero_verifie_du_compte_jamais_a_la_fiche_et_la_preuve_est_gardee(): void
    {
        Notification::swap(new ChannelManager($this->app));
        $sent = [];
        $this->mock(SmsRouterDriver::class, function ($mock) use (&$sent) {
            $mock->shouldReceive('send')->andReturnUsing(function (array|string $to, string $message) use (&$sent) {
                foreach ((array) $to as $number) {
                    $sent[] = ['to' => $number, 'message' => $message];
                }

                return [self::TENANT_PHONE => SmsResult::sent(self::TENANT_PHONE, 'lafricamobile', 'lam-1')];
            });
        });

        $this->sendCode($this->agent)->assertStatus(202)
            ->assertJsonPath('data.channel', 'sms')
            ->assertJsonPath('data.destination', '••••••••••67');

        $this->assertSame([self::TENANT_PHONE], array_column($sent, 'to'));
        $this->assertNotContains(self::CUSTOMER_PHONE, array_column($sent, 'to'));
        $this->assertSame(1, preg_match('/\b(\d{6})\b/', $sent[0]['message'], $m));

        $this->sign($this->agent, $m[1])->assertOk()
            ->assertJsonPath('data.tenant_signed', true)
            ->assertJsonPath('data.tenant_signature_method', 'onsite_otp')
            ->assertJsonPath('data.tenant_signed_via_user_id', $this->agent->id)
            ->assertJsonPath('data.tenant_otp_channel', 'sms')
            ->assertJsonPath('data.tenant_otp_destination', '••••••••••67')
            // ADR-0042 §3 — l'IP ne sort jamais de l'API.
            ->assertJsonMissingPath('data.tenant_signed_ip');

        $row = $this->inventory->refresh();
        $this->assertSame(Inventory::TENANT_METHOD_ONSITE_OTP, $row->tenant_signature_method);
        $this->assertSame($this->agent->id, (int) $row->tenant_signed_via_user_id);
        $this->assertSame('127.0.0.1', $row->tenant_signed_ip);
        $this->assertNotNull($row->tenant_signed_at);
        $this->assertSame(InventoryStatus::PendingSignature, $row->status);
    }

    public function test_le_code_n_a_pas_de_repli_par_e_mail(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);

        Notification::assertSentTo($this->tenantUser, LeaseSignatureCodeNotification::class,
            fn (LeaseSignatureCodeNotification $n, array $channels) => $n->channel === LeaseSignatureCodeNotification::CHANNEL_SMS
                && $n->texts === LeaseSignatureCodeNotification::TEXTS_INVENTORY);
    }

    /** ADR-0098 § Application — une fiche sans compte vérifié rend 422, même avec un téléphone saisi. */
    #[DataProvider('locatairesSansNumeroVerifie')]
    public function test_un_locataire_sans_numero_verifie_au_compte_recoit_422(string $cas): void
    {
        match ($cas) {
            'fiche sans compte' => $this->tenant->forceFill(['user_id' => null])->save(),
            'compte non vérifié' => $this->tenantUser->forceFill(['phone_verified_at' => null])->save(),
            'compte sans numéro' => $this->tenantUser->forceFill(['phone' => null, 'phone_verified_at' => null])->save(),
        };

        $this->sendCode($this->agent)->assertStatus(422)
            ->assertJsonPath('code', 'inventory_signature.tenant_without_phone');
        Notification::assertNothingSent();
    }

    /** @return array<string, array{string}> */
    public static function locatairesSansNumeroVerifie(): array
    {
        return [
            'fiche sans compte' => ['fiche sans compte'],
            'compte non vérifié' => ['compte non vérifié'],
            'compte sans numéro' => ['compte sans numéro'],
        ];
    }

    public function test_un_mauvais_code_rend_422_sur_code_et_ne_signe_rien(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);

        $this->sign($this->agent, $this->wrongCode($this->lastCode()))
            ->assertStatus(422)->assertJsonValidationErrors(['code']);
        $this->assertFalse($this->inventory->refresh()->tenant_signed);
    }

    /** Le personnel qui pose `role=tenant` sans code : 422 sur `code`, jamais un tracé sans preuve. */
    public function test_le_personnel_sans_code_recoit_422_sur_code(): void
    {
        $this->sign($this->agent, null)->assertStatus(422)->assertJsonValidationErrors(['code']);
        $this->assertFalse($this->inventory->refresh()->tenant_signed);
    }

    public function test_un_code_s_use_a_son_usage(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);
        $code = $this->lastCode();
        $this->sign($this->agent, $code)->assertOk();

        // Le locataire a signé : le même code rejoué rencontre le 409 avant tout essai.
        $this->sign($this->agent, $code)->assertStatus(409)->assertJsonPath('code', 'inventory.already_signed_tenant');
    }

    /** Le code atteste ce que le locataire a sous les yeux : un brouillon modifié depuis l'envoi l'invalide. */
    public function test_un_code_ne_vaut_plus_rien_apres_une_modification_du_brouillon(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);
        $code = $this->lastCode();

        Sanctum::actingAs($this->agent);
        $this->patchJson("/api/inventories/{$this->inventory->id}", ['notes' => 'Une tache ajoutée après coup.'])->assertOk();

        $this->sign($this->agent, $code)->assertStatus(422)->assertJsonValidationErrors(['code']);
    }

    // ─── AC2 — cinq faux verrouillent, même pour le bon code ─────────────────────────────────

    public function test_ac2_cinq_mauvais_codes_puis_le_bon_rendent_423_et_le_verrou_tombe(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);
        $right = $this->lastCode();

        for ($i = 0; $i < SignatureOtpService::MAX_ATTEMPTS - 1; $i++) {
            $this->sign($this->agent, $this->wrongCode($right))->assertStatus(422);
        }
        $this->sign($this->agent, $this->wrongCode($right))
            ->assertStatus(423)->assertJsonPath('code', 'inventory_signature.code_locked');
        $this->sign($this->agent, $right)->assertStatus(423)->assertJsonPath('code', 'inventory_signature.code_locked');

        // Le verrou est celui du LOCATAIRE : un autre membre du personnel ne rouvre pas cinq essais.
        $this->travel(61)->seconds();
        $this->sendCode($this->agencyAgent($this->agency))->assertStatus(423)->assertJsonPath('code', 'inventory_signature.code_locked');
        $this->assertFalse($this->inventory->refresh()->tenant_signed);

        $this->travel(SignatureOtpService::LOCK_SECONDS)->seconds();
        Notification::fake();
        $this->sendCode($this->agent)->assertStatus(202);
        $this->sign($this->agent, $this->lastCode())->assertOk()->assertJsonPath('data.tenant_signature_method', 'onsite_otp');
    }

    public function test_un_renvoi_avant_soixante_secondes_rend_429(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);
        $this->sendCode($this->agent)->assertStatus(429)->assertJsonPath('code', 'inventory_signature.resend_too_soon');

        $this->travel(61)->seconds();
        $this->sendCode($this->agent)->assertStatus(202);
    }

    // ─── AC3 — qui ne lance pas la voie ──────────────────────────────────────────────────────

    #[DataProvider('collaboratorRoles')]
    public function test_ac3_un_collaborateur_du_bien_qui_n_est_pas_du_personnel_recoit_403(string $role): void
    {
        $collaborator = User::factory()->create();
        $this->property->collaborators()->create(['user_id' => $collaborator->id, 'role' => $role, 'accepted_at' => now()]);

        $this->sendCode($collaborator)->assertForbidden();
        Notification::assertNothingSent();
    }

    /** @return array<string, array{string}> */
    public static function collaboratorRoles(): array
    {
        return ['viewer' => ['viewer'], 'co_owner' => ['co_owner'], 'manager' => ['manager'], 'agent' => ['agent']];
    }

    public function test_ni_le_bailleur_ni_le_super_admin_ni_le_personnel_d_une_autre_agence_ni_le_locataire_ne_lancent_la_voie(): void
    {
        $this->sendCode($this->owner)->assertForbidden();
        $this->sendCode($this->agencyAgent(Agency::factory()->create()))->assertForbidden();
        $this->sendCode($this->tenantUser)->assertForbidden();

        $this->actingAsRole('super_admin');
        $this->postJson("/api/inventories/{$this->inventory->id}/sign/onsite-code")->assertForbidden();

        // Ni par le code d'un autre : la saisie aussi est refusée avant tout essai.
        $this->sign($this->owner, '123456')->assertForbidden();
        Notification::assertNothingSent();
    }

    public function test_un_locataire_deja_signe_rend_409_sur_l_envoi(): void
    {
        $this->inventory->forceFill(['tenant_signed' => true, 'tenant_signed_at' => now(), 'status' => InventoryStatus::PendingSignature])->save();

        $this->sendCode($this->agent)->assertStatus(409)->assertJsonPath('code', 'inventory.already_signed_tenant');
        Notification::assertNothingSent();
    }

    public function test_can_sign_as_rend_tenant_onsite_au_personnel_tant_que_le_locataire_n_a_pas_signe(): void
    {
        // L'agent détient aussi `leases.sign` : il signe pour le bailleur, et recueille le locataire.
        Sanctum::actingAs($this->agent);
        $this->getJson("/api/inventories/{$this->inventory->id}")->assertOk()
            ->assertJsonPath('data.can_sign_as', ['landlord', 'tenant_onsite']);

        Sanctum::actingAs($this->tenantUser);
        $this->getJson("/api/inventories/{$this->inventory->id}")->assertOk()->assertJsonPath('data.can_sign_as', ['tenant']);

        Sanctum::actingAs($this->owner);
        $this->getJson("/api/inventories/{$this->inventory->id}")->assertOk()->assertJsonPath('data.can_sign_as', ['landlord']);

        $this->inventory->forceFill(['tenant_signed' => true, 'tenant_signed_at' => now()])->save();
        Sanctum::actingAs($this->agent);
        $this->getJson("/api/inventories/{$this->inventory->id}")->assertOk()->assertJsonPath('data.can_sign_as', ['landlord']);
    }

    // ─── Portée du code ──────────────────────────────────────────────────────────────────────

    /** Un code de bail ne signe pas l'état des lieux de même identifiant, et réciproquement. */
    public function test_un_code_de_bail_ne_vaut_rien_pour_un_etat_des_lieux(): void
    {
        $otp = app(LeaseSignatureOtpService::class);
        $twin = Lease::query()->find($this->inventory->id) ?? Lease::factory()->create();
        $leaseCode = $otp->issue($twin, $this->tenantUser, 'tenant', 'sms', '••67');
        $this->assertSame("lease-signature-cooldown:{$twin->id}:{$this->tenantUser->id}:tenant", $otp->resendKey($twin, $this->tenantUser, 'tenant'));
        $this->assertSame("inventory-signature-cooldown:{$this->inventory->id}:{$this->tenantUser->id}:tenant", $otp->resendKey($this->inventory, $this->tenantUser, 'tenant'));

        $this->assertNull($otp->attempt($this->inventory, $this->tenantUser, 'tenant', $leaseCode));
    }

    // ─── Le PDF le dit ───────────────────────────────────────────────────────────────────────

    public function test_le_pdf_dit_signe_sur_place_avec_le_numero_masque(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);
        $this->sign($this->agent, $this->lastCode())->assertOk();
        Sanctum::actingAs($this->owner);
        $this->postJson("/api/inventories/{$this->inventory->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE])->assertOk();

        $captured = null;
        $this->mock(DocumentPdfService::class, function ($mock) use (&$captured) {
            $mock->shouldReceive('stream')->once()->andReturnUsing(function (string $template, array $data) use (&$captured) {
                $captured = view($template, $data)->render();

                return response('%PDF-1.4');
            });
        });

        $this->get("/api/inventories/{$this->inventory->id}/pdf")->assertOk();

        $this->assertStringContainsString(e(__('inventories.pdf.signed_onsite', ['destination' => '••••••••••67'])), (string) $captured);
    }
}
