<?php

namespace App\Support;

use App\Models\User;
use App\Services\Features\FeatureFlagEvaluator;

class Feature
{
    public static function for(?User $user): object
    {
        return new class($user)
        {
            public function __construct(private readonly ?User $user) {}

            public function isEnabled(string $key): bool
            {
                return app(FeatureFlagEvaluator::class)->isEnabled($key, $this->user);
            }
        };
    }

    public static function isEnabled(string $key, ?User $user = null): bool
    {
        return app(FeatureFlagEvaluator::class)->isEnabled($key, $user);
    }
}
