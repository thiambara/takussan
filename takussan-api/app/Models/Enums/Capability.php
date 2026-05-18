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
}
