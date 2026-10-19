<?php

namespace Tests\Unit\Search;

use App\Support\Search\ReglagesDIndex;
use PHPUnit\Framework\TestCase;

/**
 * TCK-995 (P52.02, P52.04) — ce qu'on envoie à un index, et ce qui sépare le déclaré du relu.
 */
class ReglagesDIndexTest extends TestCase
{
    public function test_un_reglage_porte_par_l_index_et_plus_declare_part_a_null(): void
    {
        $envoi = ReglagesDIndex::aEnvoyer(
            ['filterableAttributes' => ['a'], 'pagination' => ['maxTotalHits' => 5000]],
            ['filterableAttributes' => ['b'], 'pagination' => ['maxTotalHits' => 1000], 'typoTolerance' => ['enabled' => false]],
        );

        $this->assertSame(
            ['filterableAttributes' => ['a'], 'pagination' => ['maxTotalHits' => 5000], 'typoTolerance' => null],
            $envoi,
        );
    }

    public function test_un_index_absent_recoit_le_declare_seul(): void
    {
        $this->assertSame(['sortableAttributes' => ['price']], ReglagesDIndex::aEnvoyer(['sortableAttributes' => ['price']], []));
    }

    public function test_les_attributs_filtrables_se_comparent_sans_ordre(): void
    {
        $this->assertSame([], ReglagesDIndex::ecarts(
            ['filterableAttributes' => ['type', 'agency_id', '_geo']],
            ['filterableAttributes' => ['_geo', 'agency_id', 'type']],
        ));
    }

    public function test_un_attribut_filtrable_manquant_est_un_ecart(): void
    {
        $ecarts = ReglagesDIndex::ecarts(
            ['filterableAttributes' => ['type', 'ranked_at']],
            ['filterableAttributes' => ['type']],
        );

        $this->assertCount(1, $ecarts);
        $this->assertStringContainsString('filterableAttributes', $ecarts[0]);
        $this->assertStringContainsString('ranked_at', $ecarts[0]);
    }

    public function test_l_ordre_des_attributs_cherchables_est_une_regle_de_classement(): void
    {
        $this->assertCount(1, ReglagesDIndex::ecarts(
            ['searchableAttributes' => ['title', 'description']],
            ['searchableAttributes' => ['description', 'title']],
        ));
    }

    public function test_un_objet_relu_peut_porter_des_cles_que_la_configuration_ne_declare_pas(): void
    {
        $this->assertSame([], ReglagesDIndex::ecarts(
            ['pagination' => ['maxTotalHits' => 5000]],
            ['pagination' => ['maxTotalHits' => 5000, 'autre' => 1]],
        ));
        $this->assertCount(1, ReglagesDIndex::ecarts(
            ['pagination' => ['maxTotalHits' => 5000]],
            ['pagination' => ['maxTotalHits' => 1000]],
        ));
    }

    public function test_un_reglage_declare_absent_du_relu_est_un_ecart(): void
    {
        $this->assertCount(1, ReglagesDIndex::ecarts(['rankingRules' => ['sort', 'words']], []));
    }

    public function test_un_mot_rendu_en_forme_decomposee_concorde(): void
    {
        $this->assertSame([], ReglagesDIndex::ecarts(
            ['stopWords' => ["\u{00E0}", 'de']],
            ['stopWords' => ['de', "a\u{0300}"]],
        ));
    }
}
