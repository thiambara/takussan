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
    /**
     * TCK-2387 — écartée par l'opérateur (motif : {@see RadarDiscardReason}). `Refused` reste l'issue
     * d'un démarchage (TCK-2388) : un écart n'est pas un refus de l'annonceur.
     */
    case Discarded = 'discarded';
    case Refused = 'refused';
    case DoNotContact = 'do_not_contact';
    case Purged = 'purged';

    /** Corriger un champ : seulement une fiche extraite, pas encore validée. */
    public function allowsCorrection(): bool
    {
        return $this === self::Extracted;
    }

    public function allowsReview(): bool
    {
        return $this === self::Extracted;
    }

    /** Doublon et écart : avant tout démarchage, extraction réussie ou non. */
    public function allowsClosing(): bool
    {
        return in_array($this, [self::Captured, self::Extracted, self::ExtractionFailed, self::Reviewed], true);
    }

    /** Changer d'annonceur : une fiche lue, pas encore démarchée. */
    public function allowsAdvertiserChange(): bool
    {
        return in_array($this, [self::Extracted, self::Reviewed], true);
    }
}
