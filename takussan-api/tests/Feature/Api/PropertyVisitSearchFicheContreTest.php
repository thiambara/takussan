<?php

namespace Tests\Feature\Api;

use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2587 — contre-vérification de la recherche par la fiche client et de la borne d'« À clore »
 * (d0ed42e51). Quatre propriétés que `PropertyVisitSearchFilterTest` et `PropertyVisitCountsTest`
 * ne gardaient pas — chacune vérifiée par ablation, rouge ici et verte là-bas :
 *
 *   · le repli de casse ICU sur une majuscule ACCENTUÉE EN BASE : un `LOWER(col)` nu, sous
 *     `--locale=C`, rend « nDIAYÉ » et ne trouve plus « ndiayé » (ADR-0025) ;
 *   · le super-admin cherche la fiche de toutes les agences (`PropertyVisit`, `$toutVoir`) ;
 *   · le super-admin a « À clore » sur toutes les agences, au compte comme dans la liste
 *     (`PropertyVisitController::closableBound`) ;
 *   · le compte d'« À clore » écarte le bien supprimé, comme le filtre de liste (`whereHas`
 *     sur un modèle à `SoftDeletes`) : le compte et la liste concordent.
 */
class PropertyVisitSearchFicheContreTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** @return list<int> */
    private function ids(User $user, array $filter): array
    {
        Sanctum::actingAs($user);

        return collect($this->getJson('/api/property-visits?'.http_build_query(['filter' => $filter, 'per_page' => 100]))->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
    }

    /** @return array{0: int, 1: int} le compte d'« À clore » et le total de la liste `filter[to_close]=1` */
    private function aClore(User $user): array
    {
        Sanctum::actingAs($user);

        return [
            $this->getJson('/api/property-visits/counts')->assertOk()->json('data.to_close'),
            $this->getJson('/api/property-visits?filter[to_close]=1')->assertOk()->json('meta.total'),
        ];
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'super_admin');

        return $user->fresh();
    }

    /** @return array{0: PropertyVisit, 1: PropertyVisit} une visite confirmée passée, à fiche, dans chacune de deux agences */
    private function deuxAgences(): array
    {
        $visites = [];
        foreach ([$this->agence(), $this->agence()] as $agence) {
            $visites[] = PropertyVisit::factory()->create([
                'property_id' => $this->bienDe($agence)->id, 'visitor_id' => null,
                'visitor_name' => null, 'visitor_phone' => null,
                'customer_id' => $this->ficheClient($agence, null, ['first_name' => 'Mariama', 'last_name' => 'Ndiayé'])->id,
                'status' => VisitStatus::Confirmed, 'scheduled_at' => CarbonImmutable::now()->subHours(5),
            ]);
        }

        return $visites;
    }

    public function test_le_repli_de_casse_vaut_pour_une_majuscule_accentuee_en_base(): void
    {
        $x = $this->agence();
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($x)->id, 'visitor_id' => null,
            'visitor_name' => null, 'visitor_phone' => null,
            'customer_id' => $this->ficheClient($x, null, ['first_name' => 'ÉLODIE', 'last_name' => 'NDIAYÉ'])->id,
        ]);
        $agent = $this->personnel($x);

        $this->assertSame([$visite->id], $this->ids($agent, ['search' => 'ndiayé']));
        $this->assertSame([$visite->id], $this->ids($agent, ['search' => 'élodie ndi']));
        // Les accents ne sont pas repliés, par choix (ADR-0025) : « ndiaye » n'est pas « NDIAYÉ ».
        $this->assertSame([], $this->ids($agent, ['search' => 'ndiaye']));
    }

    public function test_le_super_admin_cherche_la_fiche_dans_toutes_les_agences(): void
    {
        [$deX, $deY] = $this->deuxAgences();
        $superAdmin = $this->superAdmin();

        $this->assertSame([$deX->id, $deY->id], $this->ids($superAdmin, ['search' => 'Mariama']));
        $this->assertSame([$deX->id, $deY->id], $this->ids($superAdmin, ['search' => 'ndiayé mariama']));
    }

    public function test_le_super_admin_a_a_clore_dans_toutes_les_agences(): void
    {
        $this->deuxAgences();

        $this->assertSame([2, 2], $this->aClore($this->superAdmin()));
    }

    public function test_le_compte_a_clore_ecarte_le_bien_supprime_comme_la_liste(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        // L'agent est VISITEUR d'un bien de son agence : la visite reste dans sa portée après la
        // suppression du bien, et c'est la borne d'« À clore » seule qui doit l'écarter.
        $bien = $this->bienDe($x);
        PropertyVisit::factory()->create([
            'property_id' => $bien->id, 'visitor_id' => $agent->id, 'agent_id' => null,
            'status' => VisitStatus::Confirmed, 'scheduled_at' => CarbonImmutable::now()->subHours(5),
        ]);
        $this->assertSame([1, 1], $this->aClore($agent), 'avant la suppression : à clore');

        $bien->delete();

        $this->assertSame([0, 0], $this->aClore($agent));
        Sanctum::actingAs($agent);
        $this->assertSame(1, $this->getJson('/api/property-visits/counts')->json('data.all'), 'la visite reste dans la portée');
    }
}
