<?php

namespace App\Support\Security;

use App\Http\Controllers\AgentOnboardingController;
use App\Http\Controllers\Api\Accounting\BankCsvMappingController;
use App\Http\Controllers\Api\Accounting\BankStatementController;
use App\Http\Controllers\Api\Accounting\BankStatementLineController;
use App\Http\Controllers\Api\Accounting\BankStatementPreviewController;
use App\Http\Controllers\Api\Accounting\FinalizeBankStatementController;
use App\Http\Controllers\Api\Accounting\ReconciliationIgnoredPaymentController;
use App\Http\Controllers\Api\Agency\AgencyUpgradeRequestController;
use App\Http\Controllers\Api\Agency\KycController;
use App\Http\Controllers\Api\Agency\RegenerateWatermarksController;
use App\Http\Controllers\Api\Agency\TeamMemberController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\BookingCounterOfferController;
use App\Http\Controllers\Api\BookingDossierController;
use App\Http\Controllers\Api\BookingGuarantorController;
use App\Http\Controllers\Api\BookingPaymentController;
use App\Http\Controllers\Api\CalendarFeedController;
use App\Http\Controllers\Api\ContactGestureController;
use App\Http\Controllers\Api\ContactLeadController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\ConversationParticipantController;
use App\Http\Controllers\Api\ConversationReportController;
use App\Http\Controllers\Api\Credits\AgencySpotlightController;
use App\Http\Controllers\Api\Credits\PropertyBoostController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerInvitationController;
use App\Http\Controllers\Api\CustomerNoteController;
use App\Http\Controllers\Api\CustomerTagController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\DocumentPdfController;
use App\Http\Controllers\Api\DocumentShareLinkController;
use App\Http\Controllers\Api\DocumentVaultArchiveController;
use App\Http\Controllers\Api\DocumentVersionController;
use App\Http\Controllers\Api\FavoriteController;
use App\Http\Controllers\Api\GeoLinkController;
use App\Http\Controllers\Api\GuarantorController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\KpiConfigController;
use App\Http\Controllers\Api\LeaseController;
use App\Http\Controllers\Api\LeaseEarlyTerminationController;
use App\Http\Controllers\Api\LeasePaymentController;
use App\Http\Controllers\Api\LeasePaymentLinkController;
use App\Http\Controllers\Api\LeasePaymentReminderController;
use App\Http\Controllers\Api\LeaseRenewalController;
use App\Http\Controllers\Api\MaintenanceOwnerReminderController;
use App\Http\Controllers\Api\MaintenanceQuoteAlternativeController;
use App\Http\Controllers\Api\MaintenanceQuoteController;
use App\Http\Controllers\Api\MaintenanceRequestController;
use App\Http\Controllers\Api\MaintenanceRescheduleRequestController;
use App\Http\Controllers\Api\Me\AgentProfileController;
use App\Http\Controllers\Api\Me\DataExportController;
use App\Http\Controllers\Api\Me\MeAgencyController;
use App\Http\Controllers\Api\Me\MeController;
use App\Http\Controllers\Api\Me\MeProfilesController;
use App\Http\Controllers\Api\Me\ServiceProviderProfileController;
use App\Http\Controllers\Api\Me\TenantOnboardingChecklistController;
use App\Http\Controllers\Api\MediaController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\NotificationPreferenceController;
use App\Http\Controllers\Api\OwnerProfileController;
use App\Http\Controllers\Api\PaymentGatewayController;
use App\Http\Controllers\Api\PropertyAvailabilityCheckController;
use App\Http\Controllers\Api\PropertyCalendarFeedController;
use App\Http\Controllers\Api\PropertyCollaboratorController;
use App\Http\Controllers\Api\PropertyContactController;
use App\Http\Controllers\Api\PropertyController;
use App\Http\Controllers\Api\PropertyIcalTokenController;
use App\Http\Controllers\Api\PropertyMediaController;
use App\Http\Controllers\Api\PropertyOwnerController;
use App\Http\Controllers\Api\PropertyTagController;
use App\Http\Controllers\Api\PropertyUnavailabilityController;
use App\Http\Controllers\Api\PropertyVisitController;
use App\Http\Controllers\Api\PublicPaymentLinkController;
use App\Http\Controllers\Api\PublicSearchAlertController;
use App\Http\Controllers\Api\SavedSearchController;
use App\Http\Controllers\Api\ServiceProviderBillController;
use App\Http\Controllers\Api\ServiceProviderCollaborationController;
use App\Http\Controllers\Api\TagController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\ThresholdAlertController;
use App\Http\Controllers\Api\Webhooks\PaymentWebhookController;
use App\Http\Controllers\HostAutoOnboardController;
use App\Http\Controllers\HostOnboardingController;
use App\Http\Controllers\NotificationUnsubscribeController;
use App\Http\Controllers\OwnerOnboardingController;
use App\Http\Controllers\Public\InvitationAcceptController;
use App\Http\Controllers\Public\InvitationCodeController;
use App\Http\Controllers\Public\InvitationRenewalRequestController;
use App\Http\Controllers\Public\PublicAgentController;
use App\Http\Controllers\Public\PublicPropertyController;
use App\Http\Controllers\Public\PublicReviewController;
use App\Http\Controllers\Public\PublicSponsoredImpressionController;
use App\Http\Controllers\Public\RadarClaimController;
use App\Http\Controllers\ServiceProviderOnboardingController;
use App\Http\Controllers\Webhook\MtargetSmsStatusController;
use App\Http\Controllers\Webhook\OrangeSmsStatusController;
use App\Http\Controllers\Webhook\RadarWhatsappWebhookController;
use App\Http\Controllers\Webhook\WhatsappStatusController;
use App\Http\Controllers\WelcomeViewController;
use App\Http\Controllers\WizardDraftController;
use App\Http\Middleware\RequireTwoFactor;

