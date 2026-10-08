<?php

namespace App\Domain\Alerts;

/**
 * Les événements sur lesquels une règle d'alerte peut porter — des CLÉS, que le front traduit
 * (`superAdmin.alerts.events.<clé>`). TCK-600 : l'API servait un libellé français par entrée, et le
 * catalogue s'arrêtait à six gestes ; ni la remise à zéro d'une 2FA, ni le blocage d'un compte, ni
 * les reversements n'étaient alertables (une règle était refusée à la création et ne serait pas
 * partie). Un nom ajouté ici doit être celui qu'écrit `->event('…')`.
 */
class AlertableEvents
{
    /**
     * @return list<string>
     */
    public static function keys(): array
    {
        return [
            // Impersonation (ADR-0055) — le début, et la fin quelle qu'en soit la cause.
            'super_admin_impersonation_started',
            'super_admin_impersonation_stopped',
            // Agences (ADR-0048).
            'super_admin_agency_suspended',
            'super_admin_agency_reinstated',
            // Comptes.
            'super_admin_user_blocked',
            'super_admin_user_reactivated',
            'super_admin_user_erasure_requested',
            'super_admin_password_reset_forced',
            'super_admin_2fa_reset',
            'super_admin_sessions_revoked',
            'super_admin_account_unlocked',
            'super_admin_data_export_requested',
            // TCK-589 — `TwoFactorController::disable` (événement nommé).
            'two_factor_disabled',
            // Opérateurs (ADR-0047).
            'super_admin_invited',
            'super_admin_operator_revoked',
            // Configuration.
            'super_admin_setting_updated',
            'super_admin_feature_flag_updated',
            'super_admin_integration_updated',
            // Reversements — noms écrits par `PlatformPayoutService` (coordination TCK-594).
            'super_admin_payout_approved',
            'super_admin_payout_marked_paid',
            'super_admin_payout_cancelled',
            'super_admin_payout_period_closed',
            // Exploitation — écrits par `alerts:evaluate` à la transition seulement.
            'ops_failed_jobs_spike',
            'ops_queue_stalled',
            'ops_health_degraded',
        ];
    }

    public static function has(string $event): bool
    {
        return in_array($event, self::keys(), true);
    }
}
