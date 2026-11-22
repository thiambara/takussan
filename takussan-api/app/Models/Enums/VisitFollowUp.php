<?php

namespace App\Models\Enums;

/**
 * TCK-2578 (ADR-0101 § 3) — la suite choisie par l'agent après la visite. Le serveur la TRACE et ne
 * déclenche rien : le geste (WhatsApp, tâche, saisie, bail) passe par les routes existantes.
 */
enum VisitFollowUp: string
{
    case InviteApply = 'invite_apply';
    case InviteOffer = 'invite_offer';
    case RecordBooking = 'record_booking';
    case SecondVisit = 'second_visit';
    case ProposeProperties = 'propose_properties';
    case Remind = 'remind';
    case CreateLease = 'create_lease';
}
