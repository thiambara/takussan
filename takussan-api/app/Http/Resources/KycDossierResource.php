<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\KycDossier;
use App\Services\Kyc\KycWorkflowService;
use App\Services\Kyc\SharedLegalIdentifierDetector;
use App\Support\RelativeSignedUrl;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class KycDossierResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var KycDossier $dossier */
        $dossier = $this->resource;

        return [
            'id' => $dossier->id,
            'subject_type' => class_basename($dossier->subject_type),
            'subject_id' => $dossier->subject_id,
            /*
             * TCK-362 — le SUJET du dossier, et pas seulement sa clé étrangère.
             *
             * La file KYC du super-admin affichait « Agence #12 » : `subject_id` était la seule
             * chose que cette ressource émettait du sujet, alors que `KycController::index` charge
             * `subject` depuis toujours (`->with(['subject', 'reviewer'])`). La relation était
             * chargée et jamais sérialisée — l'écran n'avait donc PAS le choix entre le nom et
             * l'identifiant, il n'avait que l'identifiant.
             *
             * `whenLoaded` et pas un accès direct : un `N+1` par ligne de file est précisément ce
             * que le ticket interdit. Le prix de `whenLoaded`, c'est que le champ DISPARAÎT en
             * silence chez un appelant qui n'a pas chargé la relation — ce qui était le cas de
             * `KycWorkflowService::dossierForAgency()` (deux routes servies sans `subject`,
             * `include=subject` ignoré sans erreur). Les CINQ chemins qui servent cette ressource
             * chargent désormais la relation, et `KycWorkflowTest` le tient route par route.
             *
             * Le `name` est typé par `instanceof Agency` plutôt que lu par `->name` : `subject`
             * est un `morphTo`, et seul `Agency` ouvre un dossier aujourd'hui
             * (`KycWorkflowService::dossierForAgency`). Un sujet d'un autre type rendrait un `name`
             * nul plutôt qu'une erreur de propriété inconnue.
             */
            'subject' => $this->whenLoaded('subject', function () use ($dossier): ?array {
                $subject = $dossier->subject;

                if ($subject === null) {
                    return null;
                }

                return [
                    'id' => $subject->getKey(),
                    'type' => class_basename($subject),
                    'name' => $subject instanceof Agency ? $subject->name : null,
                    'slug' => $subject instanceof Agency ? $subject->slug : null,
                ];
            }),
            'status' => $this->enumValue($dossier->status),
            'submitted_at' => $this->iso($dossier->submitted_at),
            'reviewed_at' => $this->iso($dossier->reviewed_at),
            'reviewed_by' => $dossier->reviewed_by,
            'rejection_reason' => $dossier->rejection_reason,
            'expires_at' => $this->iso($dossier->expires_at),
            /*
             * TCK-2671 — quand la pièce du dirigeant d'un dossier VÉRIFIÉ se remplace : la règle de
             * `KycWorkflowService::renewalOpensOn()`, servie telle quelle pour que le front n'en
             * recopie ni la fenêtre ni la pièce. `null` : dossier non vérifié ou sans échéance.
             */
            'renewal' => ($opensOn = KycWorkflowService::renewalOpensOn($dossier)) === null ? null : [
                'document_type' => KycWorkflowService::RENEWABLE_DOCUMENT,
                'opens_on' => $this->calendarDate($opensOn),
            ],
            'shared_identifiers' => $this->when(
                $request->user()?->isSuperAdmin() === true && $dossier->subject_type === Agency::class && $dossier->subject_id !== null,
                fn () => SharedLegalIdentifierDetector::forRequestCycle($request)->forAgency(
                    (int) $dossier->subject_id,
                    $dossier->subject instanceof Agency ? $dossier->subject->ninea : null,
                ),
            ),
            'metadata' => $dossier->metadata ?? [],
            'documents' => $dossier->getMedia('documents')->map(fn ($media) => [
                'id' => $media->id,
                'file_name' => $media->file_name,
                'mime_type' => $media->mime_type,
                'size' => (int) $media->size,
                'document_type' => $media->getCustomProperty('document_type'),
                // TCK-2669 (ADR-0104 § 2) — le numéro saisi avec la pièce, à comparer à celui de l'agence.
                'document_number' => $media->getCustomProperty('document_number'),
                // TCK-601 (C) — l'échéance de la PIÈCE (`Y-m-d`) ; `expires_at` ci-dessous est celle
                // du lien signé, depuis TCK-285.
                'document_expires_at' => $this->calendarDate(
                    is_string($date = $media->getCustomProperty('expires_at')) && $date !== '' ? Carbon::parse($date) : null,
                ),
                'signed_url' => RelativeSignedUrl::temporary('kyc.documents.show', now()->addMinutes(15), ['media' => $media->id]),
                'expires_at' => $this->iso(now()->addMinutes(15)),
            ])->values()->all(),
            'created_at' => $this->iso($dossier->created_at),
            'updated_at' => $this->iso($dossier->updated_at),
        ];
    }
}
