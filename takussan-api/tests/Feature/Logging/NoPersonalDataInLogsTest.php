<?php

namespace Tests\Feature\Logging;

use App\Services\Notifications\Sms\SmsDriverInterface;
use App\Services\Notifications\Whatsapp\LogWhatsappDriver;
use App\Services\Notifications\Whatsapp\WhatsappMessage;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\Support\JournalCapture;
use Tests\TestCase;

/**
 * TCK-613 (ADR-0044 §2) — aucune exception ni pilote de journal n'écrit une donnée personnelle.
 *
 * - AC1 : le rapport par défaut du framework est REMPLACÉ par la forme sûre — un refus SMTP rapporté
 *   ne laisse plus l'adresse refusée au journal (sonde P7 de verif-601) ;
 * - AC2 : garde structurelle — aucun appel `Log::`/`logger()` de `app/` ne reçoit `getMessage()` ni
 *   l'objet exception lui-même ;
 * - AC3 : le repli de journal (`SMS_LOG_FALLBACK`) n'écrit ni le numéro entier ni le texte, qui porte
 *   un lien porteur `/pay/{jeton}`.
 */
class NoPersonalDataInLogsTest extends TestCase
{
    use JournalCapture, RefreshDatabase;

    private const TEMOIN_EMAIL = 'p7.temoin@exemple.sn';

    private const TEMOIN_JETON = 'jetontemoin613payabcdef';

    private const TEMOIN_NUMERO = '+221771234567';

    /**
     * Les seuls fichiers de `app/` autorisés à passer un message d'exception à un journal, chacun
     * avec son motif. Vide aujourd'hui : une entrée s'ajoute en disant pourquoi.
     *
     * @var array<string, string>
     */
    private const EXEMPTIONS = [];

    /** AC1 — rejeu de la sonde P7. */
    public function test_une_exception_rapportee_ne_laisse_pas_son_message_au_journal(): void
    {
        $this->captureJournal();

        report(new TransportException('Expected response code "250" but got code "550", with message "550 <'.self::TEMOIN_EMAIL.'>: Recipient address rejected".'));

        $this->assertJournalSansTemoin(self::TEMOIN_EMAIL);
        $entrees = $this->entreesJournal('exception');
        $this->assertNotEmpty($entrees, 'le rapport doit rester — sous sa forme sûre');
        foreach ($entrees as $entree) {
            $this->assertSame(TransportException::class, $entree['context']['exception']);
            $this->assertArrayHasKey('at', $entree['context']);
        }
    }

    /** AC1 — `dontReport` reste respecté : rien n'est écrit, ni sous la forme sûre. */
    public function test_une_exception_que_le_framework_ne_rapporte_pas_n_est_pas_journalisee(): void
    {
        $this->captureJournal();

        report(ValidationException::withMessages(['email' => self::TEMOIN_EMAIL]));
        $handler = app(ExceptionHandler::class);
        $this->assertFalse($handler->shouldReport(ValidationException::withMessages([])));

        $this->assertSame([], $this->journal);
    }

    /** AC2 — aucune occurrence de `getMessage()` (ni de l'exception elle-même) passée à un journal. */
    public function test_aucun_journal_de_app_ne_recoit_un_message_d_exception(): void
    {
        $violations = [];
        $racine = app_path();
        $iterateur = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iterateur as $fichier) {
            if ($fichier->getExtension() !== 'php') {
                continue;
            }
            $relatif = 'app/'.str_replace(DIRECTORY_SEPARATOR, '/', substr($fichier->getPathname(), strlen($racine) + 1));
            if (array_key_exists($relatif, self::EXEMPTIONS)) {
                continue;
            }
            foreach (self::fuites((string) file_get_contents($fichier->getPathname())) as $ligne) {
                $violations[] = "{$relatif}:{$ligne}";
            }
        }

