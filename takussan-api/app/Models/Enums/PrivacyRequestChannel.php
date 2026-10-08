<?php

namespace App\Models\Enums;

/** TCK-601 (ADR-0044 §4) — registre des demandes de droits. */
enum PrivacyRequestChannel: string
{
    case InApp = 'in_app';
    case Email = 'email';
    case Postal = 'postal';
    case Phone = 'phone';
    case InPerson = 'in_person';
}
