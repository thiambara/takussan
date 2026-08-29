<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\AgencyRoleCapability;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Support\AgencyKindGuard;
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
        // TCK-454 — REFUS PLAT sur une agence `individual` : tout rôle produit
        // par cette méthode est personnalisé PAR CONSTRUCTION (`is_system` y est
        // écrit en dur à `false` plus bas), et `features.md:293` refuse les rôles
        // personnalisés aux agences individuelles.
        //
        // Le garde vit dans le SERVICE et non dans les contrôleurs : `create()`
        // et `assign()` n'ont que deux appelants, tous deux des contrôleurs, et
        // la règle survit ainsi à l'ajout d'une troisième route — ce qui n'est
        // pas hypothétique, TCK-392 a dû éprouver deux routes menant à la même
        // méthode. `StoreAgencyRoleRequest::authorize()` ne pouvait pas la
        // porter : TCK-305 a posé qu'elle n'est qu'une délégation à la policy,
        // et `AgencyPolicy@update` ne juge pas le `kind`.
        //
        // ⚠ `AgencySystemRoleSeeder` n'entre PAS par ici : il écrit ses rôles
        // système directement et ne passe que par `replaceCapabilities()`. Le
        // garde ne l'atteint donc pas — vérifié par exécution
        // (`AgencyIndividualCustomRolesTest::test_le_seeder_de_roles_systeme_reste_operant…`),
        // et pas déduit de la lecture.
        AgencyKindGuard::ensureCustomRolesAllowed($agency);

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
        // Backstop de l'invariant « ces capacités restent à la plateforme ».
        // `SyncCapabilitiesRequest` le refuse déjà en 422 sur le chemin HTTP ;
        // ici il couvre AUSSI le clonage et tout appel interne futur — c'est
        // le seul point que les deux traversent. Une autorisation ne se garde
        // pas dans une seule couche.
        $reserved = collect($capabilities)
            ->filter(static fn (Capability $c): bool => $c->isPlatformReserved())
            ->map(static fn (Capability $c): string => $c->value)
            ->values();

        if ($reserved->isNotEmpty()) {
            throw ValidationException::withMessages([
                'capabilities' => 'Capacité réservée à la plateforme : '.$reserved->implode(', ')
                    .'. Aucun rôle d\'agence ne peut la porter.',
            ]);
        }

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
     * liste des porteurs en cause pour que l'appelant compose son 409.
     *
     * TCK-315 (ADR-0016) : pour un rôle `service_provider`, le porteur est
     * une COLLABORATION, qui n'a pas de `user_id` — on le prend sur son
     * profil. Sans cela le 409 nommerait des porteurs sans utilisateur, et
     * l'UI ne saurait pas qui détacher.
     *
     * @return array<int,array<string,mixed>>
     */
    public function blockingProfiles(AgencyRole $role): array
    {
        return $role->attachedProfiles()
            ->map(static fn (Model $holder): array => [
                'id' => $holder->getKey(),
                'type' => $role->base_profile_type instanceof AgencyRoleBaseType
                    ? $role->base_profile_type->value
                    : (string) $role->base_profile_type,
                'user_id' => $holder instanceof ServiceProviderAgencyCollaboration
                    ? $holder->serviceProviderProfile?->user_id
                    : $holder->user_id,
                'display_name' => $holder->display_name ?? null,
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

        // TCK-454 — l'assignation est gardée SOUS CONDITION, et la condition
        // est tout le ticket : une agence `individual` A un rôle — son rôle
        // SYSTÈME, celui que porte son unique `agency_admin` et que pose
        // `AgencySystemRoleSeeder`. Ce que `features.md:293` lui refuse, ce
        // sont les rôles PERSONNALISÉS.
        //
        // Un refus plat ici fermerait donc le seul rôle légitime de ces
        // agences : *une garde qui rend vert en fermant aussi ce qui devait
        // rester ouvert n'est pas une garde, c'est une panne qui a l'air d'un
        // correctif.* D'où le témoin « rôle système sur agence individuelle →
        // succès » dans les tests, sans lequel un refus global cocherait les
        // mêmes critères.
        if (! $role->is_system) {
            $agency = $role->agency;
            if ($agency !== null) {
                AgencyKindGuard::ensureCustomRolesAllowed($agency);
            }
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
