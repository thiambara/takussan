<?php

namespace App\Listeners\Payments;

use App\Events\IntegrationConfigChanged;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use Illuminate\Support\Facades\Cache;

/**
 * P98.10 (TCK-1176) — après une modification d'une intégration Orange Money (identifiants ou
 * activation), le jeton OAuth en cache pour elle est oublié : sans cela, il restait servi jusqu'à
 * son expiration, obtenu avec les anciens `client_id`/`client_secret`.
 */
class ForgetOrangeMoneyOAuthToken
{
    public function handle(IntegrationConfigChanged $event): void
    {
        if ($event->integration->provider !== OrangeMoneyDriver::PROVIDER) {
            return;
        }

        Cache::forget(OrangeMoneyDriver::oauthTokenCacheKey((int) $event->integration->getKey()));
    }
}
