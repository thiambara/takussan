<?php

namespace App\Services\Audit;

use App\Models\Agency;
use App\Models\Contracts\HasAuditAgency;
use Illuminate\Database\Eloquent\Model;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-601 (ADR-0044 §3) — l'agence d'une ligne du journal vient de son SUJET, jamais de son acteur.
 *
 * Le journal d'agence filtrait sur l'acteur : un admin qui n'avait qu'un `AgencyAdminProfile` y
 * était invisible, un bailleur présent chez A et chez B rendait à A ce qu'il faisait chez B, et les
 * actes système disparaissaient. L'ordre de résolution :
 *
 *   1. `agency_id` passé explicitement à l'écriture — attribut posé sur l'activité, ou
 *      `properties.agency_id` (convention des écrivains du dépôt : l'agence CONCERNÉE) ;
 *   2. `auditAgencyId()` d'un sujet {@see HasAuditAgency} (modèles enfants) ;
 *   3. la colonne RÉELLE `agency_id` du sujet, lue dans `getAttributes()` — jamais l'accesseur pont
 *      `User::getAgencyIdAttribute()`, qui dérive de l'acteur ;
 *   4. un sujet `Agency` → son identifiant ;
 *   5. SANS sujet seulement : l'agence du profil actif de la requête HTTP ;
 *   6. sinon `null` — visible du seul super-admin.
 */
class AuditAgencyResolver
{
    public function resolve(Activity $activity): ?int
    {
        $explicit = $activity->getAttribute('agency_id') ?? $activity->properties?->get('agency_id');
        if (is_int($explicit) || (is_string($explicit) && ctype_digit($explicit))) {
            return (int) $explicit;
        }

        if ($activity->subject_type !== null) {
            $subject = $activity->subject;

            return $subject instanceof Model ? $this->forSubject($subject) : null;
        }

        $profile = app()->bound('request') && request()->hasMacro('activeProfile') ? request()->activeProfile() : null;
        $agencyId = $profile?->getAttribute('agency_id');

        return $agencyId !== null ? (int) $agencyId : null;
    }

    public function forSubject(Model $subject): ?int
    {
        if ($subject instanceof HasAuditAgency) {
            return $subject->auditAgencyId();
        }

        $attributes = $subject->getAttributes();
        if (array_key_exists('agency_id', $attributes)) {
            return $attributes['agency_id'] !== null ? (int) $attributes['agency_id'] : null;
        }

        if ($subject instanceof Agency) {
            return (int) $subject->getKey();
        }

        return null;
    }
}
