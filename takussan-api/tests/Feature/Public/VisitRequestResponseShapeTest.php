<?php

namespace Tests\Feature\Public;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-967 (P45.04) — `PropertyVisitResource::make($visit)->toArray($request)` sautait `resolve()`,
 * donc `filter()` : les relations non chargées (`property`, `visitor`, `agent`, `customer`)
 * sortaient en `{}` au lieu d'être omises, comme le veut `whenLoaded()`.
 */
class VisitRequestResponseShapeTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_une_relation_non_chargee_est_omise_et_non_rendue_en_objet_vide(): void
    {
        $bien = $this->bienDe($this->agence());
        Sanctum::actingAs($this->client());

        $reponse = $this->postJson("/api/public/properties/{$bien->slug}/visit-request", [
            'scheduled_at' => $this->creneau(),
        ])->assertCreated();

        foreach (['property', 'visitor', 'agent', 'customer'] as $cle) {
            $reponse->assertJsonMissingPath("data.{$cle}");
        }
        $this->assertStringNotContainsString(':{}', $reponse->getContent());
    }
}
