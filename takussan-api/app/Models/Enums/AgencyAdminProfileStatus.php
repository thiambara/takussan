<?php

namespace App\Models\Enums;

use App\Models\Profiles\AgencyAdminProfile;

/**
 * TCK-271 — lifecycle states for {@see AgencyAdminProfile}.
 *
 * Mirrors {@see OwnerProfileStatus} — `active` is the default produced by
 * the host individual onboarding wizard; `suspended` / `archived` are
 * reserved for super-admin moderation flows (TCK-211 family).
 */
enum AgencyAdminProfileStatus: string
{
    case Active = 'active';
    case Suspended = 'suspended';
    case Archived = 'archived';
}
