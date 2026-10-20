<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-989 (P49.01) — supprime les brouillons du formulaire de passage (`agency-upgrade-{id}`)
 * qui portent un RIB professionnel ou un NINEA.
 *
 * `wizard_drafts.data` est un `jsonb` en clair, conservé jusqu'à 90 jours d'inactivité
 * (`PurgeOldWizardDrafts`), alors que la demande envoyée chiffre ces deux champs (ADR-0044 § 1).
 * Le front ne les écrit plus dans le brouillon ; ceux déjà écrits partent ici, en entier — c'est
 * la décision du porteur (« retirer les brouillons existants qui les portent »). L'utilisateur
 * ressaisit sa demande, comme il rattache à nouveau le fichier des statuts.
 *
 * Un champ `null` ou vide n'est pas une saisie : ces brouillons-là restent.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('wizard_drafts')
            ->where('key', 'like', 'agency-upgrade-%')
            ->where(function (Builder $q): void {
                $q->whereRaw("coalesce(data->>'rib_pro', '') <> ''")
                    ->orWhereRaw("coalesce(data->>'ninea', '') <> ''");
            })
            ->delete();
    }

    /** Une suppression ne se rejoue pas : rien à rendre. */
    public function down(): void {}
};
