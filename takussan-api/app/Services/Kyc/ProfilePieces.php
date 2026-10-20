<?php

namespace App\Services\Kyc;

use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * TCK-1063 (P64.04) — une pièce de profil par (profil, type), écrite par les trois `uploadKyc`
 * (`OwnerProfileController`, `AgentProfileController`, `ServiceProviderProfileController`).
 *
 * Un nouvel envoi remplace le fichier : la pièce redevient « non vérifiée », et les trois champs
 * de vérification se vident ensemble. `Document` n'étant pas journalisé, qui avait vérifié la pièce
 * remplacée, et quand, s'écrit au journal d'audit avant d'être effacé (décision du porteur,
 * 2026-10-20).
 */
class ProfilePieces
{
    /**
     * @param  array<string, mixed>  $attributes  `name`, `description`, `metadata`…
     */
    public function upsert(Model $profile, DocumentType $type, User $uploader, array $attributes): Document
    {
        return DB::transaction(function () use ($profile, $type, $uploader, $attributes): Document {
            $keys = [
                'documentable_type' => $profile::class,
                'documentable_id' => $profile->getKey(),
                'type' => $type,
            ];

            $previous = Document::query()->where($keys)->lockForUpdate()->first();
            if ($previous !== null && ($previous->is_verified || $previous->verified_by !== null)) {
                activity('Document')
                    ->performedOn($previous)
                    ->causedBy($uploader)
                    ->event('document_verification_reset')
                    ->withProperties([
                        'verified_by' => $previous->verified_by,
                        'verified_at' => $previous->verified_at?->toIso8601String(),
                    ])
                    ->log('document_verification_reset');
            }

            return Document::query()->updateOrCreate($keys, [
                'uploaded_by' => $uploader->id,
                ...$attributes,
                'is_verified' => false,
                'verified_by' => null,
                'verified_at' => null,
            ]);
        });
    }
}
