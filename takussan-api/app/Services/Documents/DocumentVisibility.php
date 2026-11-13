<?php

namespace App\Services\Documents;

use App\Models\Customer;
use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2759 (ADR-0099, amendement du 2026-11-12) — la visibilité d'un document de fiche client :
 * gardé pour l'agence (`is_internal`) ou visible par le sujet de la fiche.
 *
 * - Le drapeau ne vaut que sur une fiche client (§ 2) : 422 `document.internal_customer_only`.
 * - Une pièce téléversée par le sujet n'est jamais interne (§ 4) : 422 `document.internal_own_upload`,
 *   et la ligne ne change pas.
 * - À la bascule vers « interne », les liens que le SUJET avait publiés vers le document sont
 *   révoqués (`revoked_at`), dans la même transaction (§ 7) ; ceux du personnel restent.
 * - Chaque bascule s'écrit au journal (`document_visibility_changed`, `from`, `to`). Une demande
 *   qui ne change rien n'écrit rien.
 *
 * L'autorisation est celle de `DocumentPolicy::setVisibility()`, jugée avant (FormRequest).
 */
final class DocumentVisibility
{
    public function change(Document $document, bool $internal, User $actor): Document
    {
        $customer = $document->documentable;
        abort_code_unless($customer instanceof Customer, 422, 'document.internal_customer_only');
        abort_code_if(
            $internal && $customer->user_id !== null && (int) $document->uploaded_by === (int) $customer->user_id,
            422,
            'document.internal_own_upload',
        );

        DB::transaction(function () use ($document, $customer, $internal, $actor): void {
            $locked = Document::query()->whereKey($document->getKey())->lockForUpdate()->firstOrFail();
            $from = (bool) $locked->is_internal;
            if ($from === $internal) {
                return;
            }

            $locked->forceFill(['is_internal' => $internal])->save();

            if ($internal && $customer->user_id !== null) {
                DocumentShareLink::query()
                    ->where('document_id', $locked->getKey())
                    ->where('created_by_id', $customer->user_id)
                    ->whereNull('revoked_at')
                    ->update(['revoked_at' => now(), 'updated_at' => now()]);
            }

            activity('Document')
                ->performedOn($locked)
                ->causedBy($actor)
                ->event('document_visibility_changed')
                ->withProperties(['from' => $from, 'to' => $internal])
                ->log('document_visibility_changed');
        });

        return $document->refresh();
    }
}
