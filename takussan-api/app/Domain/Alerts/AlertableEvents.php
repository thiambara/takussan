<?php

namespace App\Domain\Alerts;

class AlertableEvents
{
    public static function all(): array
    {
        return [
            'super_admin_impersonation_started' => 'Impersonation démarrée',
            'super_admin_agency_suspended' => 'Agence suspendue',
            'super_admin_setting_updated' => 'Paramètre plateforme modifié',
            'super_admin_feature_flag_updated' => 'Feature flag modifié',
            'super_admin_password_reset_forced' => 'Reset mot de passe forcé',
            'super_admin_integration_updated' => 'Intégration modifiée',
        ];
    }

    public static function has(string $event): bool
    {
        return array_key_exists($event, self::all());
    }
}
