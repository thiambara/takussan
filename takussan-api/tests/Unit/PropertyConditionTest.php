<?php

namespace Tests\Unit;

use App\Models\Enums\PropertyCondition;
use App\Models\Enums\PropertyType;
use PHPUnit\Framework\TestCase;

/**
 * TCK-508 — l'état DÉCLARÉ d'un bien bâti.
 *
 * Test unitaire pur : l'enum ne lit ni base ni conteneur.
 */
class PropertyConditionTest extends TestCase
{
    public function test_les_valeurs_sont_celles_de_la_spec(): void
    {
        $this->assertSame(
            ['off_plan', 'new', 'renovated', 'good', 'to_renovate'],
            array_map(static fn (PropertyCondition $c): string => $c->value, PropertyCondition::cases()),
        );
    }

    /**
     * La frontière est la famille foncière, écrite en clair : si un type change de
     * famille dans `PropertyLabels::FAMILLES`, ce test dit ce que ça coûte à l'état.
     */
    public function test_seuls_le_terrain_et_la_ferme_n_ont_pas_d_etat(): void
    {
        $sansEtat = array_values(array_filter(
            PropertyType::cases(),
            static fn (PropertyType $type): bool => ! PropertyCondition::appliesTo($type),
        ));

        $this->assertSame([PropertyType::Land, PropertyType::Farm], $sansEtat);
    }

    public function test_applies_to_lit_aussi_la_valeur_brute(): void
    {
        $this->assertFalse(PropertyCondition::appliesTo('land'));
        $this->assertTrue(PropertyCondition::appliesTo('apartment'));
        // Type encore inconnu (assistant à sa première étape) : rien ne justifie d'effacer.
        $this->assertTrue(PropertyCondition::appliesTo(null));
    }

    public function test_seuls_neuf_et_sur_plan_valent_neuf(): void
    {
        $neufs = array_values(array_filter(
            PropertyCondition::cases(),
            static fn (PropertyCondition $c): bool => $c->isNewBuild(),
        ));

        $this->assertSame([PropertyCondition::OffPlan, PropertyCondition::New], $neufs);
    }
}
