<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Auth\ConfirmSuperAdminTwoFactorRequest;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\PlatformProfile;
use App\Notifications\SuperAdminAcceptedBroadcast;
use App\Services\Auth\SuperAdminBootstrapService;
use App\Services\Auth\SuperAdminCooptationService;
use App\Services\Auth\TwoFactorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-264 — Mandatory TOTP enrollment for a freshly-coopted super-admin.
 *
 * The generic TwoFactorController (auth) covers the standard recommended
 * 2FA enrollment for any user. Super-admin cooptation has two extra
 * requirements that justify a dedicated controller:
 *
 *  1. The `PlatformProfile` super_admin level is **deferred** until the factor is
 *     confirmed — `confirm()` is the place that finally attaches it.
 *  2. Recovery codes are generated and **hashed** in storage (mirror of
 *     {@see SuperAdminBootstrapService}) so they
 *     cannot be re-emitted later, even by an attacker holding DB read
 *     access.
 *
 * The endpoints are gated by `auth:sanctum` only — the user is the
 * freshly-created invitee, who at this stage holds **no** super_admin
 * PlatformProfile yet. We probe `force_2fa_at_first_login` to authorise.
 */
class SuperAdminTwoFactorController extends Controller
{
    public function __construct(
        private readonly TwoFactorService $twoFactor,
        private readonly SuperAdminCooptationService $cooptation,
    ) {}

    /**
     * POST /api/auth/super-admin/2fa/enroll
     *
     * Generate a fresh TOTP secret + 8 plaintext recovery codes. The
     * recovery codes are surfaced in clear **once** so the user can save
     * them; they're stored hashed via bcrypt and verified one-time on
     * recovery sign-in by the standard auth layer.
     */
    public function enroll(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->assertCooptedSuperAdmin($user);

        $secret = $this->twoFactor->generateSecret();
        $recoveryCodesPlain = $this->twoFactor->generateRecoveryCodes();
        $recoveryCodesHashed = array_map(
            static fn (string $code) => Hash::make($code),
            $recoveryCodesPlain,
        );

        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => json_encode($recoveryCodesHashed),
            'two_factor_enabled' => false,
        ])->save();

        return $this->json([
            'data' => [
                'secret' => $secret,
                'qr_url' => $this->twoFactor->qrCodeUrl($user, $secret),
                'qr_svg' => 'data:image/svg+xml;base64,'.base64_encode(
                    $this->twoFactor->qrCodeSvg($user, $secret),
                ),
                'recovery_codes' => $recoveryCodesPlain,
            ],
        ]);
    }

    /**
     * POST /api/auth/super-admin/2fa/confirm
     *
     * Confirm the TOTP setup with a fresh 6-digit code, attach the
     * super_admin `PlatformProfile`, flip
     * `force_2fa_at_first_login = false`, and broadcast the news to
     * every other super-admin.
     *
     * Idempotency note: a super-admin who has already gone through the
     * flow doesn't reach here (the assert above bounces them with 422),
     * so confirm() is by construction a single-shot transition.
     */
    public function confirm(ConfirmSuperAdminTwoFactorRequest $request): JsonResponse
    {
        $user = $request->user();
        $this->assertCooptedSuperAdmin($user);

        abort_unless(
            $user->two_factor_secret !== null,
            422,
            __('super_admins.cooptation.errors.enroll_first'),
        );

        abort_unless(
            $this->twoFactor->verifyCodeForUser($user, $user->two_factor_secret, $request->input('code')),
            422,
            __('super_admins.cooptation.errors.invalid_code'),
        );

        DB::transaction(function () use ($user): void {
            $user->forceFill([
                'two_factor_enabled' => true,
                'force_2fa_at_first_login' => false,
            ])->save();

            $this->attachSuperAdminRole($user);

            activity('User')
                ->performedOn($user)
                ->causedBy($user)
                ->withProperties(['user_id' => $user->id])
                ->event('super_admin_2fa_enrolled')
                ->log('super_admin_2fa_enrolled');

            activity('User')
                ->performedOn($user)
                ->causedBy($user)
                ->withProperties(['user_id' => $user->id])
                ->event('super_admin_role_attached')
                ->log('super_admin_role_attached');
        });

        $recipients = $this->cooptation->otherSuperAdmins($user);
        if ($recipients->isNotEmpty()) {
            Notification::send($recipients, new SuperAdminAcceptedBroadcast($user->fresh()));
        }

        return $this->json([
            'data' => [
                'enabled' => true,
                'role_attached' => true,
            ],
        ]);
    }

    /**
     * TCK-278 — Source de vérité unique : `PlatformProfile` super_admin.
     * Idempotent : re-running on a user who already holds the profile is
     * a no-op (et lève `revoked_at` si présent).
     */
    protected function attachSuperAdminRole($user): void
    {
        $profile = PlatformProfile::query()
            ->firstOrNew(['user_id' => $user->id]);
        $profile->level = PlatformProfileLevel::SuperAdmin;
        $profile->revoked_at = null;
        if (! $profile->exists) {
            $profile->granted_at = now();
        }
        $profile->save();
    }

    /**
     * The endpoints accept exactly one population: a freshly-coopted
     * super-admin who has NOT yet enrolled. Anyone else (random user,
     * already-confirmed super-admin) gets 403.
     */
    protected function assertCooptedSuperAdmin($user): void
    {
        abort_if($user === null, 401);
        abort_unless(
            (bool) $user->force_2fa_at_first_login,
            403,
            __('super_admins.cooptation.errors.not_pending'),
        );
    }
}
