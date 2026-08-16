<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;

/**
 * TCK-278 — Résolveur de capacités. Mappe `(User, Capability, ?Agency)` →
 * bool en consultant les profils du user.
 *
 * Phase 1 (TCK-278) : table de vérité code-defined par type de profil.
 * Phase 2 (TCK-279) : consultera le pivot `agency_role_capabilities` ;
 * **la signature publique de cette classe ne bouge pas** pour que les
 * 500+ call sites créés en P2/P3 restent stables.
 *
 * Modèle additif : si plusieurs profils dans la même agence accordent la
 * capacité, l'autorisation est OR (au moins un profil suffit).
 */
class MembershipCapabilityResolver
{
    /**
     * @return bool Vrai si l'un des profils actifs du user — plateforme ou
     *              dans l'agence cible — accorde la capacité demandée.
     */
    public function allows(User $user, Capability $capability, ?Agency $agency = null): bool
    {
        $platform = $this->resolvePlatform($user, $capability);
        if ($platform === true) {
            return true;
        }

        if ($agency === null) {
            return false;
        }

        return $this->resolveAgencyScoped($user, $capability, $agency);
    }

    /**
     * Branche PlatformProfile. `super_admin` court-circuite tout ; `support`
     * et `viewer` ont une liste blanche restreinte.
     */
    private function resolvePlatform(User $user, Capability $capability): bool
    {
        $profile = $user->relationLoaded('platformProfile')
            ? $user->platformProfile
            : $user->platformProfile()->active()->first();

        if ($profile === null || ! $profile->isActive()) {
            return false;
        }

        return match ($profile->level) {
            PlatformProfileLevel::SuperAdmin => true,
            PlatformProfileLevel::Support => in_array($capability, [
                Capability::CrmViewAll,
                Capability::CrmExport,
                Capability::PaymentsExport,
                Capability::ReportsViewGlobal,
                Capability::ReportsExport,
                Capability::MessagingArchive,
            ], true),
            PlatformProfileLevel::Viewer => in_array($capability, [
                Capability::ReportsViewGlobal,
            ], true),
        };
    }

    /**
     * Branche agency-scoped. On agrège les capacités accordées par chaque
     * type de profil actif du user dans `$agency` (modèle additif).
     */
    private function resolveAgencyScoped(User $user, Capability $capability, Agency $agency): bool
    {
        $agencyId = (int) $agency->id;

        if ($user->isAgencyAdminAt($agencyId) && $this->agencyAdminAllows($capability)) {
            return true;
        }

        if ($user->isAgentAt($agencyId) && $this->agentAllows($capability)) {
            return true;
        }

        if ($user->isOwnerAt($agencyId) && $this->ownerAllows($capability)) {
            return true;
        }

        if ($user->isProviderAt($agencyId) && $this->serviceProviderAllows($capability)) {
            return true;
        }

        return false;
    }

