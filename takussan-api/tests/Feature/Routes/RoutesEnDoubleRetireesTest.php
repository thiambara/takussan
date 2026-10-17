<?php

namespace Tests\Feature\Routes;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * TCK-780 (P13.08) — trois routes doublaient une route gardée, sur la même action, sans aucun
 * appelant. Elles sont retirées ; la route gardée reste.
 */
class RoutesEnDoubleRetireesTest extends TestCase
{
    public function test_les_doublons_ne_sont_plus_enregistres_et_les_routes_gardees_le_sont(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->flatMap(fn ($r) => array_map(fn (string $m) => $m.' '.$r->uri(), $r->methods()))
            ->all();

        foreach (['POST api/auth/verify-phone', 'POST api/auth/phone/resend', 'GET api/notifications/preferences', 'PUT api/notifications/preferences'] as $doublon) {
            $this->assertNotContains($doublon, $routes, "$doublon double une route gardée");
        }
        foreach (['POST api/auth/phone/verify-otp', 'POST api/auth/phone/send-otp', 'GET api/me/notification-preferences', 'PUT api/me/notification-preferences', 'PATCH api/me/notification-preferences'] as $gardee) {
            $this->assertContains($gardee, $routes, "$gardee est la route gardée");
        }
    }
}
