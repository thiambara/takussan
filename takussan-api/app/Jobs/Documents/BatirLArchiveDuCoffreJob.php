<?php

namespace App\Jobs\Documents;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Exceptions\ApiError;
use App\Models\DocumentVaultArchive;
use App\Models\Enums\DocumentVaultArchiveStatus;
use App\Models\User;
use App\Services\Documents\ArchiveDuCoffre;
use App\Services\Model\NotificationService;
use App\Services\Pdf\EchecDuPilotePdf;
use Closure;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * TCK-2812 (ADR-0099, amendement du 2026-11-14) — bâtit l'archive PRÉPARÉE d'un dossier du coffre, au-delà
 * du seuil synchrone de TCK-2770, et la range sur le disque des médias privés.
 *
 * **Le travail ne juge rien de neuf, et il juge à la construction.** Il ne reçoit que l'identifiant de la
 * préparation : aucune entrée du dossier n'a été gardée à la demande. Il rappelle
 * {@see ArchiveDuCoffre::construire()}, qui prend le dossier dans le coffre que `DocumentVault::for()` rend
 * à l'appelant MAINTENANT. Une pièce devenue interne ou illisible depuis la demande n'y entre donc pas.
 *
 * **Le coffre se juge sous le profil actif de la demande.** Hors requête, il n'y a pas de profil actif, et
 * `User::activeProfile()`, l'agence de l'appelant et les policies le lisent dans
 * `request()->attributes['active_profile']`. Le travail l'y pose le temps de la construction, avec la langue
 * de la demande (les noms des générés la suivent), puis rend l'état d'avant : le worker sert d'autres
 * travaux avec le même objet de requête (même patron que `DocumentExpiryReminder::destinataire()`).
 *
 * **File `media`, 85 s au plus** : la connexion `database` relivre après 90 s (`scripts/check-queues.mjs`),
 * d'où le plafond {@see ArchiveDuCoffre::MAX_FICHIERS_PREPAREE}. Un dépassement échoue la préparation au lieu
 * de la rejouer (`$failOnTimeout`).
 *
 * **Une limite de débit du pilote PDF** (TCK-2811) relâche le travail pour un nouvel essai différé, jusqu'à
 * {@see self::$tries} essais. Chaque essai rebâtit l'archive depuis le début. Tout autre refus termine la
 * préparation en échec. Un échec notifie l'appelant et ne laisse aucun fichier : l'archive s'écrit d'abord
 * dans un fichier temporaire, et ne part sur le disque qu'entière.
 */
final class BatirLArchiveDuCoffreJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 85;

    public bool $failOnTimeout = true;

    /** Le premier essai, puis trois nouveaux essais après une limite de débit du pilote. */
    public int $tries = 4;

    public function __construct(public readonly int $archiveId)
    {
        $this->onQueue('media');
    }

    public function handle(ArchiveDuCoffre $archives, NotificationService $notifications): void
    {
        $archive = DocumentVaultArchive::query()->find($this->archiveId);
        if ($archive === null || $archive->status !== DocumentVaultArchiveStatus::Pending) {
            return;
        }

        $user = $archive->user;
        $profil = $archive->profil();
        if (! $user instanceof User || $profil === false) {
            $this->echouer($archive, 'document.archive_unavailable', $notifications);

            return;
        }

        try {
            $construite = $this->sousLeProfil(
                $profil,
                $archive->locale,
                fn (): array => $archives->construire($user, $profil, $archive->folder, ArchiveDuCoffre::MAX_FICHIERS_PREPAREE),
            );
        } catch (ApiError $e) {
            if ($e->errorCode === 'document.archive_render_busy' && $this->attempts() < $this->tries) {
                $this->release(EchecDuPilotePdf::REESSAYER_APRES);

                return;
            }
            $this->echouer($archive, $e->errorCode, $notifications);

            return;
        } catch (HttpExceptionInterface) {
            // Le dossier n'est plus dans le coffre de l'appelant (404).
            $this->echouer($archive, 'document.archive_unavailable', $notifications);

            return;
        }

        $disque = self::disque();
        $chemin = DocumentVaultArchive::cheminPour($user->id, $archive->uuid);
        $flux = $construite['stream'];
        try {
            if (Storage::disk($disque)->writeStream($chemin, $flux) !== true) {
                throw new RuntimeException("L'archive du coffre n'a pas pu écrire {$chemin}.");
            }
        } catch (Throwable $e) {
            Storage::disk($disque)->delete($chemin);
            throw $e;
        } finally {
            if (is_resource($flux)) {
                fclose($flux);
            }
        }

        // Seule une préparation encore en cours devient prête : effacée ou terminée entre-temps, le fichier
        // écrit ne resterait référencé par aucune ligne, et aucune purge ne le retrouverait.
        $prete = DocumentVaultArchive::query()
            ->whereKey($archive->id)
            ->where('status', DocumentVaultArchiveStatus::Pending->value)
            ->update([
                'status' => DocumentVaultArchiveStatus::Ready->value,
                'disk' => $disque,
                'path' => $chemin,
                'size' => $construite['size'],
                'entries_count' => $construite['entries'],
                'expires_at' => now()->addHours(DocumentVaultArchive::DUREE_EN_HEURES),
                'updated_at' => now(),
            ]);
        if ($prete !== 1) {
            Storage::disk($disque)->delete($chemin);

            return;
        }

        $notifications->send($user, NotificationCode::DocumentArchiveReady, [], NotificationTarget::of('document_archive'));
    }

    /** Les essais épuisés, le délai dépassé, ou une erreur imprévue : la préparation échoue, sans fichier. */
    public function failed(?Throwable $e): void
    {
        $archive = DocumentVaultArchive::query()->find($this->archiveId);
        if ($archive !== null) {
            $code = $e instanceof ApiError ? $e->errorCode : 'document.archive_render_failed';
            $this->echouer($archive, $code, app(NotificationService::class));
        }
    }

    /** Le disque des médias privés : `local` en dev et en test, `r2-private` ensuite (ADR-0029). */
    public static function disque(): string
    {
        return (string) config('media-library.disk_name');
    }

    /**
     * Termine la préparation en échec, une fois : seule une préparation encore en cours passe à l'échec et
     * notifie. Aucun fichier ne reste.
     */
    private function echouer(DocumentVaultArchive $archive, string $code, NotificationService $notifications): void
    {
        Storage::disk(self::disque())->delete(DocumentVaultArchive::cheminPour($archive->user_id, $archive->uuid));

        $echouee = DocumentVaultArchive::query()
            ->whereKey($archive->id)
            ->where('status', DocumentVaultArchiveStatus::Pending->value)
            ->update(['status' => DocumentVaultArchiveStatus::Failed->value, 'error_code' => mb_substr($code, 0, 80), 'updated_at' => now()]);

        $user = $archive->user;
        if ($echouee === 1 && $user instanceof User) {
            $notifications->send($user, NotificationCode::DocumentArchiveFailed, [], NotificationTarget::of('document_archive'));
        }
    }

    /**
     * Exécute `$construire` sous le profil actif et la langue de la demande, puis rend l'état d'avant.
     *
     * @template T
     *
     * @param  Closure(): T  $construire
     * @return T
     */
    private function sousLeProfil(?Model $profil, string $locale, Closure $construire): mixed
    {
        $attributs = request()->attributes;
        $avait = $attributs->has('active_profile');
        $avant = $attributs->get('active_profile');
        $langue = app()->getLocale();

        $profil !== null ? $attributs->set('active_profile', $profil) : $attributs->remove('active_profile');
        app()->setLocale($locale);

        try {
            return $construire();
        } finally {
            $avait ? $attributs->set('active_profile', $avant) : $attributs->remove('active_profile');
            app()->setLocale($langue);
        }
    }
}
