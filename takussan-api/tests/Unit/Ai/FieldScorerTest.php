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

    public function test_two_empty_lists_agree(): void
    {
        $this->assertSame(['equipements' => 1.0], (new FieldScorer)->score(['equipements' => []], ['equipements' => []]));
    }
}
