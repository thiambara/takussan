<?php

namespace App\Observers;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-2957 (ADR-0128 § 1) — le lien générique `conversations.subject_type/subject_id` n'a pas de clé
 * étrangère : c'est ici que la suppression d'un objet ferme son fil.
 *
 *  - `deleted` (suppression douce ET définitive : `forceDelete()` passe aussi par `delete()`) : tout
 *    fil NON fermé de l'objet passe `closed`, et porte la marque {@see self::MARQUE} dans son
 *    `metadata`. Un fil `closed` n'accepte plus d'écriture (`ConversationAccess::allowsWriting`).
 *  - `restored` : ne rouvre (`active`) QUE les fils qui portent la marque, et la retire. Un fil que
 *    rien d'autre n'aurait fermé n'est pas rouvert par la restauration.
 *
 * Branché par une boucle sur `SujetsDuFil::typesSujets()` dans `AppServiceProvider::bootObservers()` :
 * un type sujet ajouté au registre est couvert sans autre code.
 *
 * ⚠ Ne voit que les suppressions par MODÈLE. Une suppression par requête (`Model::query()->delete()`)
 * ou par cascade de la base (`maintenance_requests.property_id … cascadeOnDelete`) ne déclenche aucun
 * événement : aucun chemin de `app/` ne supprime ainsi un des trois types au 2026-11-18.
 */
class FermeLeFilDeSonObjet
{
    /** La clé de `conversations.metadata` qui dit « fermé par la suppression de son objet ». */
    public const MARQUE = 'ferme_par_suppression_de_son_objet';

    public function deleted(Model $objet): void
    {
        Conversation::query()
            ->deSujet($objet)
            ->where('status', '!=', ConversationStatus::Closed->value)
            ->orderBy('id')
            ->each(function (Conversation $fil): void {
                $fil->update([
                    'status' => ConversationStatus::Closed->value,
                    'metadata' => [...($fil->metadata ?? []), self::MARQUE => true],
                ]);
            });
    }

    public function restored(Model $objet): void
    {
        Conversation::query()
            ->deSujet($objet)
            ->where('status', ConversationStatus::Closed->value)
            ->orderBy('id')
            ->each(function (Conversation $fil): void {
                $metadata = $fil->metadata ?? [];
                if (($metadata[self::MARQUE] ?? false) !== true) {
                    return;
                }
                unset($metadata[self::MARQUE]);

                $fil->update([
                    'status' => ConversationStatus::Active->value,
                    'metadata' => $metadata === [] ? null : $metadata,
                ]);
            });
    }
}
