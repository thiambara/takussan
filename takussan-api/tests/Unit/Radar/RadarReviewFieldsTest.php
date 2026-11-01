<?php

namespace Tests\Unit\Radar;

use App\Services\Radar\RadarReviewFields;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/** TCK-2387 (ADR-0077 §5, §9) — les champs que l'opérateur relit, et donc ce que décide la suggestion. */
class RadarReviewFieldsTest extends TestCase
{
    /** @return array<string, mixed> Une sortie normalisée, de la forme d'`ExtractionNormalizer`. */
    private static function extracted(): array
    {
        $champ = fn (mixed $value, array $extra = []) => ['value' => $value, 'confidence' => 'medium', 'evidence' => 'passage', 'flags' => []] + $extra;

        return [
            'property_type' => $champ('apartment'),
            'contract' => $champ('rent'),
            'rent_period' => $champ('monthly'),
            'price' => $champ(450000, ['raw' => '450.000f/mois', 'period' => 'monthly']),
            'neighborhood' => $champ('Liberté 6', ['neighborhood_id' => 42, 'suggestions' => []]),
            'city' => $champ('Dakar'),
            'bedrooms' => ['value' => 30, 'confidence' => 'low', 'evidence' => '30 chambres', 'flags' => ['out_of_bounds']],
            'bathrooms' => $champ(2),
            'surface_m2' => $champ(null),
            'furnished' => $champ(true),
            'amenities' => $champ(['parking']),
            'title' => $champ('Appartement F4'),
            'description' => $champ(null),
            'advertiser_name' => $champ('Moussa'),
            'advertiser_nature' => $champ('probable_owner'),
            'phones' => ['+221771234567'],
            'phones_flags' => [],
            'phones_dropped' => ['+221789998877'],
            'nature_signals' => [],
        ];
    }

    public function test_values_flattens_the_review_fields_with_the_attached_neighborhood_and_the_price_amount(): void
    {
        $values = RadarReviewFields::values(self::extracted());

        $this->assertSame(RadarReviewFields::FIELDS, array_keys($values));
        $this->assertSame(42, $values['neighborhood_id']);
        $this->assertSame('Liberté 6', $values['neighborhood']);
        $this->assertSame(450000, $values['price']);
        $this->assertSame('probable_owner', $values['advertiser_nature']);
        $this->assertNull($values['surface_m2']);
    }

    public function test_values_of_an_extraction_without_a_neighborhood_match_are_null(): void
    {
        $extracted = self::extracted();
        $extracted['neighborhood']['neighborhood_id'] = null;
        unset($extracted['title']);

        $values = RadarReviewFields::values($extracted);

        $this->assertNull($values['neighborhood_id']);
        $this->assertNull($values['title']);
    }

    public function test_no_personal_key_is_a_review_field(): void
    {
        foreach (['phones', 'phones_dropped', 'phones_flags', 'advertiser_name', 'nature_signals'] as $personnelle) {
            $this->assertNotContains($personnelle, RadarReviewFields::FIELDS);
        }
    }

    public function test_editable_is_the_fields_without_the_read_neighborhood_text(): void
    {
        $this->assertSame(
            array_values(array_diff(RadarReviewFields::FIELDS, ['neighborhood'])),
            RadarReviewFields::EDITABLE,
        );
        $this->assertSame(['property_type', 'contract', 'price', 'neighborhood_id'], RadarReviewFields::REQUIRED_FOR_REVIEW);
    }

    public function test_apply_replaces_the_value_marks_it_corrected_and_lifts_the_flags(): void
    {
        $out = RadarReviewFields::apply(self::extracted(), ['bedrooms' => 3, 'price' => 500000]);

        $this->assertSame(3, $out['bedrooms']['value']);
        $this->assertTrue($out['bedrooms']['corrected']);
        $this->assertSame([], $out['bedrooms']['flags']);
        // La confiance et le passage cité restent ceux de la lecture : la fiche les montre « lus par l'IA ».
        $this->assertSame('low', $out['bedrooms']['confidence']);
        $this->assertSame('30 chambres', $out['bedrooms']['evidence']);
        $this->assertSame(500000, $out['price']['value']);
        $this->assertTrue($out['price']['corrected']);
        $this->assertSame('450.000f/mois', $out['price']['raw']);
        // Un champ non corrigé n'est pas touché.
        $this->assertSame(self::extracted()['city'], $out['city']);
    }

    public function test_apply_attaches_a_neighborhood_without_rewriting_the_text_read(): void
    {
        $out = RadarReviewFields::apply(self::extracted(), ['neighborhood_id' => 7]);

        $this->assertSame(7, $out['neighborhood']['neighborhood_id']);
        $this->assertSame('Liberté 6', $out['neighborhood']['value']);
        $this->assertTrue($out['neighborhood']['corrected']);
        $this->assertSame(7, RadarReviewFields::values($out)['neighborhood_id']);
    }

    public function test_apply_can_clear_a_value_and_keeps_the_personal_keys_untouched(): void
    {
        $out = RadarReviewFields::apply(self::extracted(), ['surface_m2' => 80, 'furnished' => null]);

        $this->assertNull($out['furnished']['value']);
        $this->assertTrue($out['furnished']['corrected']);
        $this->assertSame(['+221771234567'], $out['phones']);
        $this->assertSame(['+221789998877'], $out['phones_dropped']);
    }

    public function test_apply_refuses_a_key_that_is_not_editable(): void
    {
        $this->expectException(InvalidArgumentException::class);

        RadarReviewFields::apply(self::extracted(), ['neighborhood' => 'Ailleurs']);
    }
}
