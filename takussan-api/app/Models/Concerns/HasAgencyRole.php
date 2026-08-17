<?php

namespace App\Models\Concerns;

use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Services\Membership\AgencyRoleCapabilityCache;
use App\Services\Membership\AgencySystemRoleSeeder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;
use LogicException;

/**
 * TCK-279 — porté par les profils métier agence-scopés
 * (`AgentProfile`, `AgencyAdminProfile`, `OwnerProfile`), et depuis
 * TCK-315 (ADR-0016) par `ServiceProviderAgencyCollaboration`.
 *
 * ⚠️ Ce trait **n'est pas** `HasRoles`. `spatie/laravel-permission` a été
 * désinstallé par TCK-278 (ADR-0002) et une garde d'`api-ci.yml` casse sur
 * tout import de son namespace. Le mécanisme ici est maison, et la Règle 6
 * le rend volontairement plus pauvre que celui du paquet retiré : **un
 * profil porte exactement un rôle** (`agency_role_id` NOT NULL), pas une
 * collection.
 *
 * `ServiceProviderProfile` ne le porte **toujours** pas, et ce n'est pas un
 * reste : il est user-scopé (`user_id` UNIQUE, aucune colonne `agency_id`)
 * et collabore avec N agences. C'est sa COLLABORATION qui porte le rôle —
 * une par agence. La Règle 6 s'y lit « 1 collaboration = 1 rôle ». Voir
 * ADR-0016 et la migration 090000 de TCK-315.
 */
trait HasAgencyRole
{
    /**
     * `agency_role_id` est NOT NULL (Règle 6). Plutôt que d'exiger de
     * chacun des ~40 sites de création qu'il pense au pointeur — et de
     * découvrir l'oubli en production sur une contrainte violée — le profil
     * qui n'en déclare pas reçoit le **rôle système de son type dans son
     * agence**, exactement ce que prescrit la spec :
     * « Tout profil créé reçoit par défaut le AgencyRole système de son type ».
     */
    protected static function bootHasAgencyRole(): void
    {
        static::creating(static function ($model): void {
            if ($model->agency_role_id !== null || $model->agency_id === null) {
                return;
            }

            $model->agency_role_id = app(AgencySystemRoleSeeder::class)
                ->systemRoleFor((int) $model->agency_id, static::agencyRoleBaseType())
                ->id;
        });
    }

    /**
     * Type de rôle attendu par ce modèle de profil, dérivé de la table de
     * correspondance de l'enum — il n'y a donc qu'un endroit à tenir à jour.
     *
     * Un porteur qui n'est pas un profil surcharge cette méthode :
     * `ServiceProviderAgencyCollaboration` le fait, parce que
     * `AgencyRoleBaseType::profileClass()` rend `null` pour son type — à
     * juste titre, cette table ne connaît que les profils.
     */
    public static function agencyRoleBaseType(): AgencyRoleBaseType
    {
        foreach (AgencyRoleBaseType::cases() as $type) {
            if ($type->profileClass() === static::class) {
                return $type;
            }
        }

        throw new LogicException(static::class.' porte HasAgencyRole sans entrée dans AgencyRoleBaseType.');
    }

    public function agencyRole(): BelongsTo
    {
        return $this->belongsTo(AgencyRole::class);
    }

    /**
     * Capacités effectives du profil = celles de son rôle. Pas d'union,
     * pas d'héritage : Règle 6.
     *
     * @return Collection<int,Capability>
     */
    public function capabilities(): Collection
    {
        $roleId = $this->agency_role_id;
        if ($roleId === null) {
            return new Collection;
        }

        return collect(app(AgencyRoleCapabilityCache::class)->values((int) $roleId))
            ->map(static fn (string $value): ?Capability => Capability::tryFrom($value))
            ->filter()
            ->values();
    }

    public function hasCapability(Capability $capability): bool
    {
        $roleId = $this->agency_role_id;
        if ($roleId === null) {
            return false;
        }

        return app(AgencyRoleCapabilityCache::class)->allows((int) $roleId, $capability);
    }
}
