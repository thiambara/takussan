<?php

namespace App\Services\Admin;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\Currency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AgencyProvisioningService
{
    /**
     * @param  array{agency: array<string, mixed>, admin: array<string, mixed>}  $payload
     * @return array{agency: Agency, admin: User}
     */
    public function provision(array $payload, User $actor): array
    {
        $adminEmail = strtolower((string) data_get($payload, 'admin.email'));
        abort_if(
            User::query()->where('email', $adminEmail)->exists(),
            409,
            'An account already exists with this admin email.'
        );

        return DB::transaction(function () use ($payload, $actor, $adminEmail): array {
            $agencyPayload = $payload['agency'];
            $adminPayload = $payload['admin'];
            $metadata = [];
            if (! empty($agencyPayload['type'])) {
                $metadata['onboarding_type'] = $agencyPayload['type'];
            }

            // TCK-270 — currency is now picked in step 1 of the wizard.
            // Default to Currency::default() (XOF) when omitted so legacy
            // callers keep working unchanged.
            $currency = ! empty($agencyPayload['currency'])
                ? Currency::from($agencyPayload['currency'])
                : Currency::default();

            $agency = Agency::query()->create([
                'name' => $agencyPayload['name'],
                'slug' => $agencyPayload['slug'] ?? $this->uniqueSlug($agencyPayload['name']),
                'email' => $agencyPayload['email'] ?? null,
                'phone' => $agencyPayload['phone'] ?? null,
                'currency' => $currency,
                'status' => AgencyStatus::Active,
                'is_verified' => false,
                'verified_at' => null,
                'metadata' => $metadata !== [] ? $metadata : null,
            ]);

            if (! empty($agencyPayload['address'])) {
                Address::query()->create([
                    'addressable_id' => $agency->id,
                    'addressable_type' => Agency::class,
                    'label' => 'Siège',
                    'street' => $agencyPayload['address'],
                    'country' => 'SN',
                ]);
            }

            $admin = User::query()->create([
                'first_name' => $adminPayload['first_name'],
                'last_name' => $adminPayload['last_name'],
                'email' => $adminEmail,
                'password' => Hash::make(Str::password(32)),
                'preferred_language' => $adminPayload['language'] ?? 'fr',
                'email_verified_at' => null,
            ]);

            AgentProfile::query()->create([
                'user_id' => $admin->id,
                'agency_id' => $agency->id,
            ]);

            $this->assignAgencyAdminRole($admin, $agency);
            $agency->forceFill(['primary_admin_id' => $admin->id])->save();

            $this->sendActivationLink($admin);

            activity('Agency')
                ->causedBy($actor)
                ->performedOn($agency)
                ->withProperties([
                    'actor_id' => $actor->id,
                    'agency_id' => $agency->id,
                    'admin_user_id' => $admin->id,
                ])
                ->event('super_admin_agency_provisioned')
                ->log('Agency provisioned by super-admin');

            return [
                'agency' => $agency->refresh(),
                'admin' => $admin->refresh(),
            ];
        });
    }

    protected function sendActivationLink(User $admin): void
    {
        $status = Password::broker()->sendResetLink(['email' => $admin->email]);

        if ($status !== Password::RESET_LINK_SENT) {
            throw new HttpException(502, 'Invitation email could not be sent.');
        }
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $suffix = 2;

        while (Agency::query()->where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }

    /**
     * TCK-278 — Le rôle est matérialisé via `AgencyAdminProfile` (source de
     * vérité depuis la refonte RBAC). L'assignation spatie historique est
     * conservée pendant la fenêtre de coexistence ; le cutover P3 la
     * supprimera.
     */
    private function assignAgencyAdminRole(User $admin, Agency $agency): void
    {
        AgencyAdminProfile::query()->firstOrCreate(
            ['user_id' => $admin->id, 'agency_id' => $agency->id],
            ['status' => AgencyAdminProfileStatus::Active->value],
        );

        Role::findOrCreate('agency_admin', 'web');

        $registrar = app(PermissionRegistrar::class);
        $previousTeamId = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId($agency->id);
        $admin->unsetRelation('roles');

        try {
            if (! $admin->hasRole('agency_admin')) {
                $admin->assignRole('agency_admin');
            }
        } finally {
            $registrar->setPermissionsTeamId($previousTeamId);
            $admin->unsetRelation('roles');
        }
    }
}