        $this->assertSame([], $violations, "Un journal reçoit un message d'exception — passer par SafeExceptionContext::of(\$e) :\n".implode("\n", $violations));
    }

    /** AC2 — le détecteur lui-même : un pilote ajouté demain qui journalise `getMessage()` rougit. */
    public function test_le_detecteur_voit_les_formes_qui_fuient_et_laisse_la_forme_sure(): void
    {
        $fuites = <<<'PHP'
        <?php
        try { x(); } catch (\Throwable $e) {
            Log::warning('[sms.demain] HTTP exception', ['error' => $e->getMessage()]);
            Log::channel('stack')->error('x', [
                'exception' => $e,
            ]);
            logger()->info('y', ['e' => (string) $e]);
            Log::error($e->getPrevious()?->getMessage());
        }
        function f(?\Throwable $exception) { Log::error('z', ['exception' => $exception?->getMessage()]); }
        PHP;
        $this->assertSame([3, 5, 7, 8, 10], self::fuites($fuites));

        $sures = <<<'PHP'
        <?php
        try { x(); } catch (\Throwable $e) {
            Log::warning('[sms.demain] HTTP exception', ['error' => SafeExceptionContext::of($e)]);
            Log::error('x', ['code' => $e->getCode(), 'class' => $e::class] + SafeExceptionContext::of($e));
            $this->error($e->getMessage());
        }
        PHP;
        $this->assertSame([], self::fuites($sures));
    }

    /** AC3 — le repli de journal du SMS, par le routeur, comme le dispose `SMS_LOG_FALLBACK`. */
    public function test_le_repli_de_journal_sms_n_ecrit_ni_le_jeton_ni_le_numero(): void
    {
        config([
            'sms.default_driver' => 'router',
            'sms.fallback_chains' => array_map(fn () => ['log'], (array) config('sms.fallback_chains')) + ['default' => ['log']],
        ]);
        $this->captureJournal();

        app(SmsDriverInterface::class)->send(self::TEMOIN_NUMERO, 'Payez votre loyer : https://takussan.test/pay/'.self::TEMOIN_JETON, ['bypass_quiet_hours' => true, 'is_critical' => true]);

        $this->assertNotEmpty($this->entreesJournal('[sms-log-driver] dispatched'));
        $this->assertJournalSansTemoin(self::TEMOIN_JETON, '771234567');
    }

    /** AC3 — le pilote de journal WhatsApp : suffixe du numéro et longueur, jamais le texte. */
    public function test_le_pilote_de_journal_whatsapp_n_ecrit_ni_le_jeton_ni_le_numero(): void
    {
        $this->captureJournal();

        $texte = 'Payez votre loyer : https://takussan.test/pay/'.self::TEMOIN_JETON;
        app(LogWhatsappDriver::class)->send(self::TEMOIN_NUMERO, WhatsappMessage::text($texte), ['agency_id' => 1]);

        $entrees = $this->entreesJournal('[whatsapp-log-driver] dispatched');
        $this->assertCount(1, $entrees);
        $this->assertSame('4567', $entrees[0]['context']['phone_suffix']);
        $this->assertSame(mb_strlen($texte), $entrees[0]['context']['text_length']);
        $this->assertJournalSansTemoin(self::TEMOIN_JETON, '771234567');
    }

    /**
     * Les lignes des appels de journal (`Log::…`, `logger(…)`) qui reçoivent `getMessage()`, ou une
     * variable d'exception telle quelle (`=> $e`, `(string) $e`). Une variable d'exception est une
     * variable de `catch`, ou un paramètre typé `…Throwable`/`…Exception`/`…Error`.
     *
     * @return list<int>
     */
    public static function fuites(string $source): array
    {
        $jetons = array_values(array_filter(
            token_get_all($source),
            fn ($j) => ! is_array($j) || ! in_array($j[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true),
        ));
        $texte = fn ($j) => is_array($j) ? $j[1] : $j;

        // Les variables d'exception du fichier.
        $variablesDException = [];
        foreach ($jetons as $i => $jeton) {
            if (is_array($jeton) && in_array($jeton[0], [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED], true)
                && preg_match('/(Throwable|Exception|Error)$/', $jeton[1]) === 1
                && is_array($jetons[$i + 1] ?? null) && $jetons[$i + 1][0] === T_VARIABLE) {
                $variablesDException[$jetons[$i + 1][1]] = true;
            }
        }

        $lignes = [];
        $n = count($jetons);
        for ($i = 0; $i < $n; $i++) {
            $jeton = $jetons[$i];
            $debut = is_array($jeton) && (
                ($jeton[0] === T_STRING && in_array($jeton[1], ['Log', 'logger'], true) && in_array($texte($jetons[$i + 1] ?? ''), ['::', '('], true))
                || ($jeton[0] === T_NAME_FULLY_QUALIFIED && in_array($jeton[1], ['\\Log', '\\Illuminate\\Support\\Facades\\Log'], true))
            );
            // `$this->logger(...)`, `->Log` : pas la façade.
            if (! $debut || in_array($texte($jetons[$i - 1] ?? ''), ['->', '?->', '::', 'function'], true)) {
                continue;
            }

            // Jusqu'à la fin de l'instruction, au niveau d'imbrication de départ.
            $profondeur = 0;
            for ($k = $i + 1; $k < $n; $k++) {
                $t = $texte($jetons[$k]);
                if (in_array($t, ['(', '[', '{'], true) || (is_array($jetons[$k]) && in_array($jetons[$k][0], [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) {
                    $profondeur++;
                } elseif (in_array($t, [')', ']', '}'], true)) {
                    if (--$profondeur < 0) {
                        break;
                    }
                } elseif ($t === ';' && $profondeur === 0) {
                    break;
                }

                $courant = $jetons[$k];
                $fuite = false;
                if (is_array($courant) && $courant[0] === T_STRING && $courant[1] === 'getMessage'
                    && in_array($texte($jetons[$k - 1]), ['->', '?->'], true)) {
                    $fuite = true;
                } elseif (is_array($courant) && $courant[0] === T_VARIABLE && isset($variablesDException[$courant[1]])) {
                    $avant = $jetons[$k - 1];
                    $apres = $texte($jetons[$k + 1] ?? '');
                    $fuite = in_array($apres, [',', ']', ')'], true)
                        && (in_array($texte($avant), ['=>', '[', ','], true) || (is_array($avant) && $avant[0] === T_STRING_CAST));
                }
                if ($fuite) {
                    $lignes[] = self::ligne($jetons, $k);
                }
            }
            $i = $k;
        }

        return array_values(array_unique($lignes));
    }

    /** @param  list<mixed>  $jetons */
    private static function ligne(array $jetons, int $k): int
    {
        for (; $k >= 0; $k--) {
            if (is_array($jetons[$k])) {
                return $jetons[$k][2];
            }
        }

        return 0;
    }
}
