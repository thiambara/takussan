<?php

namespace App\Support\TempsReel;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use LogicException;
use PHPUnit\Framework\Assert;
use Throwable;

/**
 * TCK-2952 (ADR-0129 § 3) — L'ÉMETTEUR : aucun autre code ne diffuse.
 *
 * - `signaler($sujet, $code)` → `sujet.{type}.{id}`, `subject` = l'objet du canal ;
 * - `signalerA($utilisateurs, $code, ?$sujet)` → `utilisateur.{id}` de chacun. `subject` = `$sujet` s'il est
 *   donné, IDENTIQUE pour tous les destinataires (un envoi n'a qu'une charge utile) ; sans objet,
 *   `utilisateur:{id}`, et chaque personne reçoit alors son propre envoi.
 *
 * Règles, chacune tenue par `tests/Feature/TempsReel/EmetteurTest` :
 * - **après le COMMIT** (`DB::afterCommit`, immédiat hors transaction) : un signal ne précède jamais la donnée,
 *   une transaction annulée n'émet rien ;
 * - **dédoublonné par unité de travail** ({@see UniteDeTravail}, `scoped`) : un `(canal, sujet, code)` part une
 *   fois par requête ou par job ;
 * - **par paquets de 100 canaux**, la limite d'un appel du protocole Pusher : 150 destinataires = 2 envois ;
 * - **jamais d'échec qui remonte** : un échec est journalisé (canal et code seulement), compté dans
 *   `temps-reel:echecs:<jour>`, et coupe l'émission jusqu'à la fin de l'unité (chaque signal abandonné
 *   compte comme un échec) — une requête ne paie le délai d'1 s qu'une fois.
 */
final class TempsReel
{
    /** La limite de canaux d'un appel `trigger` du protocole Pusher. */
    public const CANAUX_PAR_ENVOI = 100;

    public const PREFIXE_DU_COMPTEUR = 'temps-reel:echecs:';

    /** Signale que `$sujet` a changé, à qui regarde son canal `sujet.{type}.{id}`. */
    public static function signaler(Model $sujet, CodeDeSignal $code): void
    {
        self::apresLeCommit([CanauxTempsReel::canalDuSujet($sujet)], CanauxTempsReel::sujetDe($sujet), $code);
    }

    /**
     * Signale `$code` sur le canal personnel de chaque destinataire.
     *
     * @param  User|int|iterable<User|int>  $utilisateurs
     */
    public static function signalerA(User|int|iterable $utilisateurs, CodeDeSignal $code, ?Model $sujet = null): void
    {
        $ids = self::identifiants($utilisateurs);
        if ($ids === []) {
            return;
        }

        if ($sujet !== null) {
            self::apresLeCommit(array_map(CanauxTempsReel::canalDe(...), $ids), CanauxTempsReel::sujetDe($sujet), $code);

            return;
        }

        foreach ($ids as $id) {
            self::apresLeCommit([CanauxTempsReel::canalDe($id)], CanauxTempsReel::UTILISATEUR.':'.$id, $code);
        }
    }

    /**
     * Remplace le transport par un enregistreur, pour la suite de ce test. Le reste de l'émetteur — COMMIT,
     * dédoublonnage, paquets, disjoncteur — reste le vrai. Repart d'une unité de travail vide.
     */
    public static function fake(): FauxTransport
    {
        app()->instance(TransportTempsReel::class, $faux = new FauxTransport);
        app()->forgetInstance(UniteDeTravail::class);

        return $faux;
    }

    public static function assertSignale(CodeDeSignal $code, string $canal, ?string $sujet = null, ?int $fois = null): void
    {
        self::faux()->assertSignale($code, $canal, $sujet, $fois);
    }

    public static function assertRienSignale(): void
    {
        self::faux()->assertRienSignale();
    }

    private static function faux(): FauxTransport
    {
        $transport = app(TransportTempsReel::class);
        Assert::assertInstanceOf(FauxTransport::class, $transport, 'TempsReel::fake() n\'a pas été appelé.');

        return $transport;
    }

    /** @param  list<string>  $canaux */
    private static function apresLeCommit(array $canaux, string $sujet, CodeDeSignal $code): void
    {
        DB::afterCommit(fn () => self::emettre($canaux, $sujet, $code));
    }

    /**
     * Le moment de l'émission : le dédoublonnage se juge ICI, après le COMMIT — un signal d'une transaction
     * annulée n'a jamais été émis, et ne doit pas empêcher le suivant.
     *
     * @param  list<string>  $canaux
     */
    private static function emettre(array $canaux, string $sujet, CodeDeSignal $code): void
    {
        $unite = app(UniteDeTravail::class);
        $neufs = array_values(array_filter($canaux, fn (string $canal): bool => ! $unite->dejaEmis($canal, $sujet, $code)));
        if ($neufs === []) {
            return;
        }

        // Un seul instant pour tous les paquets d'un même envoi.
        $curseur = CarbonImmutable::now('UTC')->format(SignalTempsReel::FORME_DU_CURSEUR);
        $transport = app(TransportTempsReel::class);

        foreach (array_chunk($neufs, self::CANAUX_PAR_ENVOI) as $paquet) {
            if ($unite->coupee()) {
                self::compterUnEchec($paquet, $code, null);

                continue;
            }

            try {
                $transport->envoyer(new SignalTempsReel($paquet, $sujet, $code, $curseur));
            } catch (Throwable $e) {
                $unite->couper();
                self::compterUnEchec($paquet, $code, $e);

                continue;
            }

            foreach ($paquet as $canal) {
                $unite->marquerEmis($canal, $sujet, $code);
            }
        }
    }

    /**
     * Journal : le canal et le code, la classe de l'exception — jamais son message, qui porterait l'URL
     * du diffuseur (clé publique, signature) ou un contenu.
     *
     * @param  list<string>  $paquet
     */
    private static function compterUnEchec(array $paquet, CodeDeSignal $code, ?Throwable $e): void
    {
        try {
            Log::warning('[temps-reel] signal non émis', array_filter([
                'canal' => $paquet[0] ?? null,
                'canaux' => count($paquet),
                'code' => $code->value,
                'exception' => $e === null ? 'disjoncteur' : $e::class,
            ], fn ($valeur) => $valeur !== null));

            $cle = self::PREFIXE_DU_COMPTEUR.now()->format('Y-m-d');
            Cache::add($cle, 0, now()->addDays(8));
            Cache::increment($cle);
        } catch (Throwable) {
            // Un journal ou un cache injoignable ne change pas la réponse.
        }
    }

    /**
     * @param  User|int|iterable<User|int>  $utilisateurs
     * @return list<int>
     */
    private static function identifiants(User|int|iterable $utilisateurs): array
    {
        $liste = $utilisateurs instanceof User || is_int($utilisateurs) ? [$utilisateurs] : $utilisateurs;
        $ids = [];
        foreach ($liste as $utilisateur) {
            $id = $utilisateur instanceof User ? (int) $utilisateur->getKey() : $utilisateur;
            if (! is_int($id) || $id <= 0) {
                throw new LogicException('TempsReel::signalerA() attend des User ou des identifiants entiers.');
            }
            $ids[$id] = $id;
        }

        return array_values($ids);
    }
}
