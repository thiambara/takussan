<?php

namespace Tests\Feature\Search;

use App\Services\Search\PropertySearchService;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2768 (q1 de la vérification de 7981e617d) — une recherche sauvegardée AVANT la règle peut porter un
 * `available_from` que `JourIso` refuse aujourd'hui (« 99999-01-01 », « 12/11/2026 »). L'alerte e-mail
 * (`alertMatches`) et le compte de résultats (`search`) la rejouaient par `Carbon::parse`, sans validation :
 * relue en 2009 ou au 11 décembre, sans erreur ni signal. Le moteur l'ignore désormais, comme le front
 * (`parametresDeRecherche`) : la recherche est servie sans ce critère. Les deux rejeux passent par
 * `buildFilter`, lu ici par `filtreDeLaListe`.
 */
class AlerteRejoueeJourIsoTest extends TestCase
{
    /** @return array<string, array{0: mixed}> */
    public static function valeursRefusees(): array
    {
        return [
            'année à cinq chiffres (relue 2009)' => ['99999-01-01'],
            'jour/mois/année (relu le 11 décembre)' => ['12/11/2026'],
            'jour inexistant' => ['2026-02-30'],
            'avant 1970' => ['1960-01-01'],
            'un entier' => [20261112],
        ];
    }

    /** @param  array<int, string|array<int, string>>  $filtre */
    private function clausesDeDisponibilite(array $filtre): array
    {
        return array_values(array_filter($filtre, fn (string|array $c): bool => str_contains(json_encode($c), 'available_from')));
    }

    #[DataProvider('valeursRefusees')]
    public function test_une_valeur_ancienne_que_jouriso_refuse_n_est_pas_rejouee(mixed $valeur): void
    {
        $filtre = app(PropertySearchService::class)->filtreDeLaListe(['available_from' => $valeur]);

        $this->assertSame([], $this->clausesDeDisponibilite($filtre));
    }

    public function test_un_jour_admis_est_rejoue_tel_quel(): void
    {
        $filtre = app(PropertySearchService::class)->filtreDeLaListe(['available_from' => '2026-11-12']);

        $this->assertSame(
            [['available_from IS NULL', 'available_from <= '.Carbon::parse('2026-11-12')->timestamp]],
            $this->clausesDeDisponibilite($filtre),
        );
    }
}
