<?php

namespace App\Services\Radar;

use App\Jobs\Radar\VerifyRadarConsentReply;
use App\Models\Enums\RadarConsentProof;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarOutreach;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2388 (ADR-0077 §3, §11) — les gestes qui font vivre la preuve d'un accord : déposer la réponse d'un annonceur
 * (ici), puis la confirmer ou la rejeter (tâche suivante). Chaque geste exige la prise en charge de l'annonceur et
 * relit ses règles sous verrou. Ordre des verrous : annonces → annonceur → message → réponse.
 *
 * **Déposer une réponse n'accorde rien** : la ligne naît `pending`, la vérification par l'IA part en file APRÈS le
 * commit (`VerifyRadarConsentReply`), et seul un humain confirme. Aucune annonce ne change d'étape ici.
 *
 * **Le journal nomme les gestes et les identifiants, jamais le texte ni un numéro.**
 */
final class RadarConsentWorkflow
{
    public function __construct(
        private readonly AdvertiserClaim $claim,
        private readonly RadarCaptureReader $captures,
    ) {}

    /**
     * Déposer la réponse d'un annonceur : les captures de la conversation, sur le message ENVOYÉ, sans issue finale,
     * dernier de sa chaîne (la réponse se dépose sur la dernière relance : elle porte les mêmes annonces et les mêmes
     * clauses).
     *
     * @param  list<UploadedFile>  $files
     */
    public function depositReply(RadarOutreach $outreach, array $files, User $by): RadarConsent
    {
        // Lectures libres : on échoue avant de décoder des images, qui coûte.
        $advertiser = RadarAdvertiser::query()->findOrFail($outreach->radar_advertiser_id);
        $this->claim->check($advertiser, $by);

        // Tout se lit et se réencode AVANT la moindre écriture.
        $captures = $this->captures->prepare($files);

        return DB::transaction(function () use ($outreach, $captures, $by): RadarConsent {
            $advertiser = RadarAdvertiser::query()->whereKey($outreach->radar_advertiser_id)->lockForUpdate()->firstOrFail();
            $this->claim->assertHeld($advertiser, $by);
            abort_code_if($advertiser->do_not_contact_at !== null, 422, 'radar.advertiser.do_not_contact');

            $locked = RadarOutreach::query()->whereKey($outreach->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless($locked->isSent(), 409, 'radar.outreach.not_sent');
            abort_code_if($locked->outcome?->isFinal() === true, 409, 'radar.outreach.outcome_final');
            abort_code_if(
                RadarOutreach::query()->where('follow_up_of_id', $locked->id)->whereNotNull('sent_at')->exists(),
                409,
                'radar.outreach.superseded',
            );
            // Un dépôt = un appel payant : tant qu'une réponse de ce message attend sa vérification, on n'en dépose pas
            // une seconde (le double envoi d'un formulaire). Le message est verrouillé : deux dépôts se sérialisent ici.
            abort_code_if(
                RadarConsent::query()->where('radar_outreach_id', $locked->id)->where('verification_status', RadarVerificationStatus::Pending->value)->exists(),
                409,
                'radar.outreach.reply_pending',
            );

            $consent = RadarConsent::query()->create([
                'radar_outreach_id' => $locked->id,
                'radar_advertiser_id' => $advertiser->id,
                'proof' => RadarConsentProof::Screenshot,
                'capture_hashes' => array_column($captures, 'sha256'),
                'deposited_by_id' => $by->id,
                'verification_status' => RadarVerificationStatus::Pending,
            ]);

            VerifyRadarConsentReply::dispatch($consent->id)->afterCommit();

            activity('Admin')
                ->causedBy($by)
                ->performedOn($locked)
                ->withProperties(['outreach_id' => $locked->id, 'consent_id' => $consent->id, 'captures' => count($captures)])
                ->event('radar_consent_reply_deposited')
                ->log('Réponse d\'annonceur déposée sur un message d\'accord du Radar');

            // Le DERNIER geste avant le commit : la transaction rend les lignes, jamais les fichiers. Si une écriture
            // suivait, son échec laisserait sur le disque privé des captures (des numéros de téléphone) que rien ne
            // référence et que la purge ne trouverait pas. `attach()` efface lui-même ce qu'il a déjà écrit s'il échoue.
            $this->captures->attach($consent, 'radar_consent_captures', $captures, 'reponse');

            return $consent;
        });
    }
}
