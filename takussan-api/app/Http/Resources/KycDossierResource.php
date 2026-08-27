<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\KycDossier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

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
            'metadata' => $dossier->metadata ?? [],
            'documents' => $dossier->getMedia('documents')->map(fn ($media) => [
                'id' => $media->id,
                'file_name' => $media->file_name,
                'mime_type' => $media->mime_type,
                'size' => (int) $media->size,
                'document_type' => $media->getCustomProperty('document_type'),
                'signed_url' => URL::temporarySignedRoute('kyc.documents.show', now()->addMinutes(15), ['media' => $media->id]),
                'expires_at' => $this->iso(now()->addMinutes(15)),
            ])->values()->all(),
            'created_at' => $this->iso($dossier->created_at),
            'updated_at' => $this->iso($dossier->updated_at),
        ];
    }
}
