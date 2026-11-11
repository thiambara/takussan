<?php

namespace Tests\Feature\Reviews;

use App\Models\Review;
use App\Services\Review\ReviewRiskClassifier;
use Tests\TestCase;

/**
 * TCK-2672 — la règle du risque, seule : note de 3 ou moins, un signalement, des coordonnées.
 */
class ReviewRiskClassifierTest extends TestCase
{
    /** @param  array<string, mixed>  $attributes */
    private function classify(array $attributes): array
    {
        return app(ReviewRiskClassifier::class)->classify(new Review($attributes + ['reported_count' => 0]));
    }

    public function test_ac1_cinq_etoiles_avec_un_numero_est_a_risque(): void
    {
        $this->assertSame(
            ['level' => 'high', 'reasons' => ['contact_details']],
            $this->classify(['rating' => 5, 'content' => 'Super séjour, appelez-moi au 77 418 90 22']),
        );
    }

    public function test_ac1_quatre_etoiles_sans_signalement_ni_coordonnees_est_sans_risque(): void
    {
        $this->assertSame(
            ['level' => 'low', 'reasons' => []],
            $this->classify(['rating' => 4, 'content' => 'Appartement propre et calme.']),
        );
    }

    public function test_la_borne_de_la_note(): void
    {
        $this->assertSame(['low_rating'], $this->classify(['rating' => 3, 'content' => 'Moyen.'])['reasons']);
        $this->assertSame('low', $this->classify(['rating' => 4, 'content' => 'Bien.'])['level']);
    }

    public function test_un_signalement_suffit(): void
    {
        $this->assertSame(['reported'], $this->classify(['rating' => 5, 'content' => 'Bien.', 'reported_count' => 1])['reasons']);
    }

    public function test_le_titre_compte_aussi_et_les_raisons_s_additionnent(): void
    {
        $this->assertSame(
            ['level' => 'high', 'reasons' => ['low_rating', 'reported', 'contact_details']],
            $this->classify(['rating' => 1, 'title' => 'écrivez à moi@exemple.sn', 'content' => 'Nul.', 'reported_count' => 2]),
        );
    }
}
