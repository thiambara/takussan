<?php

namespace Tests\Unit\Architecture;

use App\Notifications\AccountDeletionStepUpCodeNotification;
use App\Notifications\CodedNotification;
use App\Notifications\RegistrationConfirmationNotification;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;

/**
 * TCK-1352 (P142.05) — toute notification mise en file attend avant de réessayer (`backoff()`)
 * et journalise son échec final (`failed()`), comme `CodedNotification` depuis TCK-800 : sans
 * eux, le worker (`--tries=3`) épuise ses essais en quelques secondes, et l'échec ne laisse
 * qu'une ligne de `failed_jobs`.
 *
 * Un code ou un lien court ne se réessaie pas au-delà de sa durée de vie (`retryUntil()`).
 *
 * La garde se garde elle-même : si elle ne trouve plus `CodedNotification`, elle rougit.
 */
class NotificationsEnFileTest extends TestCase
{
    /** Les codes et liens à courte durée de vie (minutes) : ni la réinitialisation, ni la confirmation, ni le code de suppression ne se livrent périmés. */
    private const COURTE_DUREE = [
        AccountDeletionStepUpCodeNotification::class,
        RegistrationConfirmationNotification::class,
        ResetPasswordNotification::class,
    ];

    /** @return list<class-string> */
    private function notificationsEnFile(): array
    {
        $racine = dirname(__DIR__, 3).'/app';
        $trouves = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine.'/Notifications')) as $fichier) {
            if (! $fichier->isFile() || $fichier->getExtension() !== 'php') {
                continue;
            }
            $classe = 'App\\'.str_replace('/', '\\', substr($fichier->getPathname(), strlen($racine) + 1, -4));
            if (! class_exists($classe)) {
                continue;
            }
            $reflexion = new ReflectionClass($classe);
            if (! $reflexion->isAbstract() && $reflexion->isSubclassOf(Notification::class) && $reflexion->implementsInterface(ShouldQueue::class)) {
                $trouves[] = $classe;
            }
        }
        sort($trouves);

        return $trouves;
    }

    public function test_toute_notification_en_file_attend_avant_de_reessayer_et_journalise_son_echec(): void
    {
        $classes = $this->notificationsEnFile();
        $this->assertContains(CodedNotification::class, $classes, 'la garde ne voit plus les notifications en file');

        $manquent = array_values(array_filter(
            $classes,
            fn (string $c) => ! method_exists($c, 'backoff') || ! method_exists($c, 'failed'),
        ));
        $this->assertSame([], $manquent, 'ces notifications en file n\'ont ni backoff() ni failed()');
    }

    public function test_un_code_ou_un_lien_court_ne_se_reessaie_pas_au_dela_de_sa_duree_de_vie(): void
    {
        foreach (self::COURTE_DUREE as $classe) {
            $this->assertTrue(method_exists($classe, 'retryUntil'), "{$classe} : retryUntil()");
        }
    }
}
