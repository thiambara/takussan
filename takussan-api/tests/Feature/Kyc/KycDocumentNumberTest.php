<?php

namespace Tests\Feature\Kyc;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-2669 (ADR-0104 § 2) — une pièce RCCM ou NINEA porte son numéro, saisi avec elle ; il
 * n'écrase jamais les colonnes de l'agence.
 */
class KycDocumentNumberTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'rccm' => 'SN-DKR-2010-A-0001', 'ninea' => '001234567']);
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
    }

    /** @param  array<string, mixed>  $extra */
    private function upload(string $type, array $extra = []): TestResponse
    {
        return $this->post("/api/agencies/{$this->agency->id}/kyc/documents", [
            'document_type' => $type,
            'document' => UploadedFile::fake()->create("{$type}.pdf", 20, 'application/pdf'),
        ] + $extra, ['Accept' => 'application/json']);
    }

    /** @return array<string, mixed>|null */
    private function piece(TestResponse $response, string $type): ?array
    {
        return collect($response->json('data.documents'))->firstWhere('document_type', $type);
    }

    public function test_ac1_le_numero_reste_sur_la_piece_et_l_agence_est_inchangee(): void
    {
        $this->upload('rccm', ['document_number' => 'SN-DKR-2017-B-8841'])->assertCreated();
        $this->upload('ninea', ['document_number' => '009876543'])->assertCreated();

        $dossier = $this->getJson("/api/agencies/{$this->agency->id}/kyc")->assertOk();

        $this->assertSame('SN-DKR-2017-B-8841', $this->piece($dossier, 'rccm')['document_number']);
        $this->assertSame('009876543', $this->piece($dossier, 'ninea')['document_number']);
        $this->agency->refresh();
        $this->assertSame('SN-DKR-2010-A-0001', $this->agency->rccm);
        $this->assertSame('001234567', $this->agency->ninea);
    }

    public function test_une_piece_sans_numero_rend_null(): void
    {
        $response = $this->upload('rccm')->assertCreated();

        $this->assertArrayHasKey('document_number', $this->piece($response, 'rccm'));
        $this->assertNull($this->piece($response, 'rccm')['document_number']);
    }

    public function test_le_numero_est_borne_et_reserve_aux_pieces_numerotees(): void
    {
        $this->upload('rccm', ['document_number' => str_repeat('A', 51)])->assertStatus(422)->assertJsonValidationErrors('document_number');
        $this->upload('director_id', ['document_number' => 'X1', 'expires_at' => now()->addYear()->toDateString()])
            ->assertStatus(422)->assertJsonValidationErrors('document_number');
        $this->upload('rccm', ['document_number' => ['a']])->assertStatus(422)->assertJsonValidationErrors('document_number');
    }
}
