<?php

namespace Tests\Feature\Lease;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeaseSignature;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2810 (ADR-0042, amendement du 2026-11-14 bis) — signer pour le bailleur se juge sur le PROFIL
 * ACTIF, comme lire le bail. Le personnel de A et de B ne signe un bail de A, ni son état des lieux,
 * que depuis son profil de A : c'est l'espace d'où il le lit. Chaque refus est confronté à la lecture
 * (`GET /api/leases/{id}`) sous le même profil, et chaque scénario a son témoin positif sous le profil
 * de A, pour que le 403 ne puisse venir d'autre chose que du prédicat.
 *
 * Les jugements passent tous par HTTP : `staffAgencyId()` lit le profil actif de la requête, et un
 * appel direct après une requête de test verrait le profil de cette dernière.
 */
class SignatureAuProfilActifTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private Agency $autreAgence;

    private Customer $tenant;

    private User $double;

    private AgentProfile $profilA;

    private AgentProfile $profilB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();

        Notification::fake();
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        $this->mock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturn('%PDF-1.4 contrat');
        });

        $this->autreAgence = Agency::factory()->create();
        $this->tenant = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->agent->id,
            'user_id' => $this->client->id,
        ]);

        // Le personnel de deux agences : agent de A (l'agence du bail) et de B.
        $this->double = User::factory()->create();
        $this->profilA = AgentProfile::factory()->create(['user_id' => $this->double->id, 'agency_id' => $this->agency->id]);
        $this->profilB = AgentProfile::factory()->create(['user_id' => $this->double->id, 'agency_id' => $this->autreAgence->id]);
    }

    private function brouillon(): Lease
    {
        return Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->tenant->id,
            'status' => LeaseStatus::Draft,
            'start_date' => now()->addDays(3)->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
        ]);
    }

    /** Un bail de A en attente de signature, son contrat figé par le personnel de A seul. */
    private function bailASigner(): Lease
    {
        $bail = $this->brouillon();
        $this->en($this->agent)->postJson("/api/leases/{$bail->id}/signature-request")->assertOk();

        return $bail->fresh();
    }

    private function etatDesLieux(Lease $bail): Inventory
    {
        return Inventory::factory()->pendingSignature()->create([
            'lease_id' => $bail->id, 'property_id' => $bail->property_id,
            'tenant_id' => $this->tenant->id, 'conducted_by' => $this->agent->id,
        ]);
    }

    /** Connecte `$qui`, sous le profil actif `$profil` (`type:id`) ou sans aucun : en-têtes vidés à chaque appel. */
    private function en(User $qui, ?string $profil = null): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->actingAs($qui->fresh(), 'sanctum');
        if ($profil !== null) {
            $this->withHeader('X-Profile-Id', $profil);
        }

        return $this;
    }

    private function code(User $qui): string
    {
        $code = null;
        Notification::assertSentTo($qui, LeaseSignatureCodeNotification::class, function (LeaseSignatureCodeNotification $n) use (&$code): bool {
            $code = $n->code;

            return true;
        });

        return (string) $code;
    }

    /**
     * AC3 — profil actif B : le bail de A ne se lit pas, son code ne part pas, sa signature est
     * refusée même avec un code émis hors de la porte, et `can_sign_as` ne sort pas.
     */
    public function test_ac3_profil_actif_b_ni_code_ni_signature_du_bail_de_a(): void
    {
        $bail = $this->bailASigner();
        $b = "agent:{$this->profilB->id}";

        $this->en($this->double, $b)->getJson("/api/leases/{$bail->id}")->assertForbidden();
        $this->en($this->double, $b)->postJson("/api/leases/{$bail->id}/signature/otp", ['role' => 'landlord'])->assertForbidden();
        Notification::assertNotSentTo($this->double, LeaseSignatureCodeNotification::class);
        $this->en($this->double, $b)->postJson("/api/leases/{$bail->id}/signature", ['role' => 'landlord', 'code' => '123456'])->assertForbidden();

        $this->assertSame(0, LeaseSignature::query()->where('lease_id', $bail->id)->count());
    }

    /** AC3 — le même compte, profil actif A : 202 puis 200, et la preuve porte `on_behalf_of` = le bailleur. */
    public function test_ac3_profil_actif_a_signe_pour_le_bailleur_comme_avant(): void
    {
        $bail = $this->bailASigner();
        $a = "agent:{$this->profilA->id}";

        $this->assertSame(['landlord'], $this->en($this->double, $a)->getJson("/api/leases/{$bail->id}")->assertOk()->json('data.can_sign_as'));
        $this->en($this->double, $a)->postJson("/api/leases/{$bail->id}/signature/otp", ['role' => 'landlord'])->assertStatus(202);
        $this->en($this->double, $a)->postJson("/api/leases/{$bail->id}/signature", ['role' => 'landlord', 'code' => $this->code($this->double)])->assertOk();

        $preuve = LeaseSignature::query()->where('lease_id', $bail->id)->where('role', LeaseSignature::ROLE_LANDLORD)->sole();
        $this->assertSame($this->double->id, (int) $preuve->user_id);
        $this->assertSame($this->landlord->id, (int) $preuve->on_behalf_of_user_id);
    }

    /** AC3 — l'état des lieux du bail de A : 403 sous le profil B, 200 sous le profil A, pour le bailleur. */
    public function test_ac3_etat_des_lieux_signe_seulement_depuis_le_profil_de_a(): void
    {
        $etat = $this->etatDesLieux($this->bailASigner());

        $this->en($this->double, "agent:{$this->profilB->id}")->postJson("/api/inventories/{$etat->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE_DESSINEE])->assertForbidden();
        $this->assertFalse((bool) $etat->fresh()->owner_signed);

        $this->en($this->double, "agent:{$this->profilA->id}")->postJson("/api/inventories/{$etat->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE_DESSINEE])->assertOk();
        $signe = $etat->fresh();
        $this->assertTrue((bool) $signe->owner_signed);
        $this->assertSame($this->double->id, (int) $signe->owner_signed_by_user_id);
        $this->assertSame($this->landlord->id, (int) $signe->owner_signed_on_behalf_of_user_id);
    }

    /**
     * La règle est plus large que « deux agences » (amendement, décision 2) : sans profil résolu, aucune
     * auto-bascule, donc aucun périmètre ; personnel de A dont le profil actif est un profil de bailleur
     * dans B, pas davantage. Dans chaque cas, la lecture est refusée aussi.
     */
    public function test_sans_profil_resolu_ni_lecture_ni_signature(): void
    {
        $bail = $this->bailASigner();
        $etat = $this->etatDesLieux($bail);

        $this->en($this->double)->getJson("/api/leases/{$bail->id}")->assertForbidden();
        $this->en($this->double)->postJson("/api/leases/{$bail->id}/signature/otp", ['role' => 'landlord'])->assertForbidden();
        $this->en($this->double)->postJson("/api/inventories/{$etat->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE_DESSINEE])->assertForbidden();
        Notification::assertNotSentTo($this->double, LeaseSignatureCodeNotification::class);
        $this->assertFalse((bool) $etat->fresh()->owner_signed);
    }

    public function test_personnel_de_a_au_profil_de_bailleur_dans_b_ne_signe_pas(): void
    {
        $bail = $this->bailASigner();
        $etat = $this->etatDesLieux($bail);
        $agentEtBailleur = $this->agencyAgent($this->agency);
        $profilBailleurB = OwnerProfile::factory()->create(['user_id' => $agentEtBailleur->id, 'agency_id' => $this->autreAgence->id]);
        $profilAgentA = AgentProfile::query()->where('user_id', $agentEtBailleur->id)->where('agency_id', $this->agency->id)->sole();
        $bailleurB = "owner:{$profilBailleurB->id}";

        $this->en($agentEtBailleur, $bailleurB)->getJson("/api/leases/{$bail->id}")->assertForbidden();
        $this->en($agentEtBailleur, $bailleurB)->postJson("/api/leases/{$bail->id}/signature/otp", ['role' => 'landlord'])->assertForbidden();
        $this->en($agentEtBailleur, $bailleurB)->postJson("/api/inventories/{$etat->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE_DESSINEE])->assertForbidden();
        Notification::assertNotSentTo($agentEtBailleur, LeaseSignatureCodeNotification::class);

        // Témoin : depuis son profil d'agent de A, il signe.
        $this->en($agentEtBailleur, "agent:{$profilAgentA->id}")->postJson("/api/leases/{$bail->id}/signature/otp", ['role' => 'landlord'])->assertStatus(202);
    }

    /**
     * AC5 — la voie papier, déjà alignée par `LeasePolicy::update` : 403 sous le profil B, avant
     * comme après TCK-2810 (l'ablation de `isMandatedStaff` le laisse vert) ; 200 sous le profil A.
     */
    public function test_ac5_la_voie_papier_suit_deja_le_profil_actif(): void
    {
        $brouillon = $this->brouillon();
        $contrat = fn (): UploadedFile => UploadedFile::fake()->create('bail.pdf', 120, 'application/pdf');

        $this->en($this->double, "agent:{$this->profilB->id}")->post("/api/leases/{$brouillon->id}/activate", ['contract' => $contrat()], ['Accept' => 'application/json'])->assertForbidden();
        $this->assertSame(LeaseStatus::Draft, $brouillon->fresh()->status);

        $this->en($this->double, "agent:{$this->profilA->id}")->post("/api/leases/{$brouillon->id}/activate", ['contract' => $contrat()], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame(LeaseStatus::Active, $brouillon->fresh()->status);
    }

    /** La voie du bailleur ne change pas : il signe pour lui-même, `on_behalf_of` nul. */
    public function test_le_bailleur_signe_toujours_pour_lui_meme(): void
    {
        $bail = $this->bailASigner();

        $this->en($this->landlord)->postJson("/api/leases/{$bail->id}/signature/otp", ['role' => 'landlord'])->assertStatus(202);
        $this->en($this->landlord)->postJson("/api/leases/{$bail->id}/signature", ['role' => 'landlord', 'code' => $this->code($this->landlord)])->assertOk();

        $preuve = LeaseSignature::query()->where('lease_id', $bail->id)->where('role', LeaseSignature::ROLE_LANDLORD)->sole();
        $this->assertSame($this->landlord->id, (int) $preuve->user_id);
        $this->assertNull($preuve->on_behalf_of_user_id);
    }

    private const SIGNATURE_DESSINEE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';
}
