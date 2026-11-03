<?php

namespace Tests\Unit\Radar;

use App\Services\Radar\RadarListingTitle;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2389 (décision 5) — le titre d'un bien du Radar quand l'annonce n'en porte pas. Étend `Tests\TestCase` : les noms de type
 * sont ceux de `lang/fr/properties.php`.
 */
class RadarListingTitleTest extends TestCase
{
    /** @return array<string, mixed> */
    private function valeurs(array $surcharge = []): array
    {
        return $surcharge + ['title' => null, 'property_type' => 'apartment', 'contract' => 'rent', 'bedrooms' => 3];
    }

    public function test_le_titre_extrait_reste_prioritaire(): void
    {
        $this->assertSame(
            ['title' => 'Studio à Ouakam', 'built' => false],
            RadarListingTitle::resolve($this->valeurs(['title' => '  Studio à Ouakam ']), 'Almadies'),
        );
    }

    #[DataProvider('titresVides')]
    public function test_un_titre_vide_ou_d_espaces_se_construit(mixed $titre): void
    {
        $this->assertSame(
            ['title' => 'Appartement 3 chambres à louer — Almadies', 'built' => true],
            RadarListingTitle::resolve($this->valeurs(['title' => $titre]), 'Almadies'),
        );
    }

    /** @return array<string, array{mixed}> */
    public static function titresVides(): array
    {
        return ['null' => [null], 'vide' => [''], 'espaces' => ['   ']];
    }

    public function test_une_chambre_s_ecrit_au_singulier(): void
    {
        $this->assertSame('Appartement 1 chambre à louer — Almadies', RadarListingTitle::resolve($this->valeurs(['bedrooms' => 1]), 'Almadies')['title']);
    }

    public function test_une_vente_se_dit_a_vendre(): void
    {
        $this->assertSame('Villa 5 chambres à vendre — Ngor', RadarListingTitle::resolve($this->valeurs(['property_type' => 'villa', 'contract' => 'sale', 'bedrooms' => 5]), 'Ngor')['title']);
    }

    #[DataProvider('sansChambres')]
    public function test_la_partie_chambres_disparait_quand_le_nombre_manque_ou_que_le_type_n_en_a_pas(string $type, mixed $chambres, string $attendu): void
    {
        $this->assertSame($attendu, RadarListingTitle::resolve($this->valeurs(['property_type' => $type, 'bedrooms' => $chambres]), 'Almadies')['title']);
    }

    /** @return array<string, array{string, mixed, string}> */
    public static function sansChambres(): array
    {
        return [
            'nombre absent' => ['apartment', null, 'Appartement à louer — Almadies'],
            'zéro, un studio' => ['studio', 0, 'Studio à louer — Almadies'],
            'terrain' => ['land', 4, 'Terrain à louer — Almadies'],
            'bureau' => ['office', 3, 'Bureau à louer — Almadies'],
            'commerce' => ['shop', 2, 'Commerce à louer — Almadies'],
            'une chambre louée, déjà dans son type' => ['room', 1, 'Chambre à louer — Almadies'],
        ];
    }

    public function test_sans_quartier_le_titre_s_arrete_au_contrat(): void
    {
        $this->assertSame('Appartement 3 chambres à louer', RadarListingTitle::resolve($this->valeurs(), null)['title']);
        $this->assertSame('Appartement 3 chambres à louer', RadarListingTitle::resolve($this->valeurs(), '  ')['title']);
    }

    public function test_sans_type_ou_sans_contrat_rien_ne_se_construit(): void
    {
        $this->assertSame(['title' => null, 'built' => true], RadarListingTitle::resolve($this->valeurs(['property_type' => null]), 'Almadies'));
        $this->assertSame(['title' => null, 'built' => true], RadarListingTitle::resolve($this->valeurs(['contract' => 'autre']), 'Almadies'));
    }

    public function test_le_titre_s_ecrit_en_francais_quelle_que_soit_la_langue_de_la_requete(): void
    {
        app()->setLocale('en');

        $this->assertSame('Appartement 3 chambres à louer — Almadies', RadarListingTitle::resolve($this->valeurs(), 'Almadies')['title']);
    }
}
