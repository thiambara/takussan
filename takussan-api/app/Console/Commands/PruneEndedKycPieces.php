<?php

namespace App\Console\Commands;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\KycDossier;
use Illuminate\Console\Command;

/**
 * TCK-537 (AC3) — la politique de confidentialité (§ 6) garde les pièces de vérification (KYC)
 * « pendant la relation, puis 5 ans après sa fin ». La FIN de la relation est la date de fin du
 * profil qui porte la pièce (`deleted_at`, posée au retrait d'un membre ou à l'effacement du compte —
 * TCK-1061), ou, pour le dossier KYC d'une agence, celle de l'agence.
 *
 * Au-delà de {@see self::RETENTION_YEARS} ans :
 *  - les pièces de VÉRIFICATION ({@see self::VERIFICATION_TYPES} : celles que les trois `uploadKyc`
 *    rangent) d'un profil terminé sont supprimées définitivement, fichiers, versions et entrée
 *    d'index compris (`forceDelete`, qui passe par la médiathèque et Scout). Un autre document porté
 *    par le profil — le mandat de gestion qu'une agence dépose sur un bailleur (TCK-2909), un
 *    document `other` — n'est pas une pièce de vérification : il reste (contrainte 1 de TCK-537) ;
 *  - les dossiers KYC d'une agence supprimée, avec leurs fichiers.
 *
 * Un profil vivant, ou terminé depuis moins de 5 ans, garde ses pièces. Idempotente : une
 * suppression par date, qu'une seconde exécution trouve vide.
 */
class PruneEndedKycPieces extends Command
{
    public const RETENTION_YEARS = 5;

    /** Les types que rangent `UploadKyc*ProfileRequest::KYC_KIND_TO_TYPE`, hors `other` (ambigu). */
    public const VERIFICATION_TYPES = [
        DocumentType::IdCard, DocumentType::Passport, DocumentType::Rib, DocumentType::Ninea,
        DocumentType::Photo, DocumentType::Insurance,
    ];

    protected $signature = 'kyc:prune-ended-pieces';

    protected $description = 'Supprime les pièces KYC des profils et agences terminés depuis plus de 5 ans.';

    public function handle(): int
    {
        $before = now()->subYears(self::RETENTION_YEARS);
        $pieces = 0;

        foreach (Document::PROFILE_TYPES as $profileClass) {
            $profileClass::onlyTrashed()
                ->where('deleted_at', '<', $before)
                ->orderBy('id')
                ->chunkById(200, function ($profiles) use ($profileClass, &$pieces): void {
                    Document::withTrashed()
                        ->where('documentable_type', $profileClass)
                        ->whereIn('documentable_id', $profiles->modelKeys())
                        ->whereIn('type', array_map(fn (DocumentType $t) => $t->value, self::VERIFICATION_TYPES))
                        ->get()
                        ->each(function (Document $document) use (&$pieces): void {
                            $document->forceDelete();
                            $pieces++;
                        });
                });
        }

        $dossiers = 0;
        KycDossier::query()
            ->where('subject_type', Agency::class)
            ->whereIn('subject_id', Agency::onlyTrashed()->where('deleted_at', '<', $before)->select('id'))
            ->get()
            ->each(function (KycDossier $dossier) use (&$dossiers): void {
                // Journalisé (`Auditable`) : sa suppression recopierait ses champs au journal, qu'elle
                // doit au contraire faire disparaître.
                $dossier->disableLogging();
                $dossier->delete();
                $dossiers++;
            });

        $this->info("kyc:prune-ended-pieces — pièces supprimées : {$pieces} ; dossiers d’agence : {$dossiers}");

        return self::SUCCESS;
    }
}
