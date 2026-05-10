<?php

namespace App\Services\Auth;

use App\Models\Enums\UserStatus;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-263 — bootstraps a fully-formed super-admin account on a brand
 * new environment (or, later, via the cooptation flow — TCK-264).
 *
 * The service is deliberately decoupled from any HTTP/console concern
 * so it can be reused both by the artisan `takussan:create-super-admin`
 * command and by the peer-to-peer cooptation endpoint that TCK-264 will
 * introduce. Returned recovery codes are passed back to the caller in
 * **plain text** — they are never persisted in clear and the caller is
 * the only place that can show them to the operator before they vanish.
 */
class SuperAdminBootstrapService
{
    public function __construct(
        private readonly TwoFactorService $twoFactor,
    ) {}

    /**
     * Provision a new super-admin user, attach 2FA and the global
     * `super_admin` spatie role, mark the email as verified and force a
     * fresh 2FA enrollment at first login. Wrapped in a DB transaction
     * so a partial failure (role attach, log write, …) does not leave
     * an orphan User behind.
     *
     * @param  array{email:string,password:string,first_name:string,last_name:string,locale?:string}  $data
     * @return array{user:User,recovery_codes:array<int,string>}
     */
    public function bootstrap(array $data, string $source = 'artisan'): array
    {
        if (User::query()->where('email', strtolower(trim($data['email'])))->exists()) {
            throw new RuntimeException("A user with email {$data['email']} already exists.");
        }

        return DB::transaction(function () use ($data, $source) {
            $secret = $this->twoFactor->generateSecret();
            $recoveryCodesPlain = $this->twoFactor->generateRecoveryCodes();
            $recoveryCodesHashed = array_map(
                static fn (string $code) => Hash::make($code),
                $recoveryCodesPlain,
            );

            // `email_verified_at` is intentionally not in $fillable on
            // User (the email-verification flow owns that column), so
            // we forceFill the bootstrap-only fields and persist with
            // a single save() to keep the row creation atomic inside
            // the surrounding transaction.
            $user = (new User)->forceFill([
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'preferred_language' => $data['locale'] ?? 'fr',
                'status' => UserStatus::Active,
                'email_verified_at' => now(),
                'two_factor_enabled' => true,
                'two_factor_secret' => $secret,
                'two_factor_recovery_codes' => json_encode($recoveryCodesHashed),
                'force_2fa_at_first_login' => true,
            ]);
            $user->save();

            $this->attachSuperAdminRole($user);

            activity()
                ->causedBy($user)
                ->performedOn($user)
                ->withProperties([
                    'source' => $source,
                    'two_factor_enabled' => true,
                    'force_2fa_at_first_login' => true,
                ])
                ->event('super_admin_bootstrapped')
                ->log('super_admin_bootstrapped');

            return [
                'user' => $user,
                'recovery_codes' => $recoveryCodesPlain,
            ];
        });
    }

    /**
     * Pin the spatie team scope to `null` (the role is global) and
     * attach `super_admin`, creating the role on the fly if the
     * environment hasn't been seeded yet. This keeps the bootstrap
     * usable on a freshly-migrated database where
     * RolesAndPermissionsSeeder has not been run.
     */
    private function attachSuperAdminRole(User $user): void
    {
        $registrar = app(PermissionRegistrar::class);
        $previous = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId(null);

        try {
            // Bypass spatie's `findByName` because it inherits the team
            // scope at query time even when the registrar has been
            // pinned to null — under `teams=true` the package adds an
            // implicit `team_id IS ?` clause that does not match a
            // legacy null-team row created in a different scope. Direct
            // firstOrCreate on the role table is the documented escape
            // hatch for global roles.
            $registrar->forgetCachedPermissions();
            $role = Role::query()
                ->where('name', 'super_admin')
                ->where('guard_name', 'web')
                ->whereNull(config('permission.column_names.team_foreign_key', 'team_id'))
                ->first();

            if ($role === null) {
                $role = Role::create([
                    'name' => 'super_admin',
                    'guard_name' => 'web',
                ]);
            }

            $user->assignRole($role);
        } finally {
            $registrar->setPermissionsTeamId($previous);
        }
    }
}
