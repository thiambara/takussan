<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Pdf\DocumentPdfService;
use App\Services\Pdf\PrintedIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P234.06 (TCK-2315) — la raison sociale d'un bailleur société (`owner_profiles.metadata.company_name`
 * de son profil dans l'agence, format de TCK-1323 : en tête, la personne en dessous) s'imprime sur
 * le contrat, le relevé et l'état des lieux. Un contrat figé garde ses octets, et un état des lieux
 * signé garde l'identité de sa seconde signature.
 */
class LandlordCompanyNameTest extends TestCase
{
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));

        // Le vrai gabarit, rendu en HTML sans le pied de page horodaté : le texte imprimé se lit
        // dans les octets servis.
        $this->partialMock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(
                fn (string $template, array $data) => (string) preg_replace('/Document généré le [^<]*/u', '', view($template, $data)->render())
            );
        });
    }

    public function test_le_contrat_nomme_la_societe_en_tete_et_la_personne_en_dessous(): void
    {
        [$agency, $landlord, $lease] = $this->scaffold();
        $this->becomeCompany($agency, $landlord, 'SCI Baobab');
        Sanctum::actingAs($landlord);

        $html = (string) $this->get("/api/leases/{$lease->id}/contract/pdf")->assertOk()->getContent();

        $this->assertMatchesRegularExpression('/SCI Baobab.*Moussa Fall/s', $html);
    }

    public function test_un_bailleur_particulier_reste_nomme_par_son_nom(): void
    {
        [$agency, $landlord, $lease] = $this->scaffold();
        // La raison sociale d'un particulier ne s'imprime pas, même saisie.
        OwnerProfile::query()->where('user_id', $landlord->id)->update(['metadata' => json_encode(['owner_type' => 'individual', 'company_name' => 'SCI Baobab'])]);
        Sanctum::actingAs($landlord);

        $html = (string) $this->get("/api/leases/{$lease->id}/contract/pdf")->assertOk()->getContent();

        $this->assertStringContainsString('Moussa Fall', $html);
        $this->assertStringNotContainsString('SCI Baobab', $html);
    }

    public function test_la_raison_sociale_d_une_autre_agence_ne_s_imprime_pas(): void
    {
        [, $landlord, $lease] = $this->scaffold();
        $this->becomeCompany(Agency::factory()->create(), $landlord, 'SCI Ailleurs');
        Sanctum::actingAs($landlord);

        $html = (string) $this->get("/api/leases/{$lease->id}/contract/pdf")->assertOk()->getContent();

        $this->assertStringNotContainsString('SCI Ailleurs', $html);
    }

    public function test_un_contrat_fige_garde_ses_octets(): void
    {
        [$agency, $landlord, $lease] = $this->scaffold();
        app(LeaseSignatureService::class)->freezeRenewal($lease->fresh());
        $frozen = $lease->fresh()->frozenContractBytes();
        $this->assertNotNull($frozen);

        $this->becomeCompany($agency, $landlord, 'SCI Baobab');
        Sanctum::actingAs($landlord);

        $served = (string) $this->get("/api/leases/{$lease->id}/contract/pdf")->assertOk()->getContent();
        $this->assertSame($frozen, $served);
        $this->assertStringNotContainsString('SCI Baobab', $served);
    }

    public function test_un_contrat_fige_apres_coup_porte_la_raison_sociale(): void
    {
        [$agency, $landlord, $lease] = $this->scaffold();
        $this->becomeCompany($agency, $landlord, 'SCI Baobab');
        app(LeaseSignatureService::class)->freezeRenewal($lease->fresh());

        $this->assertStringContainsString('SCI Baobab', (string) $lease->fresh()->frozenContractBytes());
    }

    public function test_le_releve_porte_la_raison_sociale(): void
    {
        [$agency, $landlord] = $this->scaffold();
        $this->becomeCompany($agency, $landlord, 'SCI Baobab');
        Sanctum::actingAs($landlord);

        $this->getJson("/api/owner-statements?period=2026-09&agency_id={$agency->id}")->assertOk()
            ->assertJsonPath('data.landlord.company_name', 'SCI Baobab')
            ->assertJsonPath('data.landlord.name', 'Moussa Fall');

        $html = (string) $this->get("/api/owner-statements/pdf?period=2026-09&agency_id={$agency->id}")->assertOk()->getContent();
        $this->assertMatchesRegularExpression('/SCI Baobab.*Moussa Fall/s', $html);
    }

    public function test_le_releve_d_un_particulier_n_a_pas_de_raison_sociale(): void
    {
        [$agency, $landlord] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->getJson("/api/owner-statements?period=2026-09&agency_id={$agency->id}")->assertOk()
            ->assertJsonPath('data.landlord.company_name', null);
    }

    public function test_l_etat_des_lieux_signe_imprime_la_raison_sociale_de_la_seconde_signature(): void
    {
        [$agency, $landlord, $lease, $tenantUser] = $this->scaffold();
        $this->becomeCompany($agency, $landlord, 'SCI Baobab');
        $inventory = $this->signedInventory($lease, $landlord, $tenantUser);

        // Renommée après la signature : l'acte garde la raison sociale du jour où il a été signé.
        $this->becomeCompany($agency, $landlord, 'SCI Renommée');
        Sanctum::actingAs($landlord);
        $html = (string) $this->get("/api/inventories/{$inventory->id}/pdf")->assertOk()->getContent();

        $this->assertMatchesRegularExpression('/Bailleur.*SCI Baobab.*Moussa Fall/s', $html);
        $this->assertStringNotContainsString('SCI Renommée', $html);
    }

    public function test_un_etat_des_lieux_fige_sans_bailleur_n_en_imprime_pas(): void
    {
        [$agency, $landlord, $lease, $tenantUser] = $this->scaffold();
        $inventory = $this->signedInventory($lease, $landlord, $tenantUser);
        // Signé avant TCK-2315 : l'instantané lisait `property->user`, toujours nul, et ne portait
        // pas de raison sociale.
        $metadata = (array) $inventory->fresh()->metadata;
        $metadata[PrintedIdentity::KEY]['landlord'] = null;
        unset($metadata[PrintedIdentity::KEY][PrintedIdentity::LANDLORD_COMPANY]);
        Inventory::query()->whereKey($inventory->id)->update(['metadata' => json_encode($metadata)]);

        $this->becomeCompany($agency, $landlord, 'SCI Baobab');
        Sanctum::actingAs($landlord);
        $html = (string) $this->get("/api/inventories/{$inventory->id}/pdf")->assertOk()->getContent();

        $this->assertStringNotContainsString('SCI Baobab', $html);
        $this->assertStringNotContainsString('Moussa Fall', $html);
    }

    private function signedInventory(Lease $lease, User $landlord, User $tenantUser): Inventory
    {
        $inventory = Inventory::factory()->pendingSignature()->create([
            'lease_id' => $lease->id, 'property_id' => $lease->property_id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $landlord->id,
        ]);
        Sanctum::actingAs($landlord);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE])->assertOk();
        Sanctum::actingAs($tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'tenant', 'signature' => self::SIGNATURE])->assertOk();

        return $inventory;
    }

    private function becomeCompany(Agency $agency, User $landlord, string $companyName): void
    {
        $profile = OwnerProfile::query()->firstOrCreate(['user_id' => $landlord->id, 'agency_id' => $agency->id], ['status' => 'active']);
        $profile->forceFill(['metadata' => ['owner_type' => 'company', 'company_name' => $companyName]])->save();
    }

    /** @return array{0: Agency, 1: User, 2: Lease, 3: User} */
    private function scaffold(): array
    {
        $agency = Agency::factory()->create(['is_verified' => true]);
        $landlord = User::factory()->withOwnerProfile($agency)->create(['first_name' => 'Moussa', 'last_name' => 'Fall']);
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->active()->create([
            'property_id' => $property->id, 'landlord_id' => $landlord->id, 'tenant_id' => $tenant->id, 'agency_id' => $agency->id,
            'early_termination_penalty_months' => 2, 'rent_review_max_pct' => 10,
        ]);

        return [$agency, $landlord, $lease, $tenantUser];
    }
}
