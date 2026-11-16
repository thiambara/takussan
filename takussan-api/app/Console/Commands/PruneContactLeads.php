<?php

namespace App\Console\Commands;

use App\Models\PropertyContactLead;
use Illuminate\Console\Command;

/**
 * TCK-537 (AC3) — la politique de confidentialité (§ 6) garde les demandes de contact d'un visiteur
 * sans compte « 3 ans à compter du dernier échange ». Une demande (`property_contact_leads`, toujours
 * déposée sans compte : la table ne porte aucun expéditeur inscrit) est supprimée quand la plus
 * récente de ses dates — dépôt (`created_at`), première réponse (`first_responded_at`), traitement
 * (`handled_at`), dernière modification (`updated_at`) — a plus de {@see self::RETENTION_YEARS} ans.
 *
 * Les liens qui la désignent (`customers.source_contact_lead_id`, `customer_notes.contact_lead_id`,
 * `property_visits.contact_lead_id`) passent à nul par leur clé étrangère : la fiche client née d'une
 * demande lui survit, c'est l'agence qui la tient. Par lots ; idempotente — une suppression par
 * date, qu'une seconde exécution trouve vide.
 */
class PruneContactLeads extends Command
{
    public const RETENTION_YEARS = 3;

    protected $signature = 'crm:prune-contact-leads {--batch=1000 : Lignes supprimées par requête}';

    protected $description = 'Supprime les demandes de contact sans compte dont le dernier échange a plus de 3 ans.';

    public function handle(): int
    {
        $batch = max(1, (int) $this->option('batch'));
        $before = now()->subYears(self::RETENTION_YEARS);
        $deleted = 0;

        do {
            // GREATEST ignore les NULL sous PostgreSQL : une demande jamais traitée se juge sur ses
            // autres dates.
            $ids = PropertyContactLead::query()
                ->whereRaw('GREATEST(created_at, updated_at, handled_at, first_responded_at) < ?', [$before])
                ->orderBy('id')
                ->limit($batch)
                ->pluck('id');

            if ($ids->isNotEmpty()) {
                $deleted += PropertyContactLead::query()->whereKey($ids->all())->delete();
            }
        } while ($ids->count() === $batch);

        $this->info("crm:prune-contact-leads — demandes supprimées : {$deleted}");

        return self::SUCCESS;
    }
}
