<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Unit\Architecture\PerPageBorneTest;

/**
 * TCK-654 (piste P02.02) — un `per_page` lu par le contrôleur est plafonné comme celui de
 * `HasQueryBuilder` : borné à 100, son défaut s'il est absent ou invalide.
 *
 * Mesuré le 2026-10-15 avant correctif : `per_page=1000` sur les membres d'agence → 200 et
 * `meta.per_page` = 1000.
 *
 * La garde qui empêche de réécrire la forme non bornée ailleurs est
 * {@see PerPageBorneTest} ; ce test-ci prouve que le plafond agit.
 */
class PerPagePlafondTest extends ApiTestCase
{
    use RefreshDatabase;

    private function membres(): string
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        return "/api/agencies/{$agency->id}/members?fields[users]=id";
    }

    public function test_les_membres_d_agence_plafonnent_per_page_a_100(): void
    {
        $this->getJson($this->membres().'&per_page=1000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    public function test_les_membres_d_agence_honorent_un_per_page_dans_les_bornes(): void
    {
        $this->getJson($this->membres().'&per_page=7')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 7);
    }

    public function test_un_per_page_absent_ou_invalide_rend_le_defaut(): void
    {
        $url = $this->membres();

        foreach (['', '&per_page=abc', '&per_page=0', '&per_page=-3'] as $suffixe) {
            $this->getJson($url.$suffixe)
                ->assertOk()
                ->assertJsonPath('meta.per_page', 20);
        }
    }

    public function test_les_annonces_d_administration_plafonnent_per_page_a_100(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/announcements?per_page=1000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }
}
