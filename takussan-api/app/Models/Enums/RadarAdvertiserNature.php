<?php

namespace App\Models\Enums;

/** TCK-2386 (ADR-0077 §7) — la nature présumée d'un annonceur ; reste dans le Radar, jamais dans les profils. */
enum RadarAdvertiserNature: string
{
    case ProbableOwner = 'probable_owner';
    case ProbableIntermediary = 'probable_intermediary';
    case Agency = 'agency';
    case Unknown = 'unknown';
}
