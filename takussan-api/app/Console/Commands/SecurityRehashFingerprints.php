<?php

namespace App\Console\Commands;

use App\Models\AlertSubscriber;
use App\Models\Enums\PayoutStatus;
use App\Models\PayoutMethod;
use App\Support\AppKeyHmac;
use App\Support\PhoneFingerprint;
use Illuminate\Console\Command;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\DB;

/**
 * TCK-614 (ADR-0084, amendement du 2026-11-16) — réécrit sous la clé d'écriture courante ({@see AppKeyHmac::of()},
 * `APP_HMAC_KEY`) les empreintes PERSISTANTES qui se recalculent, et compte celles qui ne se recalculent pas. Tant
 * qu'il en reste, l'ancienne `APP_KEY` qui les a écrites ne quitte pas `APP_PREVIOUS_KEYS` sans perte, et ce bilan
 * dit laquelle.
 *
 * - `alert_subscribers` : `contact_hash` et `mailbox_hash`, depuis le `contact` déchiffré de la ligne ; un contact
 *   illisible est compté `sans_source`.
 * - `credit_welcome_grants.phone_hash` : SEULEMENT si l'empreinte stockée est l'une de celles du numéro ACTUEL de son
 *   titulaire ({@see PhoneFingerprint::all()}). Sinon (compte anonymisé, numéro changé) : `sans_source`. Une empreinte
 *   déjà portée par une autre ligne (index unique) : `conflits`, jamais réécrite.
 * - `payouts.metadata.approved_destination_fingerprint` des versements à venir : SEULEMENT si l'empreinte stockée est
 *   l'une de celles de la destination actuelle ({@see PayoutMethod::fingerprints()}). Recalculer depuis la destination
 *   courante BLANCHIRAIT une destination changée depuis l'approbation : celle-là est comptée `changees`, et reste
 *   refusée au paiement.
 *
 * Ne se recalculent jamais, et ne sont pas lues ici : le journal de recherche et l'`ip_hash` d'un signalement (l'IP
 * n'est pas gardée), le corps d'un webhook (aucun lecteur), et les empreintes de cache (quelques minutes à 24 h). Ces
 * sites n'appellent que `AppKeyHmac::of()` : la pose de la clé leur fait perdre une fois ce qui avait été écrit sous
 * `APP_KEY`, de façon bornée (ADR-0084, amendement, point 2).
 *
 * Idempotente. Jouée À LA MAIN une fois les conteneurs neufs démarrés : l'ancien code ne lit que sous `APP_KEY`, et
 * `docker/release.sh` tourne pendant qu'il sert encore ; le release ne la joue qu'en `--dry-run`. Hors
 * `local`/`testing`, elle sort en 2 sans rien faire quand `APP_HMAC_KEY` manque : le release arrête alors le
 * déploiement. Écriture par `DB::table()` (ni
 * observateur, ni journal d'audit, ni `updated_at`), chaque fois contre l'ancienne valeur.
 */
class SecurityRehashFingerprints extends Command
{
    /** Code de sortie de la clé absente hors local/testing : `docker/release.sh` arrête le déploiement. */
    public const CLE_ABSENTE = 2;

    protected $signature = 'security:rehash-fingerprints {--dry-run : compter sans rien écrire}';

    protected $description = 'Réécrit sous APP_HMAC_KEY les empreintes persistantes qui se recalculent, et compte les autres.';

    private bool $aBlanc = false;

    public function handle(): int
    {
        if (! AppKeyHmac::hasDedicatedKey()) {
            if (! app()->environment(['local', 'testing'])) {
                $this->error('APP_HMAC_KEY est vide : les empreintes dépendraient encore d\'APP_KEY. À poser avant de déployer (ADR-0084, amendement du 2026-11-16).');

                return self::CLE_ABSENTE;
            }
            $this->warn('APP_HMAC_KEY est vide : repli sur APP_KEY (local/testing seulement).');
        }
        $this->aBlanc = (bool) $this->option('dry-run');

        foreach (['alertes' => $this->alertes(), 'bienvenue' => $this->bienvenue(), 'versements' => $this->versements()] as $famille => $bilan) {
            $ids = $bilan['ids_sans_source'];
            unset($bilan['ids_sans_source']);
            $this->line($famille.' — '.collect($bilan)->map(fn (int $n, string $nom) => "{$nom}={$n}")->implode(' ')
                .($ids !== [] ? ' ; sans source : #'.implode(', #', $ids) : ''));
        }
        $this->info('security:rehash-fingerprints'.($this->aBlanc ? ' (à blanc)' : '').' — terminé.');

        return self::SUCCESS;
    }

