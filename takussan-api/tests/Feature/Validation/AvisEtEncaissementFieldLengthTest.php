<?php

namespace Tests\Feature\Validation;

use App\Models\Agency;
use App\Models\Review;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-1112 (P91.08) — `reviews.title`, `lease_payments.transaction_id` et
 * `booking_payments.transaction_id` sont des `varchar(255)`. Le titre d'un avis d'agence ou de bien
 * et la référence d'un encaissement manuel y sont bornés : au-delà, 422 sur la clé, et non le 500
 * de PostgreSQL (22001). À la borne, l'écriture passe.
 *
 * TCK-3015 (ADR-0140 § 4) — la borne de CHAQUE voie est tenue par le recensement
 * `Validation\BornesMaxFaceAuSchemaTest` ; ce fichier n'en garde qu'un témoin HTTP, la preuve que la requête
 * bornée est bien celle que la route reçoit.
 */
class AvisEtEncaissementFieldLengthTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_titre_d_un_avis_d_agence(): void
    {
        $this->apiActingAsRole('super_admin');
        $agency = Agency::factory()->create();

        $this->postJson("/api/agencies/{$agency->id}/reviews", ['rating' => 4, 'title' => str_repeat('a', 256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('title');
        $this->assertSame(0, Review::query()->count());

        $this->postJson("/api/agencies/{$agency->id}/reviews", ['rating' => 4, 'title' => str_repeat('a', 255)])
            ->assertCreated();
    }
}
