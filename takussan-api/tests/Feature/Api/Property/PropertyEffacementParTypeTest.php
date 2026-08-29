<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-469 — l'effacement d'une valeur devenue non pertinente atteint-il la BASE ?
 *
 * ⚠ **Pourquoi ce fichier existe, et pourquoi il est côté API.** TCK-469 est un ticket front :
 * ses tests prouvent que le payload PORTE `null` quand un bien change de type. Aucun d'eux ne
 * prouve que Laravel l'ÉCRIT. L'agent qui l'a implémenté a conclu « aucun changement backend
 * nécessaire » en lisant `UpdatePropertyRequest` (dix clés `nullable`), les colonnes, le
 * `$fillable` et le `fill($data)->save()` — c'est-à-dire **par lecture de configuration**.
 *
 * Le raisonnement était juste. Il n'était pas mesuré, et *le dépôt interdit de déduire l'état
 * d'un environnement de la configuration qui le vise.* Ce fichier prend la mesure.
 *
 * ⚠⚠ Le troisième cas est le plus important des trois, et l'ablation a montré qu'il gardait plus
 * que prévu : `furnished` **ne s'efface pas par `null`**.
 * `UpdatePropertyRequest:51` la déclare `['sometimes', 'boolean']` — SANS `nullable` — et la
 * colonne est `boolean NOT NULL DEFAULT false`. Un `null` y produit un 422, pas un effacement.
 * C'est l'unique exception parmi les onze clés purgées, celle qu'un correctif uniforme aurait
 * écrasée.
 *
 * **Ce que l'ablation a rendu, et qui n'était pas anticipé.** En ajoutant `nullable` à la règle
 * (md5 `4dc7dc04` → `6c5108d5`), le test ne rougit pas sur un 422 devenu 200 : il rougit sur
 *
 *     SQLSTATE[23502] null value in column "furnished" violates not-null constraint
 *
 * — c'est-à-dire un **500**, la requête ayant traversé la validation pour mourir sur la contrainte
 * PostgreSQL. La règle `['sometimes', 'boolean']` n'est donc pas une omission de `nullable` : c'est
 * ce qui transforme une panne serveur en refus lisible. *Un correctif d'« harmonisation » qui
 * l'ajouterait ne rendrait pas le champ effaçable — il rendrait l'API 500.*
 *
 * Restauré et revérifié : md5 `4dc7dc04`, trois verts.
 */
class PropertyEffacementParTypeTest extends TestCase
{
    use RefreshDatabase;

    private function acteur(): User
    {
        $agency = Agency::factory()->create();

        return User::factory()->create(['agency_id' => $agency->id]);
    }

    public function test_les_valeurs_devenues_non_pertinentes_sont_ecrites_a_null_en_base(): void
    {
        $user = $this->acteur();
        $bien = Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $user->agency_id,
            'type' => 'apartment',
            'bedrooms' => 3,
            'bathrooms' => 2,
            'year_built' => 1998,
        ]);

        // Ce que le front émet quand l'appartement devient un terrain.
        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", [
                'type' => 'land',
                'bedrooms' => null,
                'bathrooms' => null,
                'year_built' => null,
            ])
            ->assertOk();

        // La colonne, pas la réponse : une ressource peut taire un champ qu'elle n'a pas effacé.
        $this->assertDatabaseHas('properties', [
            'id' => $bien->id,
            'bedrooms' => null,
            'bathrooms' => null,
            'year_built' => null,
        ]);
    }

    public function test_les_valeurs_encore_pertinentes_traversent_intactes(): void
    {
        $user = $this->acteur();
        $bien = Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $user->agency_id,
            'type' => 'apartment',
            'bedrooms' => 3,
            'area' => 85,
            'price' => 42_000_000,
        ]);

        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", ['type' => 'land', 'bedrooms' => null])
            ->assertOk();

        // Sans ce témoin, « tout effacer » cocherait le premier test.
        $bien->refresh();
        $this->assertNull($bien->bedrooms);
        $this->assertSame(85.0, (float) $bien->area);
        $this->assertSame(42_000_000.0, (float) $bien->price);
    }

    public function test_furnished_ne_s_efface_pas_par_null_et_c_est_pour_cela_qu_il_s_efface_par_false(): void
    {
        $user = $this->acteur();
        $bien = Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $user->agency_id,
            'type' => 'apartment',
            'furnished' => true,
        ]);

        // Le geste que TCK-469 s'interdit, et la raison de cet interdit.
        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", ['type' => 'land', 'furnished' => null])
            ->assertStatus(422);

        $this->assertTrue($bien->refresh()->furnished);

        // Le geste que TCK-469 fait à la place.
        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", ['type' => 'land', 'furnished' => false])
            ->assertOk();

        $this->assertFalse($bien->refresh()->furnished);
    }
}
