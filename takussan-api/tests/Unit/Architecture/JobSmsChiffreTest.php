<?php

namespace Tests\Unit\Architecture;

use App\Jobs\SendDeferredSmsJob;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;

/**
 * TCK-678 (piste P11.03) — tout job mis en file qui porte un texte de SMS est chiffré.
 *
 * Mesuré le 2026-10-16 : `SendDeferredSmsJob` reçoit, entre 22 h et 6 h, le texte déjà rendu
 * d'un SMS (liens de paiement, de quittance, d'invitation) et l'attendait en clair dans la table
 * `jobs`, alors que `CodedNotification` est chiffrée exprès (TCK-602).
 *
 * La règle : une classe de `app/` qui implémente `ShouldQueue` et cite l'API d'envoi de SMS
 * ({@see self::ENVOI_SMS}) porte le texte qu'elle remettra au pilote : elle implémente
 * `ShouldBeEncrypted`. Les notifications ne sont pas visées : elles sérialisent leurs modèles et
 * rendent leur texte à l'envoi, et `CodedNotification`, qui porte ses paramètres, est déjà
 * chiffrée.
 *
 * La garde se garde elle-même : si elle ne trouve plus `SendDeferredSmsJob`, elle rougit.
 */
class JobSmsChiffreTest extends TestCase
{
    private const ENVOI_SMS = '/\b(SmsDriverInterface|SmsRouterDriver)\b/';

    /**
     * @return list<class-string>
     */
    private function jobsPortantUnSms(): array
    {
        $racine = dirname(__DIR__, 3).'/app';
        $trouves = [];

        $iterateur = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine));
        foreach ($iterateur as $fichier) {
            if (! $fichier->isFile() || $fichier->getExtension() !== 'php') {
                continue;
            }
            $source = (string) file_get_contents($fichier->getPathname());
            if (preg_match(self::ENVOI_SMS, $source) !== 1) {
                continue;
            }
            $relatif = substr($fichier->getPathname(), strlen($racine) + 1, -4);
            $classe = 'App\\'.str_replace('/', '\\', $relatif);
            if (! class_exists($classe)) {
                continue;
            }
            $reflexion = new ReflectionClass($classe);
            if ($reflexion->isAbstract()
                || ! $reflexion->implementsInterface(ShouldQueue::class)
                || $reflexion->isSubclassOf(Notification::class)) {
                continue;
            }
            $trouves[] = $classe;
        }

        sort($trouves);

        return $trouves;
    }

    public function test_tout_job_portant_un_texte_de_sms_est_chiffre(): void
    {
        $jobs = $this->jobsPortantUnSms();

        $this->assertContains(SendDeferredSmsJob::class, $jobs, 'la garde ne voit plus le job du report nocturne');

        $enClair = array_values(array_filter(
            $jobs,
            fn (string $classe) => ! is_subclass_of($classe, ShouldBeEncrypted::class),
        ));
        $this->assertSame([], $enClair, 'ces jobs portent un texte de SMS en clair dans la file');
    }
}
