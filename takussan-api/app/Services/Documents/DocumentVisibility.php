<?php

namespace App\Services\Documents;

use App\Models\Customer;
use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\User;
use Illuminate\Support\Collection;
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
    /**
     * TCK-2759 (r1 de la vérification de cd48b8f57) — la bascule que la ligne peut OFFRIR depuis son
     * état : « Rendre visible » sur un document interne, « Garder pour l'agence » sur un document
     * visible qui n'est pas une pièce du sujet. Sur une pièce visible du sujet, la seule bascule
     * serait vers « interne », que {@see self::change()} refuse (422 `document.internal_own_upload`) :
     * rien ne s'offre. `DocumentResource` et `CustomerResource` la lisent, après la policy
     * (`setVisibility`), pour que `abilities.set_visibility` ne promette pas un geste refusé.
     */
    public static function basculeOfferte(Document $document, Customer $customer): bool
    {
        return (bool) $document->is_internal || ! self::estUnePieceDuSujet($document, $customer);
    }

    /**
     * Ce que le jugement d'un document lit sur sa ligne : `is_internal` (le filtre des internes,
     * l'offre de bascule) et `uploaded_by` (la pièce du sujet, {@see self::estUnePieceDuSujet()}).
     */
    public const COLONNES_DU_JUGEMENT = ['is_internal', 'uploaded_by'];

    /**
     * Vérification de 416274da0 (r1, r2) — un document lu sous `fields[documents]` n'a que les colonnes
     * demandées : `is_internal` absent valait `false` (un interne servi comme visible, et passé au
     * lecteur qui ne lit pas les internes par `include=documents`), `uploaded_by` absent cachait la pièce
     * du sujet. Les colonnes manquantes de ces documents se lisent en UNE requête pour la page, et
     * complètent les modèles sans les rendre sales. Le jugement porte ainsi sur la base, jamais sur ce
     * que le client a demandé ; ce que la ressource rend de ces colonnes n'en devient que vrai.
     *
     * @param  Collection<int, Document>  $documents
     * @param  list<string>  $colonnes
     */
    public static function completerLesColonnes(Collection $documents, array $colonnes = self::COLONNES_DU_JUGEMENT): void
    {
        $manquantes = static fn (Document $d): array => array_values(array_filter(
            $colonnes,
            static fn (string $c): bool => ! array_key_exists($c, $d->getAttributes()),
        ));
        $incomplets = $documents->filter(static fn (Document $d): bool => $d->getKey() !== null && $manquantes($d) !== []);
        if ($incomplets->isEmpty()) {
            return;
        }

        $lignes = Document::query()->withoutGlobalScopes()
            ->whereKey($incomplets->map->getKey()->unique()->values()->all())
            ->get(['id', ...$colonnes])
            ->keyBy('id');
        foreach ($incomplets as $document) {
            $ligne = $lignes->get($document->getKey());
            if ($ligne === null) {
                continue;
            }
            foreach ($manquantes($document) as $colonne) {
                $document->setRawAttributes([...$document->getAttributes(), $colonne => $ligne->getRawOriginal($colonne)]);
                $document->syncOriginalAttribute($colonne);
            }
        }
    }

    /** Une pièce téléversée par le sujet de la fiche (§ 4) : elle n'est jamais interne. */
    private static function estUnePieceDuSujet(Document $document, Customer $customer): bool
    {
        return $customer->user_id !== null && (int) $document->uploaded_by === (int) $customer->user_id;
    }

    public function change(Document $document, bool $internal, User $actor): Document
    {
        $customer = $document->documentable;
        abort_code_unless($customer instanceof Customer, 422, 'document.internal_customer_only');
        abort_code_if($internal && self::estUnePieceDuSujet($document, $customer), 422, 'document.internal_own_upload');

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
