<?php

namespace Database\Seeders\System;

use App\Models\Announcement;
use App\Models\Enums\AnnouncementSeverity;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

/**
 * TCK-2381 — les annonces de la plateforme, publiées par le super-admin comme le fait
 * `Admin\AnnouncementController::store` (et journalisées de même) : une maintenance passée, une
 * nouveauté en cours pour tous, un rappel ciblé sur les administrateurs d'agence.
 *
 * Aucune annonce `critical` active : elle ne se ferme pas (`AnnouncementResolver::dismiss`), et
 * barrerait chaque écran de la démo. Le wolof est en pause : `wo` porte le texte français.
 */
class AnnouncementSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        if (Announcement::query()->exists()) {
            return;
        }

        $maintenant = CarbonImmutable::now();
        $operateur = $this->ctx->operateur();

        foreach ([
            [
                'publiee' => $maintenant->subMonths(4)->setTime(10, 0),
                'title' => ['fr' => 'Maintenance planifiée dimanche', 'en' => 'Scheduled maintenance on Sunday'],
                'body' => [
                    'fr' => 'La plateforme sera indisponible dimanche de 2 h à 4 h pour une mise à jour.',
                    'en' => 'The platform will be unavailable on Sunday from 2 to 4 a.m. for an update.',
                ],
                'severity' => AnnouncementSeverity::Warning,
                'segment' => null,
                'duree_jours' => 5,
            ],
            [
                'publiee' => $maintenant->subDays(10)->setTime(9, 0),
                'title' => ['fr' => 'Nouveau : le rapprochement bancaire', 'en' => 'New: bank reconciliation'],
                'body' => [
                    'fr' => 'Déposez le relevé de votre banque : chaque loyer reçu et chaque reversement émis se rapprochent en un geste.',
                    'en' => 'Upload your bank statement: every rent received and every payout sent is reconciled in one step.',
                ],
                'severity' => AnnouncementSeverity::Success,
                'segment' => null,
                'duree_jours' => 30,
            ],
            [
                'publiee' => $maintenant->subDays(3)->setTime(15, 30),
                'title' => ['fr' => 'Relevés de gérance du mois', 'en' => 'This month\'s owner statements'],
                'body' => [
                    'fr' => 'Les relevés de gérance du mois dernier sont envoyés à vos bailleurs. Vérifiez les reprises en attente avant le prochain reversement.',
                    'en' => 'Last month\'s owner statements have been sent to your landlords. Check pending clawbacks before the next payout.',
                ],
                'severity' => AnnouncementSeverity::Info,
                'segment' => ['roles' => ['agency_admin']],
                'duree_jours' => null,
            ],
        ] as $annonce) {
            Timeline::aLaDate($annonce['publiee'], function () use ($annonce, $operateur): void {
                $creee = Announcement::query()->create([
                    'title' => $annonce['title'] + ['wo' => $annonce['title']['fr']],
                    'body' => $annonce['body'] + ['wo' => $annonce['body']['fr']],
                    'severity' => $annonce['severity'],
                    'segment' => $annonce['segment'],
                    'starts_at' => now(),
                    'ends_at' => $annonce['duree_jours'] !== null ? now()->addDays($annonce['duree_jours']) : null,
                    'is_active' => true,
                    'created_by' => $operateur->id,
                ]);

                activity('Admin')
                    ->causedBy($operateur)
                    ->performedOn($creee)
                    ->event('super_admin_announcement_created')
                    ->log('Annonce plateforme créée');
            });
        }
    }
}
