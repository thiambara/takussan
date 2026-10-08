<?php

namespace App\Models\Enums;

use App\Http\Middleware\EnsurePlatformAbility;
use App\Http\Middleware\EnsureSuperAdmin;

/**
 * TCK-600 (ADR-0047) — les GESTES de la console plateforme, distincts de {@see Capability}.
 *
 * `Capability` est le vocabulaire d'un rôle d'AGENCE (pivot `agency_role_capabilities`, garde de
 * TCK-587) ; un geste plateforme n'a pas d'agence. Une route de `/api/admin` en déclare un par
 * `platform-can:<valeur>` ({@see EnsurePlatformAbility}) ; une route qui n'en
 * déclare aucun reste au `super_admin` ({@see EnsureSuperAdmin}).
 *
 * Les cas réservés au `super_admin` qui figurent ici sont ceux qu'un code juge EXPLICITEMENT
 * (`authorize()` d'un FormRequest, filtrage de la console) ; les autres routes du `super_admin`
 * n'ont pas besoin d'un cas : le refus par défaut les couvre.
 */
enum PlatformAbility: string
{
    // Tout niveau.
    case ConsoleAccess = 'platform.console.access';
    case ReportsView = 'platform.reports.view';
    case HealthView = 'platform.health.view';
    case AgenciesView = 'platform.agencies.view';

    // `support` et au-dessus.
    case UsersView = 'platform.users.view';
    case UsersSupport = 'platform.users.support';
    case UsersBlock = 'platform.users.block';
    case ModerationView = 'platform.moderation.view';
    case SearchGlobal = 'platform.search.global';

    // `super_admin` seul.
    case UsersImpersonate = 'platform.users.impersonate';
    case UsersErase = 'platform.users.erase';
    case OperatorsManage = 'platform.operators.manage';
    case AgenciesSuspend = 'platform.agencies.suspend';
    case KycView = 'platform.kyc.view';
    case SettingsManage = 'platform.settings.manage';

    /**
     * La matrice de l'ADR-0047. `super_admin` = tous les gestes.
     *
     * @return list<self>
     */
    public static function forLevel(PlatformProfileLevel $level): array
    {
        $viewer = [self::ConsoleAccess, self::ReportsView, self::HealthView, self::AgenciesView];
        $support = [...$viewer, self::UsersView, self::UsersSupport, self::UsersBlock, self::ModerationView, self::SearchGlobal];

        return match ($level) {
            PlatformProfileLevel::Viewer => $viewer,
            PlatformProfileLevel::Support => $support,
            PlatformProfileLevel::SuperAdmin => self::cases(),
        };
    }

    public function grantedTo(PlatformProfileLevel $level): bool
    {
        return in_array($this, self::forLevel($level), true);
    }
}
