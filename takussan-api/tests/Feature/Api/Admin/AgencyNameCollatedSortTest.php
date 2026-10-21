<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\CreditLotOrigin;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1138 (P87.05) — la liste des agences du super-admin et celle des portefeuilles de crédits
 * trient `name` en `COLLATE "und-x-icu"` (ADR-0025, amendement du 2026-10-19), et départagent par
 * `id` : deux agences de même nom ne changent plus de place d'une requête à l'autre.
 *
 * Avant : `orderBy('name')` nu, sous `--locale=C` — « École … » passait après « Zeta ».
 */
class AgencyNameCollatedSortTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<int> */
    private array $attendu;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAsRole('super_admin');

        $zeta = Agency::factory()->create(['name' => 'Zeta']);
        $teranga1 = Agency::factory()->create(['name' => 'Teranga']);
        $ecole = Agency::factory()->create(['name' => 'École Immo']);
        $teranga2 = Agency::factory()->create(['name' => 'Teranga']);
        $teranga3 = Agency::factory()->create(['name' => 'Teranga']);

        $this->attendu = [$ecole->id, $teranga1->id, $teranga2->id, $teranga3->id, $zeta->id];

        foreach ([$zeta, $teranga1, $ecole, $teranga2, $teranga3] as $agency) {
            app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 10, now()->addDays(30));
        }
    }

    /** @return list<int> */
    private function ids(string $url): array
    {
        $ids = $this->getJson($url)->assertOk()->json('data.*.id');

        return array_values(array_filter($ids, fn (int $id) => in_array($id, $this->attendu, true)));
    }

    public function test_la_liste_des_agences_trie_le_nom_en_icu_et_departage_par_id(): void
    {
        $this->assertSame($this->attendu, $this->ids('/api/admin/agencies?per_page=100&sort=name'));
    }

    public function test_la_liste_des_agences_en_tri_descendant(): void
    {
        $this->assertSame(
            [$this->attendu[4], $this->attendu[1], $this->attendu[2], $this->attendu[3], $this->attendu[0]],
            $this->ids('/api/admin/agencies?per_page=100&sort=-name'),
        );
    }

    public function test_les_portefeuilles_de_credits_trient_le_nom_en_icu_et_departagent_par_id(): void
    {
        $this->assertSame($this->attendu, $this->ids('/api/admin/credit-wallets?per_page=100'));
    }
}
