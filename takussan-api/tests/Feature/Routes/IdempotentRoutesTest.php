<?php

namespace Tests\Feature\Routes;

use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * ADR-0072 § Application — la LISTE ÉCRITE des routes qui portent l'intergiciel `idempotent`. Elle
 * grandit à chaque lot ; une route renommée ou dépouillée de l'intergiciel rougit ici.
 */
class IdempotentRoutesTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function routesEquipees(): array
    {
        return [
            // TCK-1398 (P144.02) — texte et note vocale.
            'conversations.messages.store' => ['conversations.messages.store'],
            // TCK-1400 (P144.04) — l'acompte enregistré par le personnel.
            'bookings.payments.store' => ['bookings.payments.store'],
        ];
    }

    #[DataProvider('routesEquipees')]
    public function test_la_route_porte_l_intergiciel_idempotent(string $nom): void
    {
        $route = Route::getRoutes()->getByName($nom);

        $this->assertNotNull($route, "La route {$nom} n'existe plus.");
        $this->assertContains('idempotent', $route->gatherMiddleware(), "La route {$nom} ne porte plus `idempotent`.");
    }
}
