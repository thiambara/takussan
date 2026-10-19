<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-987 (piste P58.02) — sous un sparse fieldset, l'auteur et le finaliseur d'un relevé se
 * chargent si le client sélectionne leur clé.
 *
 * Mesuré avant correctif : `uploaded_by` et `finalized_by` étaient absents de
 * `BankStatement::$queryFields`. `fields[bank_statements]=id,status&include=uploadedBy` rendait
 * `uploaded_by: null` pour un relevé qui a un auteur, et y ajouter `uploaded_by` rendait 400.
 */
class BankStatementSparseFieldsTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_auteur_et_le_finaliseur_se_chargent_sous_un_sparse_fieldset_qui_lit_leur_cle(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $admin->id]);
        BankStatement::factory()->create([
            'agency_id' => $agency->id,
            'uploaded_by' => $admin->id,
            'finalized_by' => $admin->id,
            'finalized_at' => now(),
        ]);

        $response = $this->actingAs($admin)->getJson(
            "/api/agencies/{$agency->id}/bank-statements"
            .'?fields[bank_statements]=id,status,uploaded_by,finalized_by&include=uploadedBy,finalizedBy'
        );

        $response->assertOk();
        $response->assertJsonPath('data.0.uploaded_by.id', $admin->id);
        $response->assertJsonPath('data.0.finalized_by.id', $admin->id);
    }
}
