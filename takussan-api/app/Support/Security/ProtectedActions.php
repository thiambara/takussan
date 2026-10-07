<?php

namespace App\Support\Security;

use App\Http\Controllers\Api\Admin\FeatureFlagController;
use App\Http\Controllers\Api\Admin\IntegrationController as AdminIntegrationController;
use App\Http\Controllers\Api\Admin\PlatformPayoutController;
use App\Http\Controllers\Api\Admin\PlatformSettingController;
use App\Http\Controllers\Api\Admin\SuperAdminInvitationController;
use App\Http\Controllers\Api\Admin\UserImpersonationController;
use App\Http\Controllers\Api\Admin\UserSupportController;
use App\Http\Controllers\Api\Agency\AgentInvitationController;
use App\Http\Controllers\Api\Agency\OwnerInvitationController;
use App\Http\Controllers\Api\Agency\RoleController;
use App\Http\Controllers\Api\Agency\ServiceProviderInvitationController;
use App\Http\Controllers\Api\Agency\TeamController;
use App\Http\Controllers\Api\AgencyController;
use App\Http\Controllers\Api\AgencyMemberRoleController;
use App\Http\Controllers\Api\Auth\TwoFactorController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\PayoutController;
use App\Http\Controllers\Api\Permissions\RoleDelegationController;
use App\Http\Controllers\Api\Profile\AgencyRoleController;
use App\Http\Controllers\Api\UserAdminController;
use App\Http\Controllers\Api\UserRoleController;
use App\Http\Controllers\Public\InvitationAcceptController;
use App\Http\Middleware\RequireRecentTwoFactor;
use App\Http\Middleware\RequireTwoFactor;

/**
 * TCK-589 — les actions où le second facteur est exigé (ADR-0033, contraintes 7 à 9).
 *
 * Les listes apparient par ACTION DE CONTRÔLEUR (`Classe@méthode`), jamais par nom
 * de route : `PATCH integrations/{id}`, `PATCH agencies/{agency}` et l'alias `PUT`
 * d'`agency-roles.php` n'ont pas de nom, et une liste de noms les aurait laissés
 * passer. `ProtectedActionsCoverageTest` garde les deux sens : une entrée qui ne
 * résout aucune route, et une route mutante d'une famille absente des deux listes,
 * cassent la suite.
 *
 * Lues par {@see RequireTwoFactor} et
 * {@see RequireRecentTwoFactor}.
 */
final class ProtectedActions
{
    /**
     * Familles protégées pour le personnel d'agence : reversements, intégrations,
     * rôles et délégations, équipe et invitations. Fichier de routes ⇒ `null` si
     * tout le fichier en est, sinon les seuls contrôleurs qui en sont.
     *
     * @var array<string, list<class-string>|null>
     */
    public const FAMILIES = [
        'payouts.php' => null,
        'integrations.php' => null,
        'agency-roles.php' => null,
        'invitations.php' => null,
        'users.php' => null,
        'agencies.php' => [
            AgencyController::class,
            AgencyMemberRoleController::class,
            RoleDelegationController::class,
            OwnerInvitationController::class,
            AgentInvitationController::class,
            ServiceProviderInvitationController::class,
            TeamController::class,
        ],
    ];

    /**
     * Actions mutantes des familles : 2FA exigée d'un admin d'agence, et du
     * personnel quand l'agence a coché `settings.require_team_two_factor`.
     *
     * @var list<string>
     */
    public const AGENCY_TWO_FACTOR = [
        PayoutController::class.'@store',
        PayoutController::class.'@markProcessed',
        PayoutController::class.'@markFailed',
        PayoutController::class.'@cancel',

        IntegrationController::class.'@store',
        IntegrationController::class.'@update',
        IntegrationController::class.'@test',
        IntegrationController::class.'@destroy',

        RoleController::class.'@store',
        RoleController::class.'@update',
        RoleController::class.'@destroy',
        RoleController::class.'@syncCapabilities',
        AgencyRoleController::class.'@update',
        RoleDelegationController::class.'@store',
        RoleDelegationController::class.'@destroy',
        AgencyMemberRoleController::class.'@update',
        UserRoleController::class.'@update',

        // `PATCH agencies/{agency}` (sans nom) porte l'interrupteur
        // `settings.require_team_two_factor` lui-même.
        AgencyController::class.'@update',
        AgencyController::class.'@destroy',
        AgencyController::class.'@addAgent',
        AgencyController::class.'@removeAgent',
        UserAdminController::class.'@block',
        UserAdminController::class.'@activate',
        UserAdminController::class.'@destroy',

        OwnerInvitationController::class.'@__invoke',
        AgentInvitationController::class.'@__invoke',
        ServiceProviderInvitationController::class.'@__invoke',
        InvitationController::class.'@store',
        InvitationController::class.'@revoke',
        InvitationController::class.'@resend',
    ];

    /**
     * Routes mutantes d'une famille, délibérément hors de la liste — avec la raison.
     *
     * @var array<string, string>
     */
    public const EXEMPT = [
        // L'invité n'a pas encore de compte : il accepte par le lien reçu.
        InvitationAcceptController::class.'@__invoke' => 'acceptation publique d\'une invitation',
        // Qui crée son agence n'en est pas encore l'admin : l'exigence le prend au
        // premier geste protégé, dans l'agence créée.
        AgencyController::class.'@store' => 'création d\'une agence',
    ];

    /**
     * Step-up (contrainte 9) : un TOTP saisi sur CE jeton il y a moins de 10 min.
     *
     * @var list<string>
     */
    public const STEP_UP = [
        PlatformPayoutController::class.'@closePeriod',
        PlatformPayoutController::class.'@approve',
        PlatformPayoutController::class.'@markPaid',
        PlatformPayoutController::class.'@cancel',
        AdminIntegrationController::class.'@update',
        AdminIntegrationController::class.'@test',
        PlatformSettingController::class.'@bulkUpdate',
        FeatureFlagController::class.'@update',
        FeatureFlagController::class.'@override',
        SuperAdminInvitationController::class.'@store',
        SuperAdminInvitationController::class.'@resend',
        SuperAdminInvitationController::class.'@revoke',
        UserImpersonationController::class.'@start',
        UserSupportController::class.'@reset2fa',
        UserSupportController::class.'@revokeSessions',
        UserSupportController::class.'@destroySession',

        // Codes de secours : une session volée ne les lit plus sans le TOTP.
        TwoFactorController::class.'@recoveryCodes',
        TwoFactorController::class.'@regenerateRecoveryCodes',
    ];

    /**
     * Step-up exigé seulement quand l'appelant agit depuis la console plateforme :
     * ces actions servent aussi l'admin d'agence sur sa propre équipe (TCK-147).
     *
     * @var list<string>
     */
    public const STEP_UP_FOR_PLATFORM = [
        UserAdminController::class.'@block',
        UserAdminController::class.'@destroy',
    ];

    public static function requiresAgencyTwoFactor(?string $action): bool
    {
        return in_array(self::normalize($action), self::AGENCY_TWO_FACTOR, true);
    }

    public static function requiresStepUp(?string $action): bool
    {
        return in_array(self::normalize($action), self::STEP_UP, true);
    }

    public static function requiresStepUpForPlatform(?string $action): bool
    {
        return in_array(self::normalize($action), self::STEP_UP_FOR_PLATFORM, true);
    }

    /** `Classe` (contrôleur invocable) ⇒ `Classe@__invoke`. */
    public static function normalize(?string $action): string
    {
        $action = ltrim((string) $action, '\\');

        return str_contains($action, '@') ? $action : $action.'@__invoke';
    }
}