    /** @return array<string, mixed> */
    private function alertes(): array
    {
        $bilan = ['reecrites' => 0, 'courantes' => 0, 'sans_source' => 0, 'ids_sans_source' => []];
        AlertSubscriber::query()->select(['id', 'channel', 'contact', 'contact_hash', 'mailbox_hash'])
            ->chunkById(500, function ($abonnes) use (&$bilan): void {
                foreach ($abonnes as $abonne) {
                    try {
                        $contact = (string) $abonne->contact;
                    } catch (DecryptException) {
                        $bilan['sans_source']++;
                        $bilan['ids_sans_source'][] = $abonne->id;

                        continue;
                    }
                    $neuf = [
                        'contact_hash' => AlertSubscriber::contactHash((string) $abonne->channel, $contact),
                        'mailbox_hash' => AlertSubscriber::mailboxHash((string) $abonne->channel, $contact),
                    ];
                    if ($abonne->contact_hash === $neuf['contact_hash'] && $abonne->mailbox_hash === $neuf['mailbox_hash']) {
                        $bilan['courantes']++;

                        continue;
                    }
                    $bilan['reecrites']++;
                    if (! $this->aBlanc) {
                        DB::table('alert_subscribers')->where('id', $abonne->id)
                            ->where('contact_hash', $abonne->contact_hash)->update($neuf);
                    }
                }
            });

        return $bilan;
    }

    /** @return array<string, mixed> */
    private function bienvenue(): array
    {
        $bilan = ['reecrites' => 0, 'courantes' => 0, 'sans_source' => 0, 'conflits' => 0, 'ids_sans_source' => []];
        DB::table('credit_welcome_grants')
            ->leftJoin('users', 'users.id', '=', 'credit_welcome_grants.user_id')
            ->select(['credit_welcome_grants.id', 'credit_welcome_grants.phone_hash', 'users.phone'])
            ->chunkById(500, function ($octrois) use (&$bilan): void {
                foreach ($octrois as $octroi) {
                    $numero = is_string($octroi->phone) ? $octroi->phone : '';
                    if ($numero === '' || ! in_array($octroi->phone_hash, PhoneFingerprint::all($numero), true)) {
                        $bilan['sans_source']++;
                        $bilan['ids_sans_source'][] = $octroi->id;

                        continue;
                    }
                    $neuve = PhoneFingerprint::of($numero);
                    if ($octroi->phone_hash === $neuve) {
                        $bilan['courantes']++;
                    } elseif (DB::table('credit_welcome_grants')->where('phone_hash', $neuve)->where('id', '!=', $octroi->id)->exists()) {
                        $bilan['conflits']++;
                    } else {
                        $bilan['reecrites']++;
                        if (! $this->aBlanc) {
                            DB::table('credit_welcome_grants')->where('id', $octroi->id)
                                ->where('phone_hash', $octroi->phone_hash)->update(['phone_hash' => $neuve]);
                        }
                    }
                }
            }, 'credit_welcome_grants.id', 'id');

        return $bilan;
    }

    /** @return array<string, mixed> */
    private function versements(): array
    {
        $bilan = ['reecrites' => 0, 'courantes' => 0, 'changees' => 0, 'sans_source' => 0, 'ids_sans_source' => []];
        DB::table('payouts')
            ->whereIn('status', array_map(fn (PayoutStatus $s) => $s->value, PayoutStatus::upcoming()))
            ->whereNotNull('metadata')
            ->select(['id', 'metadata'])
            ->chunkById(500, function ($versements) use (&$bilan): void {
                foreach ($versements as $versement) {
                    $metadata = json_decode((string) $versement->metadata, true);
                    $stockee = is_array($metadata) ? ($metadata['approved_destination_fingerprint'] ?? null) : null;
                    $methode = is_array($metadata) ? ($metadata['approved_payout_method_id'] ?? null) : null;
                    if (! is_string($stockee) || $methode === null) {
                        continue;
                    }
                    try {
                        $destination = PayoutMethod::withTrashed()->find((int) $methode);
                        $empreintes = $destination?->fingerprints() ?? [];
                        $neuve = $destination?->fingerprint();
                    } catch (DecryptException) {
                        $destination = null;
                    }
                    if ($destination === null) {
                        $bilan['sans_source']++;
                        $bilan['ids_sans_source'][] = $versement->id;

                        continue;
                    }
                    if ($stockee === $neuve) {
                        $bilan['courantes']++;
                    } elseif (! in_array($stockee, $empreintes, true)) {
                        // La destination a changé depuis l'approbation : la réécrire l'approuverait.
                        $bilan['changees']++;
                    } else {
                        $bilan['reecrites']++;
                        if (! $this->aBlanc) {
                            $metadata['approved_destination_fingerprint'] = $neuve;
                            DB::table('payouts')->where('id', $versement->id)->where('metadata', $versement->metadata)
                                ->update(['metadata' => json_encode($metadata)]);
                        }
                    }
                }
            });

        return $bilan;
    }
}
