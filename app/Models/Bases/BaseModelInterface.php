<?php

namespace App\Models\Bases;

use Illuminate\Database\Eloquent\Builder;

interface BaseModelInterface
{


    // SCOPE

    static function createMany(array $objects): array;

    function scopeFilterThroughRequest(Builder $builder): Builder;

    function scopeOrderThroughRequest(Builder $builder): Builder;

    // ADDED METHODS

    function scopeAllThroughRequest(Builder $builder): Builder;

    function doFilter(Builder $builder, $credentials): Builder;

    function applyFilter(Builder $builder, string $key, array $opAndVal, $userAnd = true): Builder;

    function getFilterOpAndValue($value): array;

    /**
     * Return model columns list
     *
     */
    function getColumns(): array;

    function init(): void;

    function handleConveniencesFromRequest(): void;

    function cashBaseKey(): string;

}
