<?php

namespace App\Domain\Integrations\Providers;

use App\Models\Integration;

interface IntegrationProvider
{
    public function key(): string;

    public function label(): string;

    public function category(): string;

    public function critical(): bool;

    /**
     * @return array<int,array{name:string,label:string,type:string,secret:bool,required:bool}>
     */
    public function schema(): array;

    /**
     * @param  array<string,mixed>  $credentials
     * @return array<string,array<int,string>>
     */
    public function validate(array $credentials): array;

    /**
     * @return array{success:bool,error?:string}
     */
    public function test(Integration $integration): array;
}