/**
 * TCK-609 (ADR-0033 §8, amendement du 2026-11-16 ; option (b) du porteur) — le REGISTRE de chaque
 * route mutante sous `/api` qu'un profil plateforme atteint SANS qu'une liste de
 * {@see ProtectedActions} la garde : ni la console (`/api/admin/*`), ni `/api/auth/*` (s'enrôler,
 * se vérifier), ni `AGENCY_TWO_FACTOR` (et sa variante conditionnelle), `STEP_UP`,
 * `STEP_UP_FOR_PLATFORM`, `PLATFORM_TWO_FACTOR`, ni leurs exemptions motivées.
 *
 * Lu par la seule garde (`ProtectedActionsCoverageTest`), jamais par
 * {@see RequireTwoFactor} : il ne change AUCUN comportement. Il rend la
 * décision (b) explicite route par route. Une route ajoutée demain qui n'est rangée nulle part
 * rougit avec son nom : on la garde (une liste) ou on l'écrit ici, avec son motif.
 *
 * `NON_GARDE` dit ce qu'il est — un pouvoir plateforme que `Gate::before` ouvre encore au
 * super-admin sans second facteur — et n'est pas une exemption de confort : pour garder l'une de
 * ces routes, la retirer d'ici et l'inscrire dans `PLATFORM_TWO_FACTOR`.
 */
final class PlatformAnyRouteExempt
{
    public const PUBLIC = 'route publique : l\'acte tient à un jeton, un lien ou une signature de webhook, pas au rôle de l\'appelant';

    public const SOI = 'le compte agit pour lui-même : il ne vise la ressource de personne d\'autre';

    public const SANS_ECRITURE = 'aperçu ou résolution sans écriture : rien n\'est changé';

    public const NON_GARDE = 'pouvoir plateforme NON gardé, décision (b) du porteur du 2026-11-16 (ADR-0033 §8) : Gate::before l\'ouvre au super-admin sans second facteur';

