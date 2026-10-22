<?php

namespace Tests\Feature\Admin;

use App\Models\AgencyUpgradeRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1282 (P150.02) — les dates « Soumise du / au » de `/super-admin/agency-upgrade-requests`
 * partent en `filter[submitted_from]` et `filter[submitted_to]`. Le contrôleur les lisait à la
 * main, puis `buildQuery()` les refusait en 400 : la liste tombait en erreur dès qu'une date était
 * posée.
 */
class AgencyUpgradeRequestSubmittedRangeTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, int> date de soumission → id */
    private array $demandes = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAsRole('super_admin');
        foreach (['2026-01-10', '2026-02-15', '2026-03-20'] as $date) {
            $this->demandes[$date] = AgencyUpgradeRequest::factory()->pending()
                ->create(['submitted_at' => $date.' 14:30:00'])->id;
        }
    }

    public function test_la_periode_bornee_des_deux_cotes_ne_rend_que_ses_demandes(): void
    {
        $ids = $this->getJson('/api/admin/agency-upgrade-requests?filter[submitted_from]=2026-02-15&filter[submitted_to]=2026-03-20')
            ->assertOk()
            ->json('data.*.id');

        $this->assertEqualsCanonicalizing([$this->demandes['2026-02-15'], $this->demandes['2026-03-20']], $ids);
    }

    public function test_la_borne_de_debut_seule(): void
    {
        $ids = $this->getJson('/api/admin/agency-upgrade-requests?filter[submitted_from]=2026-02-16')
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$this->demandes['2026-03-20']], $ids);
    }

    public function test_la_borne_de_fin_seule_avec_le_tri_et_les_relations_de_la_page(): void
    {
        $ids = $this->getJson('/api/admin/agency-upgrade-requests?filter[submitted_to]=2026-02-15&filter[status]=pending&sort=-submitted_at&include=agency,submitter')
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$this->demandes['2026-02-15'], $this->demandes['2026-01-10']], $ids);
    }
}
