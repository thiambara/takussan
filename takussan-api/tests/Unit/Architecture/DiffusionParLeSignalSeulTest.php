<?php

namespace Tests\Unit\Architecture;

use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\SignalTempsReel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use Throwable;

/**
 * TCK-2952 (ADR-0129 § 1 et § 3) — un seul événement diffusé, `SignalTempsReel`, à trois clés, et un seul
 * émetteur, `App\Support\TempsReel\TempsReel`. Ce qui transite par le temps réel n'est jamais une donnée : un
 * abonné garde son canal après avoir perdu ses droits (l'autorisation se juge à l'abonnement), il ne doit donc
 * rien apprendre qu'il ne pourrait relire.
 *
 * Balayé : `app/`. Refusé :
 *  1. toute classe qui implémente `ShouldBroadcast` (donc `ShouldBroadcastNow`) et n'est pas `SignalTempsReel`
 *     — jugé par réflexion, une implémentation héritée compte ;
 *  2. une clé de `broadcastWith()` autre que `subject`, `event`, `cursor` ;
 *  3. une méthode `toBroadcast()`, la chaîne `'broadcast'` dans un `via()`, la classe `BroadcastChannel` des
 *     notifications : le troisième chemin de diffusion, celui que Laravel emprunte avec tout `toArray()` ;
 *  4. hors de `app/Support/TempsReel/` : un appel `broadcast(…)`, `Broadcast::event|queue|connection|driver(…)`,
 *     `event(new …Broadcast…)`, ou le diffuseur pris par le conteneur (`Broadcasting\Factory`,
 *     `BroadcastManager`, `Broadcaster`).
 *
 * **Hors d'atteinte, c'est un plancher** : un canal rangé dans une constante puis rendu par `via()`, un appel au
 * diffuseur par `app('Illuminate\…')` en chaîne. La relecture les attrape, pas cette garde.
 *
 * La garde se garde : le balayage doit voir plus de 500 classes, trouver `SignalTempsReel` parmi les diffusés,
 * et reconnaître le transport réel (`TransportParDiffusion`) comme un appel au diffuseur — un motif qui ne
 * verrait plus rien rendrait la règle 4 vide.
 */
class DiffusionParLeSignalSeulTest extends TestCase
{
    private const EMETTEUR = 'Support/TempsReel/';

    private const APPELS_AU_DIFFUSEUR = [
        'appel broadcast()' => '/(?<![\w$>:\\\\])(?<!function )broadcast\(/',
        'Broadcast::…()' => '/\bBroadcast::(event|queue|connection|driver|broadcast)\(/',
        'event(new …Broadcast…)' => '/\bevent\(new [\w\\\\]*Broadcast/',
        'diffuseur du conteneur' => '/Illuminate\\\\(Contracts\\\\Broadcasting\\\\(Factory|Broadcaster)|Broadcasting\\\\BroadcastManager)\b/',
    ];

    public function test_seul_signal_temps_reel_est_diffuse(): void
    {
        $diffuses = [];
        $classes = 0;
        foreach (self::fichiers() as $relatif => $chemin) {
            $classe = 'App\\'.str_replace(['/', '.php'], ['\\', ''], $relatif);
            try {
                if (! class_exists($classe)) {
                    continue;
                }
            } catch (Throwable) {
                continue;
            }
            $classes++;
            $reflexion = new ReflectionClass($classe);
            if (! $reflexion->isInterface() && $reflexion->implementsInterface(ShouldBroadcast::class)) {
                $diffuses[] = $classe;
            }
        }

        $this->assertGreaterThan(500, $classes, 'le balayage de app/ ne voit presque plus rien');
        $this->assertSame([SignalTempsReel::class], $diffuses, 'Seul SignalTempsReel est diffusé (ADR-0129 § 1).');
    }

    public function test_le_signal_n_a_que_trois_cles(): void
    {
        $signal = new SignalTempsReel(['utilisateur.1'], 'utilisateur:1', CodeDeSignal::NotificationsUpdated, '2026-11-17T10:00:00.123456Z');

        $this->assertSame(['subject', 'event', 'cursor'], array_keys($signal->broadcastWith()));
        $this->assertSame('signal', $signal->broadcastAs());
    }

