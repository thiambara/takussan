<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;

/**
 * TCK-2448 (ADR-0085 §1) — un modèle réglé dans la console, avec ses tarifs en dollars par million de
 * tokens. Les tarifs ne sont pas castés (ADR-0086) : `decimal:N` imposerait un nombre de décimales,
 * `float` les arrondirait ; ils restent les chaînes décimales que rend PostgreSQL.
 */
class AiModel extends AbstractModel
{
    use HasFactory;

    /** Les quatre tarifs d'un modèle. */
    public const PRICES = ['input', 'output', 'cache_read', 'cache_write'];

    protected $fillable = ['provider', 'model', 'input', 'output', 'cache_read', 'cache_write', 'active', 'updated_by_id'];

    protected $casts = [
        'active' => 'boolean',
    ];

    /** @return array{input: string, output: string, cache_read: string, cache_write: string} */
    public function prices(): array
    {
        return ['input' => (string) $this->input, 'output' => (string) $this->output, 'cache_read' => (string) $this->cache_read, 'cache_write' => (string) $this->cache_write];
    }
}