    // =====================================================================
    // TABLE DE VÉRITÉ PHASE 1 — ÉCART MESURÉ AVEC LE MAPPING SPATIE
    // =====================================================================
    //
    // Les contraintes strictes de TCK-278 disaient : « la table de vérité
    // phase 1 reproduit le mapping actuel rôle spatie → permissions ».
    // **Elle ne le reproduit pas.** Ce qui suit est le diff mesuré, sourcé, et
    // la décision prise. Il est écrit ICI et pas dans un ticket clos parce que
    // TCK-279 va SEEDER cette table en lignes `agency_role_capabilities` pour
    // chaque agence : ce qui n'est aujourd'hui qu'un fait de code deviendra
    // une donnée persistée, visible dans l'UI, et clonée à chaque rôle custom.
    //
    // SOURCE de l'ancien mapping — dernier état avant le cutover :
    //   git show 33ce4f69^:takussan-api/database/seeders/System/RolesAndPermissionsSeeder.php
    //
    //   agency_admin : view/create/update/delete × {properties, bookings,
    //       leases, lease_payments, customers, conversations, messages,
    //       maintenance_requests, property_visits, documents, saved_searches,
    //       reviews} + leases.{refund_deposit,renew,terminate,rent_review,
    //       rent_review_force} + roles.manage_in_agency + invite_owner
    //       + manage_team + invite_service_provider
    //   agent        : view/create/update × {properties, bookings, leases,
    //       customers, conversations, messages, property_visits, documents,
    //       saved_searches, reviews} + leases.{refund_deposit,renew,
    //       terminate,rent_review}
    //   owner        : view/create/update × {properties, bookings, leases,
    //       lease_payments, conversations, messages, maintenance_requests,
    //       property_visits, documents, reviews} + leases.{refund_deposit,
    //       renew,terminate,rent_review,rent_review_force}
    //   service_provider : view/update × {maintenance_requests,
    //       conversations, messages, documents}
    //
    // RÈGLE DE CORRESPONDANCE. Les deux vocabulaires ne sont PAS isomorphes :
    // l'ancien était une grille CRUD `{ressource}.{view|create|update|delete}`,
    // le nouveau est un catalogue de verbes métier. Seules **10** des 44
    // capacités portent une chaîne identique à une permission spatie
    // (properties.create, properties.delete, leases.create, leases.terminate,
    // leases.renew, leases.refund_deposit, leases.rent_review,
    // leases.rent_review_force, invoices.create, payouts.create). Le diff
    // ci-dessous ne classe donc en RETIRÉ / AJOUTÉ que les cas objectifs :
    // identité de chaîne, ou famille de ressources entièrement absente de
    // l'ancien grant du rôle. Le reste est du vocabulaire neuf, sans
    // antécédent — ni retrait ni élargissement, une comparaison impossible.
    //
    // ---------------------------------------------------------------------
    // RETIRÉ — `owner` : 7 capacités que le rôle spatie portait sous un nom
    // IDENTIQUE, et que `ownerAllows()` n'accorde plus (il ne garde que
    // properties.update_own) :
    //     properties.create · leases.create · leases.terminate ·
    //     leases.renew · leases.refund_deposit · leases.rent_review ·
    //     leases.rent_review_force
    //
    // Amortissement PARTIEL, et par du code, pas par une capacité :
    // `LeasePolicy` court-circuite sur `$user->id === $lease->landlord_id`,
    // donc un owner conserve SES baux. Il perd ceux d'un AUTRE bailleur de
    // son agence. `leases.rent_review_force` n'a PAS ce court-circuit
    // (RentReviewService.php:89) : l'owner le perd sans amortissement.
    // Ce court-circuit ne survivra pas à une lecture naïve « le rôle dit ce
    // que l'owner peut faire » : TCK-279 doit le rendre explicite ou le
    // convertir en capacité.
    //
    // ---------------------------------------------------------------------
    // AJOUTÉ — `agent` : 5 capacités dont la famille de ressources était
    // ENTIÈREMENT absente de son grant spatie (ni lease_payments, ni
    // invoices, ni maintenance_requests) :
    //     payments.record · invoices.create · invoices.send ·
    //     maintenance.assign · maintenance.close
    //
    // ---------------------------------------------------------------------
    // AJOUTÉ — `agency_admin` : 7 capacités dont la famille de ressources
    // était ENTIÈREMENT absente de son grant spatie (ni agencies, ni
    // invoices, ni payouts, ni users, ni reports) :
    //     agency.update · invoices.create · invoices.write_off ·
    //     invoices.send · payouts.create · payouts.approve · reports.export
    //
    // C'est le plus gros écart : `agencyAdminAllows()` accorde 42 des 44
    // capacités par une liste NOIRE de 2, là où le rôle spatie fonctionnait
    // par liste blanche. Le passage d'une liste blanche à une liste noire
    // n'est pas un détail d'écriture — il inverse le défaut : toute capacité
    // AJOUTÉE à l'enum à l'avenir sera accordée à l'agency_admin sans
    // qu'aucune décision ne soit prise.
    //
    // ---------------------------------------------------------------------
    // DÉCISION (phase 1, TCK-278). On ACTE la table telle qu'elle est, sans
    // la corriger ici : la corriger maintenant changerait le comportement de
    // 6 sites d'appel de production sur la foi d'une comparaison entre deux
    // vocabulaires non isomorphes, et le mapping spatie n'a lui-même jamais
    // tourné en production (D-04 / TCK-288 : jamais déployée). L'écart est
    // documenté et **rendu exécutable** — un cas de test par capacité retirée
    // ou ajoutée dans `MembershipCapabilityResolverTest` — pour qu'il ne
    // puisse plus bouger en silence.
    //
    // MANDAT POUR TCK-279, avant tout seed :
    //   1. rebasculer `agencyAdminAllows()` en liste blanche explicite ;
    //   2. trancher les 7 capacités retirées à `owner` (les rendre, ou
    //      assumer le court-circuit `landlord_id` en le nommant) ;
    //   3. ne seeder qu'après (1) et (2) — un élargissement gravé en base
    //      pour chaque agence ne se rattrape pas par un correctif de code.
    // =====================================================================

    /**
     * `agency_admin` reçoit tout sur son agence en phase 1 — sauf les
     * capacités strictement plateforme.
     *
     * ⚠️ Liste NOIRE : toute capacité ajoutée à l'enum lui est accordée par
     * défaut. Cf. le bloc « TABLE DE VÉRITÉ PHASE 1 » ci-dessus.
     */
    private function agencyAdminAllows(Capability $capability): bool
    {
        // L'agency_admin couvre tout le périmètre opérationnel agence ; les
        // opérations strictement plateforme (ex. modération transversale)
        // restent réservées aux PlatformProfile.
        return ! in_array($capability, [
            Capability::PropertiesModerate,
            Capability::ReportsViewGlobal,
        ], true);
    }

    private function agentAllows(Capability $capability): bool
    {
        return in_array($capability, [
            Capability::PropertiesCreate,
            Capability::PropertiesUpdateOwn,
            Capability::PropertiesPublish,
            Capability::BookingsValidate,
            Capability::BookingsCancel,
            Capability::LeasesCreate,
            Capability::LeasesSign,
            Capability::LeasesRenew,
            Capability::LeasesTerminate,
            Capability::LeasesRefundDeposit,
            Capability::LeasesRentReview,
            Capability::PaymentsRecord,
            Capability::InvoicesCreate,
            Capability::InvoicesSend,
            Capability::CrmViewAll,
            Capability::CrmAssign,
            Capability::MaintenanceAssign,
            Capability::MaintenanceClose,
        ], true);
    }

    /**
     * ⚠️ Le rôle spatie `owner` portait 7 capacités de plus, sous des noms
     * identiques. Cf. le bloc « TABLE DE VÉRITÉ PHASE 1 » ci-dessus : le
     * retrait est amorti — partiellement — par le court-circuit
     * `landlord_id` de `LeasePolicy`, qui est du code et non une capacité.
     */
    private function ownerAllows(Capability $capability): bool
    {
        return $capability === Capability::PropertiesUpdateOwn;
    }

    private function serviceProviderAllows(Capability $capability): bool
    {
        return in_array($capability, [
            Capability::MaintenanceAssign,
            Capability::MaintenanceClose,
        ], true);
    }
}
