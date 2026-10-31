<?php

namespace App\Models;

use App\Services\Ai\EmbeddingsTable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * TCK-2423 (ADR-0076 §11, amendement du 2026-10-31) — le vecteur d'un objet : son modèle, sa dimension, et l'empreinte du
 * texte dont il a été calculé. Le texte lui-même n'est pas gardé ici. La table peut ne pas exister
 * ({@see EmbeddingsTable}) : tout lecteur passe d'abord par `EmbeddingsTable::exists()`.
 */
class Embedding extends Model
{
    protected $fillable = ['embeddable_type', 'embeddable_id', 'provider', 'model', 'dimension', 'vector', 'content_hash'];

    protected $hidden = ['vector'];

    public function embeddable(): MorphTo
    {
        return $this->morphTo();
    }

    /** L'empreinte d'un texte, égale à celle que PostgreSQL calcule : {@see self::contentHashSql()}. */
    public static function contentHash(string $text): string
    {
        return hash('sha256', $text);
    }

    public static function contentHashSql(string $column): string
    {
        return "encode(sha256(convert_to({$column}, 'UTF8')), 'hex')";
    }

    /** @param  list<float>  $vector */
    public static function literal(array $vector): string
    {
        return '['.implode(',', array_map(fn (float $value): string => (string) $value, $vector)).']';
    }
}
