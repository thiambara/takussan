<?php

namespace Tests\Support\ModelesChiffres;

use Illuminate\Database\Eloquent\Casts\AsEncryptedArrayObject;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-614 (AC5) — un modèle « ajouté demain » avec des casts chiffrés, hors d'`app/Models` : `security:reencrypt` le
 * traite par ses seuls casts, sans qu'on modifie la commande. Sa table est créée par le test qui l'emploie.
 */
class FicheChiffree extends Model
{
    protected $table = 'tck614_fiches_chiffrees';

    protected $guarded = [];

    public $timestamps = false;

    protected function casts(): array
    {
        return ['secret' => 'encrypted', 'details' => AsEncryptedArrayObject::class, 'libelle' => 'string'];
    }
}
