<?php

namespace Tests\Feature\Media;

use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * P65.05 (TCK-1073) — les deux disques R2 passent un délai à Guzzle.
 *
 * Sans clé `http` dans leur configuration, le client S3 n'envoie ni `timeout` ni `connect_timeout`
 * à Guzzle : un R2 qui ne répond plus tient la requête (téléversement de photos compris) jusqu'à la
 * borne de PHP. Le test construit le disque sur SA configuration, avec des identifiants factices, et
 * lit l'option `@http` d'une commande : aucun appel réseau.
 */
class R2DiskHttpTimeoutTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function disques(): array
    {
        return ['r2-media' => ['r2-media'], 'r2-private' => ['r2-private']];
    }

    #[DataProvider('disques')]
    public function test_le_client_du_disque_porte_les_delais_http(string $disque): void
    {
        $disk = Storage::build([
            ...config("filesystems.disks.{$disque}"),
            'key' => 'factice',
            'secret' => 'factice',
            'bucket' => 'seau-factice',
            'endpoint' => 'https://compte-factice.r2.cloudflarestorage.com',
        ]);

        $command = $disk->getClient()->getCommand('HeadObject', ['Bucket' => 'seau-factice', 'Key' => 'k']);

        $this->assertSame(5, $command['@http']['connect_timeout'] ?? null);
        $this->assertSame(60, $command['@http']['timeout'] ?? null);
    }
}
