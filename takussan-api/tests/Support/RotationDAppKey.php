<?php

namespace Tests\Support;

use Illuminate\Support\Facades\Crypt;

/**
 * TCK-2430 — une rotation d'`APP_KEY` telle que le runbook la fait (ADR-0044 §1) : la clé courante passe en tête
 * d'`APP_PREVIOUS_KEYS`, une neuve la remplace. Le chiffreur est reconstruit : une colonne `encrypted` écrite avant
 * se relit sous l'ancienne clé, comme en production après redéploiement. `$garderLAncienne = false` est l'erreur que
 * le runbook interdit : l'ancienne clé perdue, plus rien d'écrit avant ne se déchiffre.
 */
trait RotationDAppKey
{
    protected function tournerAppKey(bool $garderLAncienne = true): void
    {
        config([
            'app.previous_keys' => $garderLAncienne ? [(string) config('app.key'), ...(array) config('app.previous_keys', [])] : [],
            'app.key' => 'base64:'.base64_encode(random_bytes(32)),
        ]);
        $this->app->forgetInstance('encrypter');
        Crypt::clearResolvedInstance('encrypter');
    }
}
