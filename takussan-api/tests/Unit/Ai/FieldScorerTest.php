<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\Evaluation\FieldScorer;
use PHPUnit\Framework\TestCase;

/** TCK-2384 — un score par champ : exact (insensible à la casse), nombre à tolérance, liste. */
class FieldScorerTest extends TestCase
{
    public function test_each_field_type_is_scored_on_its_own_rule(): void
    {
        $scores = (new FieldScorer)->score(
            ['titre' => 'Villa F4', 'prix' => 100_000_000, 'surface' => 450, 'equipements' => ['piscine', 'garage'], 'quartier' => 'Ngor'],
            ['titre' => ' villa f4 ', 'prix' => 104_000_000, 'surface' => 400, 'equipements' => ['Garage', 'clim']],
            ['prix' => ['type' => 'number', 'tolerance' => 0.05]],
        );

        $this->assertSame(1.0, $scores['titre']);
        $this->assertSame(1.0, $scores['prix']);
        $this->assertSame(0.0, $scores['surface']);
        $this->assertSame(round(1 / 3, 4), $scores['equipements']);
        $this->assertSame(0.0, $scores['quartier']);
    }

    public function test_a_text_field_ignores_every_blank_but_not_the_punctuation(): void
    {
        $scorer = new FieldScorer;
        $text = ['prix' => ['type' => 'text']];

        // Espaces, insécables (U+00A0, U+202F) et casse ne comptent pas ; un point ou une barre si.
        $this->assertSame(['prix' => 1.0], $scorer->score(['prix' => '35 000 000 FCFA'], ['prix' => "35\u{00A0}000\u{202F}000 fcfa"], $text));
        $this->assertSame(['prix' => 1.0], $scorer->score(['prix' => '450.000f/mois'], ['prix' => '450.000 f / mois'], $text));
        $this->assertSame(['prix' => 0.0], $scorer->score(['prix' => '450.000f/mois'], ['prix' => '450000f/mois'], $text));
        $this->assertSame(['prix' => 0.0], $scorer->score(['prix' => '450.000f/mois'], ['prix' => null], $text));
        $this->assertSame(['prix' => 1.0], $scorer->score(['prix' => null], ['prix' => null], $text));
        // Le type `exact` reste strict sur les blancs intérieurs.
        $this->assertSame(['prix' => 0.0], $scorer->score(['prix' => '450.000f/mois'], ['prix' => '450.000 f / mois']));
    }

    public function test_two_empty_lists_agree(): void
    {
        $this->assertSame(['equipements' => 1.0], (new FieldScorer)->score(['equipements' => []], ['equipements' => []]));
    }

    public function test_a_list_of_objects_is_compared_element_by_element_whatever_the_key_order(): void
    {
        $voulu = [['nom' => 'Salon', 'surface' => 30], ['nom' => 'Chambre', 'surface' => 12]];
        $obtenu = [['surface' => 12, 'nom' => ' chambre '], ['nom' => 'Cuisine', 'surface' => 9]];

        $scores = (new FieldScorer)->score(['pieces' => $voulu], ['pieces' => $obtenu]);

        $this->assertSame(round(1 / 3, 4), $scores['pieces']);
        $this->assertSame(1.0, (new FieldScorer)->score(['pieces' => $voulu], ['pieces' => array_reverse($voulu)])['pieces']);
    }

    public function test_a_list_of_scalars_still_scores_the_same_and_ignores_duplicates(): void
    {
        $scores = (new FieldScorer)->score(['tags' => ['a', 'b', 'a']], ['tags' => ['B', 'c']]);

        $this->assertSame(round(1 / 3, 4), $scores['tags']);
    }

    /**
     * TCK-2386 — une sortie structurée champ par champ (`{value, confidence, evidence}`) se note sur
     * sa seule valeur : `path` désigne, dans la sortie, ce qu'un attendu compare.
     */
    public function test_a_path_scores_the_value_nested_in_the_output(): void
    {
        $sortie = [
            'price' => ['value' => '1M5', 'confidence' => 'high', 'evidence' => '1M5'],
            'bedrooms' => ['value' => 3, 'confidence' => 'medium', 'evidence' => 'F4'],
            'amenities' => ['value' => ['Piscine', 'gardien'], 'confidence' => 'high', 'evidence' => 'piscine, gardien'],
        ];

        $scores = (new FieldScorer)->score(
            ['price' => '1m5', 'bedrooms' => 3, 'amenities' => ['piscine', 'gardien']],
            $sortie,
            [
                'price' => ['type' => 'exact', 'path' => 'price.value'],
                'bedrooms' => ['type' => 'number', 'path' => 'bedrooms.value'],
                'amenities' => ['type' => 'list', 'path' => 'amenities.value'],
            ],
        );

        $this->assertSame(['price' => 1.0, 'bedrooms' => 1.0, 'amenities' => 1.0], $scores);
        // Sans `path`, l'objet entier est comparé : la valeur seule ne suffit plus.
        $this->assertSame(0.0, (new FieldScorer)->score(['price' => '1M5'], $sortie)['price']);
    }

    /** TCK-2386 — un nombre attendu nul : la sortie qui ne l'invente pas a juste, celle qui l'invente a faux. */
    public function test_a_null_expected_number_is_right_only_when_the_output_is_null_too(): void
    {
        $champs = ['surface' => ['type' => 'number', 'tolerance' => 0.05]];

        $this->assertSame(1.0, (new FieldScorer)->score(['surface' => null], ['surface' => null], $champs)['surface']);
        $this->assertSame(1.0, (new FieldScorer)->score(['surface' => null], [], $champs)['surface']);
        $this->assertSame(0.0, (new FieldScorer)->score(['surface' => null], ['surface' => 120], $champs)['surface']);
        $this->assertSame(0.0, (new FieldScorer)->score(['surface' => 120], ['surface' => null], $champs)['surface']);
    }
}
