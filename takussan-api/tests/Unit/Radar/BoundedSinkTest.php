<?php

namespace Tests\Unit\Radar;

use App\Services\Radar\BoundedSink;
use PHPUnit\Framework\TestCase;

/** TCK-2387 (ADR-0077 §9, AC4) — le corps reçu d'un tiers ne touche jamais le disque. */
class BoundedSinkTest extends TestCase
{
    public function test_le_corps_reste_en_memoire(): void
    {
        $sink = new BoundedSink(2_500_000);

        // Au-delà de 2 Mo, `php://temp` déborde dans un fichier du dossier temporaire : pas `php://memory`.
        $this->assertSame(2_500_000, $sink->write(str_repeat('x', 2_500_000)));

        $this->assertSame('php://memory', $sink->getMetadata('uri'));
        $this->assertFalse($sink->exceeded);
    }

    public function test_au_dela_de_la_borne_le_tampon_refuse_et_le_dit(): void
    {
        $sink = new BoundedSink(10);

        $this->assertSame(6, $sink->write('abcdef'));
        $this->assertSame(0, $sink->write('ghijk'));
        $this->assertTrue($sink->exceeded);
        $this->assertSame(6, $sink->getSize());
    }
}
