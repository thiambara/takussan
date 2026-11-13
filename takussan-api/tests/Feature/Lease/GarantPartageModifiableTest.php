<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\IdType;
use App\Models\Enums\LeaseStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-2762 — le garant se modifie depuis la fiche du bail.
 *
 * - `GET /api/leases/{id}/guarantors` dit, ligne par ligne, si le lecteur peut modifier le garant
 *   (`can_edit`, la policy du GARANT) ; sur une ligne modifiable seulement, si une pièce est
 *   renseignée (`id_on_file`) et combien de baux le portent (`leases_count`). Jamais le numéro.
 * - `PUT /api/guarantors/{id}` défige le contrat de chaque bail en attente de signature qui le porte
 *   quand ce que le contrat imprime change (nom, adresse, téléphone) — et pas autrement.
 */
class GarantPartageModifiableTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $locataire;

    private function bail(array $attributs = []): Lease
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);

        return Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->locataire->id])->id,
            'agency_id' => $this->agency->id,
            ...$attributs,
        ]);
    }

    private function enAttenteDeSignature(Lease $lease): Lease
    {
        $lease->forceFill(['status' => LeaseStatus::PendingSignature, 'contract_sha256' => str_repeat('a', 64), 'signature_requested_at' => now()])->saveQuietly();

        return $lease;
    }

    private function garant(array $attributs = []): Guarantor
    {
        return Guarantor::factory()->create(['agency_id' => $this->agency->id, ...$attributs]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->locataire = User::factory()->create();
    }

    public function test_le_personnel_lit_can_edit_la_piece_renseignee_et_le_nombre_de_baux(): void
    {
        $bail = $this->bail();
        $avecPiece = $this->garant(['id_type' => IdType::IdCard, 'id_number' => '1234567890123']);
        $sansPiece = $this->garant(['id_type' => null, 'id_number' => null]);
        $bail->guarantors()->attach([$avecPiece->id, $sansPiece->id]);
        $this->bail()->guarantors()->attach($avecPiece->id);

        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $lignes = collect($this->apiGet("/api/leases/{$bail->id}/guarantors")->assertOk()->json('data'))->keyBy('id');

        $this->assertTrue($lignes[$avecPiece->id]['can_edit']);
        $this->assertTrue($lignes[$avecPiece->id]['id_on_file']);
        $this->assertSame(2, $lignes[$avecPiece->id]['leases_count']);
        $this->assertFalse($lignes[$sansPiece->id]['id_on_file']);
        $this->assertSame(1, $lignes[$sansPiece->id]['leases_count']);
        $this->assertStringNotContainsString('1234567890123', $this->apiGet("/api/leases/{$bail->id}/guarantors")->getContent());
        $this->assertStringNotContainsString('id_number', $this->apiGet("/api/leases/{$bail->id}/guarantors")->getContent());
    }

    public function test_le_locataire_voit_son_garant_sans_can_edit_ni_piece_ni_nombre_de_baux(): void
    {
        $bail = $this->bail();
        $bail->guarantors()->attach($this->garant(['id_type' => IdType::IdCard, 'id_number' => '1234567890123'])->id);

        Sanctum::actingAs($this->locataire);
        $ligne = $this->apiGet("/api/leases/{$bail->id}/guarantors")->assertOk()->json('data.0');

        $this->assertFalse($ligne['can_edit']);
        $this->assertArrayNotHasKey('id_on_file', $ligne);
        $this->assertArrayNotHasKey('leases_count', $ligne);
    }

    public function test_changer_le_nom_defige_chaque_bail_en_attente_qui_le_porte_et_pas_les_autres(): void
    {
        $garant = $this->garant();
        $enAttente = $this->enAttenteDeSignature($this->bail());
        $autreEnAttente = $this->enAttenteDeSignature($this->bail());
        $actif = $this->bail(['status' => LeaseStatus::Active, 'contract_sha256' => str_repeat('b', 64)]);
        $sansLui = $this->enAttenteDeSignature($this->bail());
        foreach ([$enAttente, $autreEnAttente, $actif] as $bail) {
            $bail->guarantors()->attach($garant->id);
        }

        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->putJson("/api/guarantors/{$garant->id}", ['last_name' => 'Seck'])->assertOk();

        $this->assertNull($enAttente->fresh()->contract_sha256);
        $this->assertNull($autreEnAttente->fresh()->contract_sha256);
        $this->assertNotNull($actif->fresh()->contract_sha256, 'un bail signé garde son contrat');
        $this->assertNotNull($sansLui->fresh()->contract_sha256, 'un bail qui ne le porte pas n’est pas touché');
    }

    public function test_une_colonne_que_le_contrat_n_imprime_pas_ne_defige_rien(): void
    {
        $garant = $this->garant();
        $enAttente = $this->enAttenteDeSignature($this->bail());
        $enAttente->guarantors()->attach($garant->id);

        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->putJson("/api/guarantors/{$garant->id}", ['notes' => 'Rappeler après 18 h', 'occupation' => 'Comptable'])->assertOk();

        $this->assertNotNull($enAttente->fresh()->contract_sha256);
    }

    public function test_une_modification_sans_revenu_ni_piece_les_garde(): void
    {
        $garant = $this->garant(['id_type' => IdType::Passport, 'id_number' => 'A1234567', 'monthly_income' => 850000]);

        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->putJson("/api/guarantors/{$garant->id}", ['first_name' => 'Ousmane'])->assertOk();

        $relu = $garant->fresh();
        $this->assertSame('Ousmane', $relu->first_name);
        $this->assertSame('A1234567', $relu->id_number);
        $this->assertEquals(850000, $relu->monthly_income);
    }

    public function test_les_baux_sont_verrouilles_avant_l_ecriture_du_garant(): void
    {
        $garant = $this->garant();
        $this->enAttenteDeSignature($this->bail())->guarantors()->attach($garant->id);
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $requetes = [];
        DB::listen(function ($q) use (&$requetes): void {
            $requetes[] = strtolower($q->sql);
        });
        $this->putJson("/api/guarantors/{$garant->id}", ['last_name' => 'Seck'])->assertOk();

        $verrou = collect($requetes)->search(fn (string $sql) => str_contains($sql, 'from "leases"') && str_contains($sql, 'for update'));
        $ecriture = collect($requetes)->search(fn (string $sql) => str_starts_with($sql, 'update "guarantors"'));
        $this->assertIsInt($verrou, 'les baux en attente sont verrouillés');
        $this->assertIsInt($ecriture);
        $this->assertLessThan($ecriture, $verrou, 'le bail d’abord, puis le garant (piège n° 10)');
    }
}
