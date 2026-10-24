<?php

namespace App\Services\Permissions;

use App\Events\Permissions\RoleDelegationActivated;
use App\Events\Permissions\RoleDelegationCreated;
use App\Events\Permissions\RoleDelegationExpired;
use App\Events\Permissions\RoleDelegationRevoked;
use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Support\FinInclusive;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-278 — Service profile-based, sans spatie.
 *
 * Le rôle d'un user est désormais la présence d'un profil polymorphe
 * (cf. Règle 5 du models-spec). Une `RoleDelegation` active accorde
 * temporairement les capacités d'un rôle additionnel à un user.
 *
 * La résolution d'autorisation se fait via `$user->canActAt($capability,
 * $agency)` → {@see MembershipCapabilityResolver}.
 *
 * ⚠ **Ce bloc désignait `hasActiveAgencyDelegation()` comme LE chemin de
 * résolution, et c'était devenu faux** (relevé par la passe adverse de
 * TCK-395 — le fichier le plus probable pour qui vient lire comment la
 * délégation autorise était aussi celui qui en donnait la version périmée).
 * Cette méthode n'a plus aucun appelant de production ; elle est un prédicat
 * d'état sur la table, pas un contrôle d'autorisation, et son docblock le dit.
 *
 * Depuis TCK-395, une délégation active accorde une capacité si le **rôle
 * système** du type délégué la porte dans cette agence, ET si le **délégant la
 * détient en propre**. Une délégation n'accorde donc jamais plus que son
 * auteur, et n'est pas transitive.
 *
 * ⚠ Ce service ne vérifie toujours PAS, à la création, que le rôle délégué
 * tient dans les capacités du délégant : la borne est appliquée à la LECTURE,
 * délibérément (elle suit le délégant s'il est dépouillé après coup). Une
 * délégation peut donc être écrite et n'accorder qu'une partie de ce que son
 * `role` nomme.
 *
 * Ce service ne touche plus aux tables `model_has_roles` / `roles` :
 * la délégation est intégralement portée par la table `role_delegations`.
 */
class RoleDelegationService
{
    public function create(Agency $agency, User $delegator, array $data): RoleDelegation
    {
        $userId = $data['user_id'];
        $role = $data['role'];

        /** @var User $user */
        $user = User::findOrFail($userId);

        if ($user->id === $delegator->id) {
            throw ValidationException::withMessages([
                'user_id' => __('role_delegations.validation.self_delegation'),
            ]);
        }

        // TCK-146 — membership is profile-driven; the legacy single-agency
        // accessor is null for multi-profile users without an active context
        // and would falsely reject an otherwise-valid delegation target.
        // TCK-587 — APPARTENANCE du délégataire, sans filtre de statut.
        // TCK-2202 (ADR-0031, amendement du 2026-10-24, § A, point 5) — voulu : vers un délégué
        // sans profil actif (suspendu, bailleur bloqué), la délégation se crée et reste INERTE
        // (`RoleDelegation::scopeEnVigueur`) jusqu'à son retour ; elle peut ainsi préparer un retour.
        if (! $user->hasProfileAt((int) $agency->id, AgentProfile::class)
            && ! $user->hasProfileAt((int) $agency->id, OwnerProfile::class)) {
            throw ValidationException::withMessages([
                'user_id' => __('role_delegations.validation.user_not_in_agency'),
            ]);
        }

        if ($role === 'agency_admin') {
            $isPrimaryAdminOfAnyAgency = Agency::where('primary_admin_id', $user->id)->exists();
            if ($isPrimaryAdminOfAnyAgency) {
                throw ValidationException::withMessages([
                    'role' => __('role_delegations.validation.already_primary_admin'),
                ]);
            }
        }

        return DB::transaction(function () use ($agency, $delegator, $user, $data) {
            $startsAt = $data['starts_at'] ?? null;
            $isImmediate = is_null($startsAt) || now()->gte($startsAt);

            $status = $isImmediate ? RoleDelegationStatus::Active : RoleDelegationStatus::Scheduled;

            // TCK-278 — Snapshot des « rôles natifs » : on enregistre la
            // liste des profils polymorphes que le user détient déjà dans
            // l'agence. Audit-only ; ne change pas la résolution
            // d'autorisation (toujours profile-based).
            $nativeRoles = $this->nativeProfileTypes($user, $agency);

            /** @var RoleDelegation $delegation */
            $delegation = RoleDelegation::create([
                'user_id' => $user->id,
                'delegator_id' => $delegator->id,
                'agency_id' => $agency->id,
                'role' => $data['role'],
                'starts_at' => $startsAt,
                'ends_at' => FinInclusive::de($data['ends_at']),
                'status' => $status,
                'reason' => $data['reason'] ?? null,
                'user_native_roles_snapshot' => $nativeRoles,
                'activated_at' => $isImmediate ? now() : null,
            ]);

            if ($isImmediate) {
                event(new RoleDelegationActivated($delegation));
            }

            event(new RoleDelegationCreated($delegation));

            activity()
                ->causedBy($delegator)
                ->performedOn($delegation)
                ->withProperties(['role' => $data['role']])
                ->event('created')
                ->log('role_delegation.created');

            return $delegation;
        });
    }

    /**
     * P211.06 (TCK-2111) — `revoke`, `activate` et `expire` relisent la délégation sous verrou dans
     * leur transaction et jugent le statut sur elle. Jugé sur le modèle reçu, la tâche planifiée,
     * qui charge ses délégations avant de les traiter, réactivait une délégation qu'un admin venait
     * de révoquer, et prévenait le délégataire. Le modèle reçu est rafraîchi après une transition
     * faite : il portait le statut neuf avant, ses appelants peuvent le relire.
     */
    public function revoke(RoleDelegation $delegation, User $caller): void
    {
        $this->transition($delegation, [RoleDelegationStatus::Active, RoleDelegationStatus::Scheduled], function (RoleDelegation $locked) use ($caller): void {
            $locked->markRevoked($caller);

            event(new RoleDelegationRevoked($locked));

            activity()
                ->causedBy($caller)
                ->performedOn($locked)
                ->withProperties(['role' => $locked->role])
                ->event('revoked')
                ->log('role_delegation.revoked');
        });
    }

    public function activate(RoleDelegation $delegation): void
    {
        $this->transition($delegation, [RoleDelegationStatus::Scheduled], function (RoleDelegation $locked): void {
            $locked->markActive();

            event(new RoleDelegationActivated($locked));

            activity()
                ->causedBy($locked->user)
                ->performedOn($locked)
                ->withProperties(['role' => $locked->role, 'agency_id' => $locked->agency_id])
                ->event('activated')
                ->log('role_delegation.activated');
        });
    }

    public function expire(RoleDelegation $delegation): void
    {
        $this->transition($delegation, [RoleDelegationStatus::Active], function (RoleDelegation $locked): void {
            $locked->markExpired();

            event(new RoleDelegationExpired($locked));

            activity()
                ->causedBy($locked->user)
                ->performedOn($locked)
                ->withProperties(['role' => $locked->role, 'agency_id' => $locked->agency_id])
                ->event('expired')
                ->log('role_delegation.expired');
        });
    }

    /**
     * @param  list<RoleDelegationStatus>  $from  les statuts d'où le geste part ; ailleurs, il ne fait rien
     * @param  callable(RoleDelegation): void  $geste
     */
    private function transition(RoleDelegation $delegation, array $from, callable $geste): void
    {
        // Le contrôle sur le modèle reçu évite le verrou quand il refuse déjà ; seul celui sur la
        // ligne relue fait foi.
        if (! in_array($delegation->status, $from, true)) {
            return;
        }

        $done = DB::transaction(function () use ($delegation, $from, $geste): bool {
            $locked = RoleDelegation::query()->whereKey($delegation->getKey())->lockForUpdate()->first();
            if ($locked === null || ! in_array($locked->status, $from, true)) {
                return false;
            }

            $geste($locked);

            return true;
        });

        if ($done) {
            $delegation->refresh();
        }
    }

    /**
     * @return list<string> Liste des « rôles natifs » du user dans l'agence,
     *                      dérivée de la présence de profils polymorphes.
     */
    private function nativeProfileTypes(User $user, Agency $agency): array
    {
        $types = [];
        // TCK-587 — les profils POSSÉDÉS, quel que soit leur statut : c'est une appartenance.
        if ($user->hasProfileAt((int) $agency->id, AgencyAdminProfile::class)) {
            $types[] = 'agency_admin';
        }
        if ($user->hasProfileAt((int) $agency->id, AgentProfile::class)) {
            $types[] = 'agent';
        }
        if ($user->hasProfileAt((int) $agency->id, OwnerProfile::class)) {
            $types[] = 'owner';
        }

        return $types;
    }
}
