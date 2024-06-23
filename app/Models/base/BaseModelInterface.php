<?php

namespace App\Models\base;

use Illuminate\Broadcasting\Channel;
use Illuminate\Database\Eloquent\BroadcastableModelEventOccurred;
use Illuminate\Database\Eloquent\Builder;

interface BaseModelInterface
{
    /**
     * The model event's broadcast name.
     *
     * @param  string  $event
     * @return string|null
     */
    function broadcastAs(string $event): ?string;

    /**
     * Get the channels that model events should broadcast on.
     *
     * @param  string  $event
     * @return Channel|array
     */
    function broadcastOn(string $event): Channel|array;

    /**
     * Create a new broadcastable model event for the model.
     *
     * @param  string  $event
     * @return BroadcastableModelEventOccurred
     */
    function newBroadcastableEvent(string $event): BroadcastableModelEventOccurred;

    /**
     * Get the data to broadcast for the model.
     *
     * @param  string  $event
     * @return array
     */
    function broadcastWith(string $event): array;

    // SCOPE

    function scopeFilterThroughRequest(Builder $builder): Builder;

    function scopeOrderThroughRequest(Builder $builder): Builder;

    function scopeAllThroughRequest(Builder $builder): Builder;

    // ADDED METHODS

    static function createMany(array $objects): array;


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
