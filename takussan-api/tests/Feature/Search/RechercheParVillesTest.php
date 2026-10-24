<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * P185.02 (TCK-2061) — `cities`, la liste de villes qu'écrit le formulaire de préférences du profil
 * (TCK-136), se lit aussi sur `/properties` : la liste et la carte la valident et l'appliquent en OU.
 *
 * Avant ce ticket, `SearchPublicPropertyRequest` ne la validait pas : `validated()` la jetait, et le
 * lien « voir les résultats » d'une alerte réglée sur deux villes montrait le pays entier, alors que
 * l'alerte elle-même (`PropertySearchService::buildFilter`, TCK-599) les appliquait.
 *
 * Deux formes acceptées : la liste à virgules de l'URL du front (`cities=Dakar,Thiès`, la forme de
 * `type` et `condition`) et le tableau (`cities[]=Dakar`).
 */
class RechercheParVillesTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const CADRAGE = '14.0,-18.0,17.0,-15.0';

    public function test_cities_en_liste_a_virgules_garde_chaque_ville_en_liste_et_en_carte(): void
    {
        [$dakar, $thies] = $this->troisBiens();

        $attendu = $this->tries([$dakar->id, $thies->id]);
        $this->assertSame($attendu, $this->idsDeLaListe('cities=Dakar,Thi%C3%A8s'));
        $this->assertSame($attendu, $this->idsDeLaCarte('cities=Dakar,Thi%C3%A8s'));
    }

    public function test_cities_en_tableau_garde_chaque_ville(): void
    {
        [$dakar, $thies] = $this->troisBiens();

        $attendu = $this->tries([$dakar->id, $thies->id]);
        $this->assertSame($attendu, $this->idsDeLaListe('cities[]=Dakar&cities[]=Thi%C3%A8s'));
        $this->assertSame($attendu, $this->idsDeLaCarte('cities[]=Dakar&cities[]=Thi%C3%A8s'));
    }

    public function test_cities_borne_le_nombre_et_la_longueur_comme_le_critere_sauvegarde(): void
    {
        $vingtEtUne = implode(',', array_map(fn (int $i) => 'Ville'.$i, range(1, 21)));
        $this->getJson('/api/public/properties/search?cities='.$vingtEtUne)
            ->assertStatus(422)->assertJsonValidationErrors('cities');

        $this->getJson('/api/public/properties/search?cities='.str_repeat('a', 121))
            ->assertStatus(422)->assertJsonValidationErrors('cities');

        $this->getJson('/api/public/properties/search?cities[0][x]=Dakar')
            ->assertStatus(422)->assertJsonValidationErrors('cities');
    }

    /** @return array{0: Property, 1: Property, 2: Property} */
    private function troisBiens(): array
    {
        $biens = [
            $this->bien('Dakar', 'Dakar', 14.7, -17.45),
            $this->bien('Thiès', 'Thiès', 14.79, -16.93),
            $this->bien('Saint-Louis', 'Saint-Louis', 16.03, -16.5),
        ];
        $this->indexProperties();

        return $biens;
    }

    private function bien(string $ville, string $region, float $lat, float $lng): Property
    {
        $bien = Property::factory()->published()->create([
            'featured' => false,
            'published_at' => now()->subHour(),
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'country' => 'SN',
            'city' => $ville,
            'region' => $region,
            'latitude' => $lat,
            'longitude' => $lng,
        ]);

        return $bien;
    }

    /** @return list<int> */
    private function idsDeLaListe(string $requete): array
    {
        $reponse = $this->getJson('/api/public/properties/search?'.$requete.'&featured=false&per_page=100')->assertOk();

        return $this->tries(array_unique([
            ...array_column($reponse->json('data') ?? [], 'id'),
            ...array_column($reponse->json('sponsored') ?? [], 'id'),
        ]));
    }

    /** @return list<int> */
    private function idsDeLaCarte(string $requete): array
    {
        $reponse = $this->getJson('/api/public/properties/map?bounds='.self::CADRAGE.'&'.$requete)->assertOk();

        return $this->tries(array_map(static fn (array $f) => (int) $f['properties']['id'], $reponse->json('features')));
    }

    /**
     * @param  array<int, int|string>  $ids
     * @return list<int>
     */
    private function tries(array $ids): array
    {
        $ids = array_values(array_map('intval', $ids));
        sort($ids);

        return $ids;
    }
}
