<?php

namespace App\Support\TempsReel;

use PHPUnit\Framework\Assert;

/**
 * TCK-2952 — le transport des tests, posé par {@see TempsReel::fake()} : il enregistre chaque envoi au lieu de
 * le diffuser. Tout ce qui est au-dessus du transport (COMMIT, dédoublonnage, paquets, disjoncteur) reste réel.
 */
final class FauxTransport implements TransportTempsReel
{
    /** @var list<SignalTempsReel> */
    private array $envois = [];

    public function envoyer(SignalTempsReel $signal): void
    {
        $this->envois[] = $signal;
    }

    /** @return list<SignalTempsReel> chaque appel au transport, dans l'ordre */
    public function envois(): array
    {
        return $this->envois;
    }

    /**
     * Un signal `$code` est parti vers `$canal` (sans préfixe), avec ce `subject` s'il est donné — `$fois`
     * fois exactement s'il est donné, au moins une fois sinon.
     */
    public function assertSignale(CodeDeSignal $code, string $canal, ?string $sujet = null, ?int $fois = null): void
    {
        $trouves = count(array_filter(
            $this->envois,
            fn (SignalTempsReel $s): bool => $s->code === $code
                && in_array($canal, $s->canaux, true)
                && ($sujet === null || $s->sujet === $sujet),
        ));

        $attendu = sprintf('%s vers %s%s', $code->value, $canal, $sujet === null ? '' : " (subject {$sujet})");
        if ($fois === null) {
            Assert::assertGreaterThan(0, $trouves, "Aucun signal {$attendu}. Envois : ".$this->decrire());
        } else {
            Assert::assertSame($fois, $trouves, "Signal {$attendu} : {$trouves} envois au lieu de {$fois}. Envois : ".$this->decrire());
        }
    }

    public function assertRienSignale(): void
    {
        Assert::assertSame([], $this->envois, 'Des signaux sont partis : '.$this->decrire());
    }

    private function decrire(): string
    {
        return json_encode(array_map(fn (SignalTempsReel $s): array => [
            'canaux' => $s->canaux,
        ] + $s->broadcastWith(), $this->envois), JSON_UNESCAPED_SLASHES) ?: '[]';
    }
}
