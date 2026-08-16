<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\AgencyRoleCapability;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-279 — règles métier des rôles d'agence. Le contrôleur reste mince
 * (convention `takussan-api/CLAUDE.md`) ; tout ce qui peut casser une
 * autorisation vit ici.
 */
class AgencyRoleService
{
    public function __construct(
        private readonly AgencyRoleCapabilityCache $cache,
    ) {}

    /**
     * Crée un rôle personnalisé, éventuellement par clonage d'un rôle de la
     * même agence et du même `base_profile_type`.
     *
     * Le clone est une **copie**, pas un lien : la spec exclut tout héritage
     * rétroactif vers le rôle source.
     *
     * @param  array<string,mixed>  $data
     */
    public function create(Agency $agency, array $data): AgencyRole
    {
        $type = AgencyRoleBaseType::from((string) $data['base_profile_type']);
        $source = null;

        if (! empty($data['clone_from'])) {
            $source = AgencyRole::query()
                ->where('agency_id', $agency->id)
                ->findOrFail((int) $data['clone_from']);

            if ($source->base_profile_type !== $type) {
                throw ValidationException::withMessages([
                    'clone_from' => 'Le rôle source ne cible pas le même type de profil.',
                ]);
            }

            if (! $source->is_clonable) {
                throw ValidationException::withMessages([
                    'clone_from' => 'Ce rôle n\'est pas clonable.',
                ]);
            }
        }

        return DB::transaction(function () use ($agency, $data, $type, $source): AgencyRole {
            $role = AgencyRole::query()->create([
                'agency_id' => $agency->id,
                'name' => $data['name'],
                'base_profile_type' => $type->value,
                'description' => $data['description'] ?? null,
                'is_system' => false,
                'is_clonable' => true,
            ]);

            if ($source !== null) {
                $this->replaceCapabilities($role, $source->capabilityEnums()->all());
            }

            return $role->fresh();
        });
    }

    /**
     * AC6 — remplace l'ENSEMBLE des capacités du rôle. Un `sync`, pas un
     * `attach` : une capacité absente de la liste est retirée.
     *
     * @param  array<int,Capability>  $capabilities
     */
    public function replaceCapabilities(AgencyRole $role, array $capabilities): AgencyRole
    {
        $values = collect($capabilities)
            ->map(static fn (Capability $c): string => $c->value)
            ->unique()
            ->values();

        DB::transaction(function () use ($role, $values): void {
            AgencyRoleCapability::query()->where('agency_role_id', $role->id)->delete();

            $now = now();
            $rows = $values->map(static fn (string $v): array => [
                'agency_role_id' => $role->id,
                'capability' => $v,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all();

            if ($rows !== []) {
                AgencyRoleCapability::query()->insert($rows);
            }
        });

        // Invalidation synchrone : la spec §52 exige que l'édition prenne
        // effet immédiatement pour tous les profils attachés. Le hook
        // `saved` du modèle ne se déclenche pas ici — on n'a touché que le
        // pivot — donc on purge explicitement.
        $this->cache->forget((int) $role->id);

        return $role->fresh(['capabilities']);
    }

    /**
     * AC5 — suppression refusée si le rôle est encore porté. Retourne la
     * liste des profils en cause pour que l'appelant compose son 409.
     *
     * @return array<int,array<string,mixed>>
     */
    public function blockingProfiles(AgencyRole $role): array
    {
        return $role->attachedProfiles()
            ->map(static fn (Model $profile): array => [
                'id' => $profile->getKey(),
                'type' => $role->base_profile_type instanceof AgencyRoleBaseType
                    ? $role->base_profile_type->value
                    : (string) $role->base_profile_type,
                'user_id' => $profile->user_id,
                'display_name' => $profile->display_name ?? null,
            ])
            ->all();
    }

    /**
     * AC7 + AC10 — réaffecte un profil à un autre rôle de la même agence.
     *
     * @throws ValidationException
     */
    public function assign(Model $profile, AgencyRole $role): Model
    {
        if ((int) $profile->agency_id !== (int) $role->agency_id) {
            throw ValidationException::withMessages([
                'agency_role_id' => 'Ce rôle appartient à une autre agence.',
            ]);
        }

        $expected = $profile::agencyRoleBaseType();
        if ($role->base_profile_type !== $expected) {
            throw ValidationException::withMessages([
                'agency_role_id' => 'Ce rôle ne cible pas le même type de profil.',
            ]);
        }

        $this->assertNotLastAdminLosingControl($profile, $role);

        $profile->agency_role_id = $role->id;
        $profile->save();

        return $profile->fresh(['agencyRole']);
    }

    /**
     * AC10 — règle « last admin ». Un `AgencyAdminProfile` qui est le
     * DERNIER de son agence à pouvoir assigner les rôles ne peut pas se
     * réaffecter à un rôle qui lui retire `team.assign_role` : personne ne
     * pourrait plus jamais l'en sortir depuis l'API.
     *
     * On compte les administrateurs qui gardent la capacité APRÈS la
     * bascule, pas avant — un compte pris avant se tromperait exactement
     * dans le seul cas qui compte.
     *
     * @throws ValidationException
     */
    private function assertNotLastAdminLosingControl(Model $profile, AgencyRole $target): void
    {
        if (! $profile instanceof AgencyAdminProfile) {
            return;
        }

        if ($this->cache->allows((int) $target->id, Capability::TeamAssignRole)) {
            return;
        }

        $survivors = AgencyAdminProfile::query()
            ->where('agency_id', $profile->agency_id)
            ->where('id', '!=', $profile->id)
            ->whereNotNull('agency_role_id')
            ->pluck('agency_role_id')
            ->filter(fn ($roleId): bool => $this->cache->allows((int) $roleId, Capability::TeamAssignRole))
            ->count();

        if ($survivors === 0) {
            throw ValidationException::withMessages([
                'agency_role_id' => 'Dernier administrateur de l\'agence : ce rôle lui retirerait '
                    .'la gestion des rôles, et personne ne pourrait l\'y rendre.',
            ]);
        }
    }
}
