<?php

namespace App\Services\Pont;

/**
 * TCK-2980 (ADR-0132 § 1) — les numéros d'entreprise que le pont lit, et l'AGENCE DU NUMÉRO. Un numéro qu'aucun
 * pilote ne reconnaît comme sien (celui du Radar, celui d'une intégration inactive) n'est pas lu : `false`. `null` :
 * le numéro de la plateforme (une intégration sans agence). Mémorisé le temps de la requête.
 */
final class NumerosDuPont
{
    /** @var array<string, int|false|null> */
    private array $memo = [];

    public function agence(CanalDuPont $canal, string $numeroDEntreprise): int|false|null
    {
        $cle = $canal->nom().'|'.$numeroDEntreprise;
        if (! array_key_exists($cle, $this->memo)) {
            $this->memo[$cle] = $canal->agenceDuNumero($numeroDEntreprise);
        }

        return $this->memo[$cle];
    }
}
