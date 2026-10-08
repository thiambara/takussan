<?php

namespace Tests\Feature\Public;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-598 (§ 11, AC21) — le CONTRAT sur lequel le front s'appuie : derrière un mandataire de
 * confiance, `throttle:public-read` (90/min) compte par visiteur, d'après `X-Forwarded-For` ;
 * hors de la chaîne de confiance, l'en-tête n'est pas lu.
 *
 * Le front transmet l'IP du visiteur dans ses appels serveur (ADR-0052 §5). Ce test ne prouve
 * PAS que le chemin réseau de production passe par un mandataire de confiance — ça se mesure sur
 * preview (AC22, au porteur). Il prouve que, s'il y passe, l'API fait ce que le front attend.
 *
 * `TRUSTED_PROXIES` vaut `127.0.0.1,::1` ici (`.env.example`, que la CI utilise).
 */
class PublicReadLimiterPerVisitorTest extends TestCase
{
    use RefreshDatabase;

    /** La route que l'AC nomme : la liste, que le serveur Next appelle pour chaque visiteur. */
    private const ROUTE = '/api/public/properties';

    private function depuis(string $remoteAddr, ?string $xff = null): int
    {
        $entetes = $xff === null ? [] : ['X-Forwarded-For' => $xff];

        return $this->withServerVariables(['REMOTE_ADDR' => $remoteAddr])
            ->getJson(self::ROUTE, $entetes)
            ->status();
    }

    /** AC21 — deux visiteurs derrière le même mandataire de confiance : deux seaux. */
    public function test_derriere_un_mandataire_de_confiance_chaque_visiteur_a_son_seau(): void
    {
        for ($i = 1; $i <= 90; $i++) {
            $this->assertSame(200, $this->depuis('127.0.0.1', '203.0.113.1'), "Appel n°{$i} refusé avant le plafond.");
        }

        $this->assertSame(429, $this->depuis('127.0.0.1', '203.0.113.1'), 'Le 91e appel du même visiteur passe.');
        $this->assertSame(200, $this->depuis('127.0.0.1', '203.0.113.2'), 'Un AUTRE visiteur partage le seau du premier.');
    }

    /**
     * L'entrée la plus à GAUCHE se forge : la chaîne de confiance retient l'entrée la plus à droite
     * qui n'est pas un mandataire de confiance. Changer la gauche ne change pas de seau.
     */
    public function test_l_entree_la_plus_a_gauche_ne_choisit_pas_le_seau(): void
    {
        for ($i = 1; $i <= 90; $i++) {
            $this->depuis('127.0.0.1', "10.9.9.{$i}, 203.0.113.3");
        }

        $this->assertSame(429, $this->depuis('127.0.0.1', '10.9.9.200, 203.0.113.3'));
    }

    /** Hors de la chaîne de confiance, `X-Forwarded-For` n'est pas lu : un seau par adresse source. */
    public function test_un_client_hors_de_la_chaine_de_confiance_ne_choisit_pas_son_ip(): void
    {
        for ($i = 1; $i <= 90; $i++) {
            $this->depuis('198.51.100.9', "203.0.113.{$i}");
        }

        $this->assertSame(429, $this->depuis('198.51.100.9', '203.0.113.250'), 'Un client non mandataire choisit son IP par X-Forwarded-For.');
    }
}
