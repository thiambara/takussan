<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Tests\TestCase;

/**
 * Un filtre exact sur une colonne d'identifiant (`id`, `*_id`) refuse en 400 une valeur non
 * entière (`App\Http\Filters\ExactIdentifierFilter`).
 *
 * Relevé le 2026-09-24, vérification de TCK-576 : `filter[property_id]=abc` rendait 500 sur
 * `/api/leases`, `/api/properties`, `/api/invoices`, `/api/maintenance-requests` — PostgreSQL
 * refuse la conversion (`SQLSTATE[22P02]`), et la réponse accusait le serveur d'une requête
 * fautive du client.
 */
class FiltreIdentifiantTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string}> */
    public static function valeursInvalides(): array
    {
        return [
            'texte' => ['abc'],
            'négatif' => ['-1'],
            'décimal' => ['1.5'],
            'trop grand pour un bigint' => ['99999999999999999999'],
            'liste dont un élément est invalide' => ['1,abc'],
        ];
    }

    #[DataProvider('valeursInvalides')]
    public function test_une_valeur_non_entiere_est_refusee_en_400(string $valeur): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs(User::factory()->withAgentProfile($agency)->create());

        $this->getJson('/api/properties?filter[user_id]='.urlencode($valeur))
            ->assertStatus(400)
            ->assertJsonPath('message', 'Filter value for `user_id` must be an integer identifier.');
    }

    public function test_un_identifiant_entier_filtre_toujours_seul_ou_en_liste(): void
    {
        $agency = Agency::factory()->create();
        $moi = User::factory()->withAgentProfile($agency)->create();
        $collegue = User::factory()->withAgentProfile($agency)->create();
        $tiers = User::factory()->withAgentProfile($agency)->create();
        $mien = Property::factory()->create(['user_id' => $moi->id, 'agency_id' => $agency->id]);
        $sien = Property::factory()->create(['user_id' => $collegue->id, 'agency_id' => $agency->id]);
        Property::factory()->create(['user_id' => $tiers->id, 'agency_id' => $agency->id]);
        Sanctum::actingAs($moi);

        $this->getJson('/api/properties?filter[user_id]='.$moi->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $mien->id);

        $ids = collect($this->getJson("/api/properties?filter[user_id]={$moi->id},{$collegue->id}")
            ->assertOk()
            ->json('data'))->pluck('id')->sort()->values()->all();
        $this->assertSame(collect([$mien->id, $sien->id])->sort()->values()->all(), $ids);
    }

    public function test_la_regle_couvre_tout_filtre_exact_d_identifiant_declare_par_un_modele(): void
    {
        // `users.added_by_id` : un `*_id` déclaré par `User::$requestFilterable`, sans route dédiée.
        $request = Request::create('/', 'GET', ['filter' => ['added_by_id' => 'abc']]);

        $this->expectException(BadRequestHttpException::class);
        User::buildQuery(request: $request)->get();
    }
}
