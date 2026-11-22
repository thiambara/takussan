<?php

namespace App\Support\TempsReel;

use Illuminate\Container\Attributes\Scoped;

/**
 * TCK-2952 (ADR-0129 § 3) — la mémoire de l'émetteur pour UNE unité de travail (une requête, un job) :
 *  - les `(canal, sujet, code)` déjà émis, pour qu'un même signal ne parte qu'une fois ;
 *  - le disjoncteur : après un premier échec, plus aucun envoi jusqu'à la fin de l'unité — une requête ne
 *    paie le délai d'1 s qu'une fois, même Reverb absent.
 *
 * **Lié en `scoped`**, pas en `singleton` : le worker de file vide les instances de portée avant chaque job
 * (`QueueServiceProvider::registerWorker`, `forgetScopedInstances()`), et un singleton garderait d'un job à
 * l'autre la trace des signaux émis — le second job n'émettrait plus rien. Une requête HTTP la vide en fin de
 * traitement (`App\Listeners\TempsReel\FinDUniteDeTravail`), pour qu'un processus qui sert plusieurs requêtes
 * — les tests, Octane — ne partage pas non plus cette mémoire entre deux requêtes.
 */
#[Scoped]
final class UniteDeTravail
{
    /** @var array<string, true> */
    private array $emis = [];

    private bool $coupee = false;

    public function dejaEmis(string $canal, string $sujet, CodeDeSignal $code): bool
    {
        return isset($this->emis[self::cle($canal, $sujet, $code)]);
    }

    public function marquerEmis(string $canal, string $sujet, CodeDeSignal $code): void
    {
        $this->emis[self::cle($canal, $sujet, $code)] = true;
    }

    public function coupee(): bool
    {
        return $this->coupee;
    }

    public function couper(): void
    {
        $this->coupee = true;
    }

    private static function cle(string $canal, string $sujet, CodeDeSignal $code): string
    {
        return $canal."\0".$sujet."\0".$code->value;
    }
}
