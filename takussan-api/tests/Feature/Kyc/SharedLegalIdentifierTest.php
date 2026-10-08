<?php

namespace Tests\Feature\Kyc;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;

/**
 * TCK-601 (AC9, ADR-0044 §5) — un NINEA ou un RIB professionnel déjà porté par une autre agence est
 * signalé au super-admin, sur une forme normalisée qui ne suppose aucun format (D-68 : aucun contrôle
 * de forme). Jamais un refus, jamais lisible de l'admin de l'agence.
 */
class SharedLegalIdentifierTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
        Notification::fake();
    }

    private function approvedRequest(Agency $agency, string $ninea, string $rib): void
    {
        AgencyUpgradeRequest::query()->create([
            'agency_id' => $agency->id,
            'submitted_by' => User::factory()->create()->id,
            'rc' => 'RC-A',
            'ninea' => $ninea,
            'rib_pro' => $rib,
            'company_legal_name' => 'A SARL',
            'address_fiscale' => 'Dakar',
            'status' => AgencyUpgradeRequestStatus::Approved,
            'submitted_at' => now()->subMonth(),
        ]);
    }

    private function submit(Agency $agency, string $ninea, string $rib): int
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        return $this->post("/api/agencies/{$agency->id}/upgrade-requests", [
            'rc' => 'RC-X',
            'ninea' => $ninea,
            'rib_pro' => $rib,
            'company_legal_name' => 'X SARL',
            'address_fiscale' => 'Dakar',
            'statuts_doc' => UploadedFile::fake()->create('statuts.pdf', 200, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
    }

    public function test_un_identifiant_partage_est_signale_au_seul_super_admin(): void
    {
        $a = Agency::factory()->create();
        $this->approvedRequest($a, '00123452g3', 'SN0123456789');
        $b = Agency::factory()->individual()->create();
        $c = Agency::factory()->individual()->create();

        $requestB = $this->submit($b, '0012345 2G3', 'sn 0123 4567 89');
        $requestC = $this->submit($c, '00123452G4', 'SN9999999999');

        // L'admin de B ne lit pas la clé.
        $this->apiActingAsRole('agency_admin', ['agency' => $b]);
        $own = collect($this->apiGet("/api/agencies/{$b->id}/upgrade-requests")->assertOk()->json('data'))->firstWhere('id', $requestB);
        $this->assertArrayNotHasKey('shared_identifiers', $own);

        $this->apiActingAsRole('super_admin');
        $shared = $this->apiGet("/api/admin/agency-upgrade-requests/{$requestB}")->assertOk()->json('data.shared_identifiers');
        $this->assertSame([$a->id], array_column($shared['ninea'], 'id'));
        $this->assertSame([$a->id], array_column($shared['rib_pro'], 'id'));
        $this->assertSame($a->name, $shared['ninea'][0]['name']);

        // Un caractère d'écart : aucun signal.
        $this->apiGet("/api/admin/agency-upgrade-requests/{$requestC}")->assertOk()
            ->assertJsonPath('data.shared_identifiers.ninea', [])
            ->assertJsonPath('data.shared_identifiers.rib_pro', []);

        // Le dossier KYC de B porte le même signal, au super-admin.
        $dossier = KycDossier::query()->create(['subject_type' => Agency::class, 'subject_id' => $b->id, 'status' => KycDossierStatus::Submitted]);
        $this->assertSame([$a->id], array_column($this->apiGet("/api/admin/kyc/{$dossier->id}")->assertOk()->json('data.shared_identifiers.ninea'), 'id'));
    }

    /** D-68 — aucun contrôle de forme : un NINEA `ABC` est accepté. */
    public function test_aucun_controle_de_forme(): void
    {
        $this->submit(Agency::factory()->individual()->create(), 'ABC', 'X');
    }
}