    /** @var array<string, string> */
    public const ACTIONS = [
        AgentOnboardingController::class.'@complete' => self::SOI,
        BankCsvMappingController::class.'@update' => self::NON_GARDE,
        BankStatementController::class.'@store' => self::NON_GARDE,
        BankStatementLineController::class.'@confirmBatch' => self::NON_GARDE,
        BankStatementLineController::class.'@ignore' => self::NON_GARDE,
        BankStatementLineController::class.'@match' => self::NON_GARDE,
        BankStatementLineController::class.'@unmatch' => self::NON_GARDE,
        BankStatementPreviewController::class.'@__invoke' => self::SANS_ECRITURE,
        FinalizeBankStatementController::class.'@__invoke' => self::NON_GARDE,
        ReconciliationIgnoredPaymentController::class.'@destroy' => self::NON_GARDE,
        ReconciliationIgnoredPaymentController::class.'@store' => self::NON_GARDE,
        \App\Http\Controllers\Api\Admin\BookingController::class.'@expireNow' => self::NON_GARDE,
        AgencyUpgradeRequestController::class.'@destroy' => self::NON_GARDE,
        AgencyUpgradeRequestController::class.'@store' => self::NON_GARDE,
        KycController::class.'@submit' => self::NON_GARDE,
        KycController::class.'@upload' => self::NON_GARDE,
        RegenerateWatermarksController::class.'@__invoke' => self::NON_GARDE,
        TeamMemberController::class.'@remindTwoFactor' => self::NON_GARDE,
        AnnouncementController::class.'@dismiss' => self::SOI,
        BookingController::class.'@cancel' => self::NON_GARDE,
        BookingController::class.'@confirm' => self::NON_GARDE,
        BookingController::class.'@reject' => self::NON_GARDE,
        BookingController::class.'@store' => self::NON_GARDE,
        BookingCounterOfferController::class.'@accept' => self::NON_GARDE,
        BookingCounterOfferController::class.'@decline' => self::NON_GARDE,
        BookingCounterOfferController::class.'@store' => self::NON_GARDE,
        BookingDossierController::class.'@requestPiece' => self::NON_GARDE,
        BookingDossierController::class.'@upload' => self::NON_GARDE,
        BookingGuarantorController::class.'@destroy' => self::NON_GARDE,
        BookingGuarantorController::class.'@store' => self::NON_GARDE,
        BookingPaymentController::class.'@store' => self::NON_GARDE,
        CalendarFeedController::class.'@destroy' => self::SOI,
        CalendarFeedController::class.'@store' => self::SOI,
        ContactGestureController::class.'@forCustomer' => self::NON_GARDE,
        ContactGestureController::class.'@forLead' => self::NON_GARDE,
        ContactLeadController::class.'@assign' => self::NON_GARDE,
        ContactLeadController::class.'@convert' => self::NON_GARDE,
        ContactLeadController::class.'@handle' => self::NON_GARDE,
        ContactLeadController::class.'@unhandle' => self::NON_GARDE,
        ConversationController::class.'@archive' => self::NON_GARDE,
        ConversationController::class.'@markAsRead' => self::NON_GARDE,
        ConversationController::class.'@markAsUnread' => self::NON_GARDE,
        ConversationController::class.'@sendMessage' => self::NON_GARDE,
        ConversationController::class.'@store' => self::NON_GARDE,
        ConversationController::class.'@toggleMute' => self::NON_GARDE,
        ConversationController::class.'@unarchive' => self::NON_GARDE,
        ConversationController::class.'@update' => self::NON_GARDE,
        ConversationParticipantController::class.'@destroy' => self::NON_GARDE,
        ConversationParticipantController::class.'@store' => self::NON_GARDE,
        ConversationParticipantController::class.'@update' => self::NON_GARDE,
        ConversationReportController::class.'@store' => self::NON_GARDE,
        PropertyBoostController::class.'@store' => self::NON_GARDE,
        // TCK-2525 — la même dépense de crédits que l'achat d'un boost, rangée comme lui.
        AgencySpotlightController::class.'@store' => self::NON_GARDE,
        CustomerController::class.'@destroy' => self::NON_GARDE,
        CustomerController::class.'@dismissSuggestedStage' => self::NON_GARDE,
        CustomerController::class.'@setPrimaryContact' => self::NON_GARDE,
        CustomerController::class.'@store' => self::NON_GARDE,
        CustomerController::class.'@undoPipelineStage' => self::NON_GARDE,
        CustomerController::class.'@update' => self::NON_GARDE,
        CustomerController::class.'@updatePipelineStage' => self::NON_GARDE,
        CustomerInvitationController::class.'@__invoke' => self::NON_GARDE,
        CustomerNoteController::class.'@destroy' => self::NON_GARDE,
        CustomerNoteController::class.'@store' => self::NON_GARDE,
        CustomerTagController::class.'@destroy' => self::NON_GARDE,
        CustomerTagController::class.'@store' => self::NON_GARDE,
        DocumentController::class.'@destroy' => self::NON_GARDE,
        DocumentController::class.'@store' => self::NON_GARDE,
        DocumentController::class.'@verify' => self::NON_GARDE,
        DocumentController::class.'@visibility' => self::NON_GARDE,
        DocumentPdfController::class.'@leaseContractPreview' => self::SANS_ECRITURE,
        DocumentShareLinkController::class.'@destroy' => self::NON_GARDE,
        DocumentShareLinkController::class.'@download' => self::PUBLIC,
        DocumentShareLinkController::class.'@show' => self::PUBLIC,
        DocumentShareLinkController::class.'@store' => self::NON_GARDE,
        DocumentVaultArchiveController::class.'@store' => self::SOI,
        DocumentVersionController::class.'@restore' => self::NON_GARDE,
        DocumentVersionController::class.'@store' => self::NON_GARDE,
        FavoriteController::class.'@destroy' => self::SOI,
        FavoriteController::class.'@store' => self::SOI,
        FavoriteController::class.'@update' => self::SOI,
        GeoLinkController::class.'@__invoke' => self::SANS_ECRITURE,
        GuarantorController::class.'@destroy' => self::NON_GARDE,
        GuarantorController::class.'@store' => self::NON_GARDE,
        GuarantorController::class.'@update' => self::NON_GARDE,
        InventoryController::class.'@destroyRoomPhoto' => self::NON_GARDE,
        InventoryController::class.'@dispute' => self::NON_GARDE,
        InventoryController::class.'@sendOnsiteCode' => self::NON_GARDE,
        InventoryController::class.'@sign' => self::NON_GARDE,
        InventoryController::class.'@store' => self::NON_GARDE,
        InventoryController::class.'@submit' => self::NON_GARDE,
        InventoryController::class.'@update' => self::NON_GARDE,
        InventoryController::class.'@uploadRoomPhotos' => self::NON_GARDE,
        InvoiceController::class.'@cancel' => self::NON_GARDE,
        InvoiceController::class.'@markPaid' => self::NON_GARDE,
        InvoiceController::class.'@send' => self::NON_GARDE,
        InvoiceController::class.'@store' => self::NON_GARDE,
        KpiConfigController::class.'@destroy' => self::NON_GARDE,
        KpiConfigController::class.'@store' => self::NON_GARDE,
        KpiConfigController::class.'@update' => self::NON_GARDE,
        LeaseController::class.'@activate' => self::NON_GARDE,
        LeaseController::class.'@attachGuarantor' => self::NON_GARDE,
        LeaseController::class.'@destroy' => self::NON_GARDE,
        LeaseController::class.'@detachGuarantor' => self::NON_GARDE,
        LeaseController::class.'@generateSchedule' => self::NON_GARDE,
        LeaseController::class.'@store' => self::NON_GARDE,
        LeaseController::class.'@update' => self::NON_GARDE,
        LeaseEarlyTerminationController::class.'@confirm' => self::NON_GARDE,
        LeaseEarlyTerminationController::class.'@destroy' => self::NON_GARDE,
        LeaseEarlyTerminationController::class.'@store' => self::NON_GARDE,
        LeasePaymentController::class.'@markLateFeePaid' => self::NON_GARDE,
        LeasePaymentController::class.'@markPaid' => self::NON_GARDE,
        LeasePaymentController::class.'@store' => self::NON_GARDE,
        LeasePaymentLinkController::class.'@destroy' => self::NON_GARDE,
        LeasePaymentLinkController::class.'@store' => self::NON_GARDE,
        LeasePaymentReminderController::class.'@store' => self::NON_GARDE,
        LeaseRenewalController::class.'@store' => self::NON_GARDE,
        MaintenanceOwnerReminderController::class.'@store' => self::NON_GARDE,
        MaintenanceQuoteAlternativeController::class.'@destroy' => self::NON_GARDE,
        MaintenanceQuoteAlternativeController::class.'@store' => self::NON_GARDE,
        MaintenanceQuoteController::class.'@approveQuote' => self::NON_GARDE,
        MaintenanceQuoteController::class.'@rejectQuote' => self::NON_GARDE,
        MaintenanceQuoteController::class.'@requestQuote' => self::NON_GARDE,
        MaintenanceQuoteController::class.'@start' => self::NON_GARDE,
        MaintenanceQuoteController::class.'@submitQuote' => self::NON_GARDE,
        MaintenanceRequestController::class.'@accept' => self::NON_GARDE,
        MaintenanceRequestController::class.'@complete' => self::NON_GARDE,
        MaintenanceRequestController::class.'@confirmResolution' => self::NON_GARDE,
        MaintenanceRequestController::class.'@contestResolution' => self::NON_GARDE,
        MaintenanceRequestController::class.'@decline' => self::NON_GARDE,
        MaintenanceRequestController::class.'@store' => self::NON_GARDE,
        MaintenanceRequestController::class.'@update' => self::NON_GARDE,
        MaintenanceRequestController::class.'@updateStatus' => self::NON_GARDE,
        MaintenanceRequestController::class.'@uploadPhotos' => self::NON_GARDE,
        MaintenanceRescheduleRequestController::class.'@store' => self::NON_GARDE,
        AgentProfileController::class.'@submitKyc' => self::NON_GARDE,
        AgentProfileController::class.'@updateDirectory' => self::NON_GARDE,
        AgentProfileController::class.'@updateSpecialization' => self::NON_GARDE,
        AgentProfileController::class.'@uploadKyc' => self::NON_GARDE,
        DataExportController::class.'@store' => self::SOI,
        MeAgencyController::class.'@store' => self::SOI,
        MeController::class.'@update' => self::SOI,
        MeProfilesController::class.'@updateActive' => self::SOI,
        \App\Http\Controllers\Api\Me\OwnerProfileController::class.'@submitKyc' => self::NON_GARDE,
        \App\Http\Controllers\Api\Me\OwnerProfileController::class.'@updateTaxId' => self::NON_GARDE,
        \App\Http\Controllers\Api\Me\OwnerProfileController::class.'@uploadKyc' => self::NON_GARDE,
        ServiceProviderProfileController::class.'@updateAvailability' => self::NON_GARDE,
        ServiceProviderProfileController::class.'@updateTrades' => self::NON_GARDE,
        ServiceProviderProfileController::class.'@uploadKyc' => self::NON_GARDE,
        TenantOnboardingChecklistController::class.'@complete' => self::NON_GARDE,
        MediaController::class.'@destroy' => self::NON_GARDE,
        MediaController::class.'@store' => self::NON_GARDE,
        NotificationController::class.'@markAllRead' => self::SOI,
        NotificationController::class.'@markAsRead' => self::NON_GARDE,
        NotificationController::class.'@markAsUnread' => self::NON_GARDE,
        NotificationPreferenceController::class.'@update' => self::SOI,
        OwnerProfileController::class.'@update' => self::NON_GARDE,
        PaymentGatewayController::class.'@initiate' => self::NON_GARDE,
        PropertyAvailabilityCheckController::class.'@answer' => self::NON_GARDE,
        PropertyCalendarFeedController::class.'@destroy' => self::NON_GARDE,
        PropertyCalendarFeedController::class.'@store' => self::NON_GARDE,
        PropertyCalendarFeedController::class.'@sync' => self::NON_GARDE,
        PropertyCollaboratorController::class.'@designatePrimary' => self::NON_GARDE,
        PropertyCollaboratorController::class.'@destroy' => self::NON_GARDE,
        PropertyCollaboratorController::class.'@store' => self::NON_GARDE,
        PropertyCollaboratorController::class.'@update' => self::NON_GARDE,
        PropertyContactController::class.'@replace' => self::NON_GARDE,
        PropertyController::class.'@assignAgent' => self::NON_GARDE,
        PropertyController::class.'@bulkArchive' => self::NON_GARDE,
        PropertyController::class.'@bulkAssign' => self::NON_GARDE,
        PropertyController::class.'@bulkVisibility' => self::NON_GARDE,
        PropertyController::class.'@destroy' => self::NON_GARDE,
        PropertyController::class.'@duplicate' => self::NON_GARDE,
        PropertyController::class.'@publish' => self::NON_GARDE,
        PropertyController::class.'@recordView' => self::NON_GARDE,
        PropertyController::class.'@store' => self::NON_GARDE,
        PropertyController::class.'@unpublish' => self::NON_GARDE,
        PropertyController::class.'@update' => self::NON_GARDE,
        PropertyController::class.'@updateStatus' => self::NON_GARDE,
        PropertyController::class.'@updateVisibility' => self::NON_GARDE,
        PropertyIcalTokenController::class.'@store' => self::NON_GARDE,
        PropertyMediaController::class.'@destroy' => self::NON_GARDE,
        PropertyMediaController::class.'@reorder' => self::NON_GARDE,
        PropertyMediaController::class.'@store' => self::NON_GARDE,
        PropertyOwnerController::class.'@update' => self::NON_GARDE,
        PropertyTagController::class.'@destroy' => self::NON_GARDE,
        PropertyTagController::class.'@sync' => self::NON_GARDE,
        PropertyUnavailabilityController::class.'@destroy' => self::NON_GARDE,
        PropertyUnavailabilityController::class.'@store' => self::NON_GARDE,
        PropertyVisitController::class.'@bulkAssign' => self::NON_GARDE,
        PropertyVisitController::class.'@bulkConfirm' => self::NON_GARDE,
        PropertyVisitController::class.'@cancel' => self::NON_GARDE,
        PropertyVisitController::class.'@claim' => self::NON_GARDE,
        PropertyVisitController::class.'@complete' => self::NON_GARDE,
        PropertyVisitController::class.'@confirm' => self::NON_GARDE,
        PropertyVisitController::class.'@destroy' => self::NON_GARDE,
        PropertyVisitController::class.'@feedback' => self::NON_GARDE,
        PropertyVisitController::class.'@noShow' => self::NON_GARDE,
        PropertyVisitController::class.'@report' => self::NON_GARDE,
        PropertyVisitController::class.'@reschedule' => self::NON_GARDE,
        PropertyVisitController::class.'@store' => self::NON_GARDE,
        PropertyVisitController::class.'@update' => self::NON_GARDE,
        PublicPaymentLinkController::class.'@initiate' => self::PUBLIC,
        PublicPaymentLinkController::class.'@verify' => self::PUBLIC,
        PublicSearchAlertController::class.'@confirm' => self::PUBLIC,
        PublicSearchAlertController::class.'@frequency' => self::PUBLIC,
        PublicSearchAlertController::class.'@store' => self::PUBLIC,
        PublicSearchAlertController::class.'@unsubscribe' => self::PUBLIC,
        SavedSearchController::class.'@claim' => self::SOI,
        SavedSearchController::class.'@destroy' => self::NON_GARDE,
        SavedSearchController::class.'@store' => self::SOI,
        SavedSearchController::class.'@unsubscribe' => self::PUBLIC,
        SavedSearchController::class.'@update' => self::NON_GARDE,
        SavedSearchController::class.'@viewed' => self::NON_GARDE,
        ServiceProviderBillController::class.'@reject' => self::NON_GARDE,
        ServiceProviderBillController::class.'@submit' => self::NON_GARDE,
        ServiceProviderBillController::class.'@validateBill' => self::NON_GARDE,
        ServiceProviderCollaborationController::class.'@endForProvider' => self::NON_GARDE,
        ServiceProviderCollaborationController::class.'@updateForAgency' => self::NON_GARDE,
        TagController::class.'@destroy' => self::NON_GARDE,
        TagController::class.'@store' => self::NON_GARDE,
        TagController::class.'@update' => self::NON_GARDE,
        TaskController::class.'@destroy' => self::NON_GARDE,
        TaskController::class.'@store' => self::NON_GARDE,
        TaskController::class.'@update' => self::NON_GARDE,
        ThresholdAlertController::class.'@destroy' => self::NON_GARDE,
        ThresholdAlertController::class.'@store' => self::NON_GARDE,
        ThresholdAlertController::class.'@update' => self::NON_GARDE,
        PaymentWebhookController::class.'@__invoke' => self::PUBLIC,
        PaymentWebhookController::class.'@gone' => self::PUBLIC,
        HostAutoOnboardController::class.'@store' => self::SOI,
        HostOnboardingController::class.'@individual' => self::SOI,
        NotificationUnsubscribeController::class.'@unsubscribe' => self::PUBLIC,
        OwnerOnboardingController::class.'@complete' => self::SOI,
        InvitationAcceptController::class.'@__invoke' => self::PUBLIC,
        InvitationCodeController::class.'@send' => self::PUBLIC,
        InvitationCodeController::class.'@verify' => self::PUBLIC,
        InvitationRenewalRequestController::class.'@__invoke' => self::PUBLIC,
        PublicAgentController::class.'@contactLead' => self::PUBLIC,
        PublicPropertyController::class.'@bookingRequest' => self::SOI,
        PublicPropertyController::class.'@contactClick' => self::PUBLIC,
        PublicPropertyController::class.'@contactLead' => self::PUBLIC,
        PublicPropertyController::class.'@contactMessage' => self::SOI,
        PublicPropertyController::class.'@report' => self::PUBLIC,
        PublicPropertyController::class.'@view' => self::PUBLIC,
        PublicPropertyController::class.'@visitRequest' => self::PUBLIC,
        PublicReviewController::class.'@report' => self::PUBLIC,
        // TCK-2569 — un compteur de mesure : le navigateur déclare les emplacements affichés, 204 toujours, aucune écriture hors des compteurs d'impressions.
        PublicSponsoredImpressionController::class.'@__invoke' => self::PUBLIC,
        RadarClaimController::class.'@confirm' => self::PUBLIC,
        RadarClaimController::class.'@decline' => self::PUBLIC,
        RadarClaimController::class.'@otp' => self::PUBLIC,
        ServiceProviderOnboardingController::class.'@complete' => self::SOI,
        MtargetSmsStatusController::class.'@__invoke' => self::PUBLIC,
        OrangeSmsStatusController::class.'@__invoke' => self::PUBLIC,
        RadarWhatsappWebhookController::class.'@__invoke' => self::PUBLIC,
        WhatsappStatusController::class.'@__invoke' => self::PUBLIC,
        WelcomeViewController::class.'@store' => self::SOI,
        WizardDraftController::class.'@destroy' => self::NON_GARDE,
        WizardDraftController::class.'@upsert' => self::NON_GARDE,
    ];
}
