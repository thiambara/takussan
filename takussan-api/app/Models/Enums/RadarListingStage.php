<?php

namespace App\Models\Enums;

/** TCK-2386 (ADR-0077 §1) — l'étape d'une annonce collectée, de la capture à la publication ou à la purge. */
enum RadarListingStage: string
{
    case Captured = 'captured';
    case Extracted = 'extracted';
    case Reviewed = 'reviewed';
    case Contacted = 'contacted';
    case Consented = 'consented';
    case Published = 'published';
    case ExtractionFailed = 'extraction_failed';
    case Duplicate = 'duplicate';
    case Refused = 'refused';
    case DoNotContact = 'do_not_contact';
    case Purged = 'purged';
}
