<?php

namespace App\Models\Enums;

/**
 * Catalogue code-defined des capacités atomiques de la plateforme (TCK-278).
 *
 * Chaque entrée a la forme `<domain>.<verb>`. Le `MembershipCapabilityResolver`
 * mappe `(Capability, ProfileType) → bool` en phase 1 ; en phase 2 (TCK-279) la
 * résolution passera par le pivot `agency_role_capabilities`.
 *
 * Cf. spec models-spec.md « Catalogue Capability ».
 */
enum Capability: string
{
    // agency.*
    case AgencyUpdate = 'agency.update';
    case AgencyUpdateKyc = 'agency.update_kyc';
    case AgencyUpdateBilling = 'agency.update_billing';
    case AgencyUpgradeRequest = 'agency.upgrade_request';

    // team.*
    case TeamInvite = 'team.invite';
    case TeamAssignRole = 'team.assign_role';
    case TeamRemove = 'team.remove';
    case TeamSuspend = 'team.suspend';
    /**
     * TCK-395 — déléguer temporairement un rôle dans l'agence.
     *
     * Le catalogue n'avait AUCUN cas `delegations.*` / `team.delegate_*` :
     * `RoleDelegationPolicy` gardait par TYPE DE PROFIL
     * (`$user->isAgencyAdminAt(...)`), ce qui contredit le principe n°1 dans
     * son versant opérationnel — *une capacité se juge pour un couple
     * (utilisateur, agence)*, pas sur la présence d'un profil. L'écran de
     * TCK-369 gardait son bouton par `team.assign_role` faute de mieux :
     * l'écran et la policy ne posaient donc pas la même question, et c'est
     * la policy qui décidait.
     */
    case TeamDelegateRole = 'team.delegate_role';

    // properties.*
    case PropertiesCreate = 'properties.create';
    case PropertiesUpdateAny = 'properties.update_any';
    case PropertiesUpdateOwn = 'properties.update_own';
    case PropertiesDelete = 'properties.delete';
    case PropertiesPublish = 'properties.publish';
    case PropertiesModerate = 'properties.moderate';

    // bookings.*
    case BookingsValidate = 'bookings.validate';
    case BookingsCancel = 'bookings.cancel';
    case BookingsRefund = 'bookings.refund';

    // leases.*
    case LeasesCreate = 'leases.create';
    case LeasesSign = 'leases.sign';
    case LeasesTerminate = 'leases.terminate';
    case LeasesRenew = 'leases.renew';
    case LeasesRefundDeposit = 'leases.refund_deposit';
    case LeasesRentReview = 'leases.rent_review';
    case LeasesRentReviewForce = 'leases.rent_review_force';

    // payments.*
    case PaymentsRecord = 'payments.record';
    case PaymentsRefund = 'payments.refund';
    case PaymentsExport = 'payments.export';

    // invoices.*
    case InvoicesCreate = 'invoices.create';
    case InvoicesWriteOff = 'invoices.write_off';
    case InvoicesSend = 'invoices.send';

    // payouts.*
    case PayoutsCreate = 'payouts.create';
    case PayoutsApprove = 'payouts.approve';

    // crm.*
    case CrmViewAll = 'crm.view_all';
    case CrmExport = 'crm.export';
    case CrmAssign = 'crm.assign';

    // maintenance.*
    case MaintenanceAssign = 'maintenance.assign';
    case MaintenanceClose = 'maintenance.close';

    // messaging.*
    case MessagingBroadcast = 'messaging.broadcast';
    case MessagingArchive = 'messaging.archive';

    // reports.*
    case ReportsViewGlobal = 'reports.view_global';
    case ReportsExport = 'reports.export';

    // roles.*
    case RolesCreateCustom = 'roles.create_custom';
    case RolesEditCustom = 'roles.edit_custom';
    case RolesDeleteCustom = 'roles.delete_custom';

    /**
     * Domaine (préfixe avant le premier `.`) — utilisé par l'UI TCK-279 pour
     * grouper les capacités dans la matrice d'édition.
     */
    public function domain(): string
    {
        return explode('.', $this->value, 2)[0];
    }

    /**
     * Capacités réservées à la PLATEFORME — aucun `AgencyRole` ne peut les
     * porter, système ou personnalisé.
     *
     * ⚠️ Cette liste vivait en trois exemplaires — le docblock de
     * `MembershipCapabilityResolver`, la liste noire de
     * `SystemRoleCapabilities::agencyAdmin()`, et un commentaire de
     * `AgencyRolePolicy` — et n'était appliquée nulle part **à l'écriture**.
     * Mesuré : un `agency_admin` créait un rôle personnalisé, y posait
     * `properties.moderate` par `PUT .../capabilities` (la validation
     * acceptait tout cas de l'enum), s'y réaffectait par
     * `PATCH /profiles/{p}/agency-role` — toutes opérations couvertes par ses
     * propres capacités — et `canActAt(PropertiesModerate, $agency)` rendait
     * alors `true`. Le seed excluait ces deux capacités ; rien n'empêchait de
     * les rajouter après.
     *
     * Aucun site d'appel de production ne les lit encore, l'escalade était
     * donc latente : c'est le moment de la fermer, avant que le premier
     * appelant ne la rende réelle.
     *
     * @return array<int,self>
     */
    public static function platformReserved(): array
    {
        return [
            self::PropertiesModerate,
            self::ReportsViewGlobal,
        ];
    }

    public function isPlatformReserved(): bool
    {
        return in_array($this, self::platformReserved(), true);
    }

    /**
     * Les capacités qu'un `AgencyRole` peut porter — le catalogue moins les
     * réservées plateforme.
     *
     * @return array<int,self>
     */
    public static function agencyAssignable(): array
    {
        return array_values(array_filter(
            self::cases(),
            static fn (self $c): bool => ! $c->isPlatformReserved(),
        ));
    }
}