    public function test_aucune_notification_ne_diffuse(): void
    {
        $fautes = [];
        $vus = 0;
        foreach (self::fichiers() as $relatif => $chemin) {
            $jetons = token_get_all((string) file_get_contents($chemin));
            $code = self::compacte($jetons);
            if (preg_match('/\bfunction toBroadcast\(/', $code) === 1) {
                $fautes[] = "{$relatif} : toBroadcast()";
            }
            if (preg_match('/Notifications\\\\Channels\\\\BroadcastChannel\b/', $code) === 1) {
                $fautes[] = "{$relatif} : BroadcastChannel";
            }
            foreach (self::corpsDeVia($jetons) as $corps) {
                $vus++;
                if (preg_match('/[\'"]broadcast[\'"]/', $corps) === 1) {
                    $fautes[] = "{$relatif} : 'broadcast' dans via()";
                }
            }
        }

        $this->assertGreaterThan(30, $vus, 'le balayage ne voit presque plus de via()');
        $this->assertSame([], $fautes, 'Le canal `broadcast` des notifications diffuse tout toArray() (ADR-0129).');
    }

    public function test_aucun_appel_au_diffuseur_hors_de_l_emetteur(): void
    {
        $fautes = [];
        $dansLEmetteur = [];
        foreach (self::fichiers() as $relatif => $chemin) {
            $code = self::compacte(token_get_all((string) file_get_contents($chemin)));
            foreach (self::APPELS_AU_DIFFUSEUR as $nom => $motif) {
                if (preg_match($motif, $code) !== 1) {
                    continue;
                }
                if (str_starts_with($relatif, self::EMETTEUR)) {
                    $dansLEmetteur[] = $relatif;
                } else {
                    $fautes[] = "{$relatif} : {$nom}";
                }
            }
        }

        $this->assertContains('Support/TempsReel/TransportParDiffusion.php', $dansLEmetteur, 'le motif ne reconnaît plus le transport réel');
        $this->assertSame([], $fautes, 'Tout signal part par App\Support\TempsReel\TempsReel (ADR-0129 § 3).');
    }

    /** @return iterable<string, string> chemin relatif à `app/` => chemin absolu */
    private static function fichiers(): iterable
    {
        $racine = dirname(__DIR__, 3).'/app';
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS)) as $fichier) {
            if ($fichier->getExtension() === 'php') {
                yield substr($fichier->getPathname(), strlen($racine) + 1) => $fichier->getPathname();
            }
        }
    }

    /** Le code sans commentaires, chaque blanc réduit à une espace. Les chaînes restent. */
    private static function compacte(array $jetons): string
    {
        $sortie = '';
        foreach ($jetons as $jeton) {
            if (! is_array($jeton)) {
                $sortie .= $jeton;

                continue;
            }
            $sortie .= match ($jeton[0]) {
                T_COMMENT, T_DOC_COMMENT => '',
                T_WHITESPACE => ' ',
                default => $jeton[1],
            };
        }

        return $sortie;
    }

    /**
     * Le corps de chaque méthode `via()`, sans commentaires.
     *
     * @return list<string>
     */
    private static function corpsDeVia(array $jetons): array
    {
        $corps = [];
        $n = count($jetons);
        for ($i = 0; $i < $n; $i++) {
            if (! is_array($jetons[$i]) || $jetons[$i][0] !== T_FUNCTION) {
                continue;
            }
            $j = $i + 1;
            while ($j < $n && is_array($jetons[$j]) && $jetons[$j][0] === T_WHITESPACE) {
                $j++;
            }
            if (! is_array($jetons[$j] ?? null) || $jetons[$j][1] !== 'via') {
                continue;
            }
            while ($j < $n && $jetons[$j] !== '{') {
                $j++;
            }
            $profondeur = 0;
            $debut = $j;
            for (; $j < $n; $j++) {
                $texte = is_array($jetons[$j]) ? $jetons[$j][1] : $jetons[$j];
                if ($texte === '{' || (is_array($jetons[$j]) && in_array($jetons[$j][0], [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) {
                    $profondeur++;
                } elseif ($texte === '}') {
                    $profondeur--;
                    if ($profondeur === 0) {
                        break;
                    }
                }
            }
            $corps[] = self::compacte(array_slice($jetons, $debut, $j - $debut + 1));
        }

        return $corps;
    }
}
