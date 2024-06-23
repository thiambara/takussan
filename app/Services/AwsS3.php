<?php

namespace App\Services;

use Aws\S3\S3Client;

class AwsS3
{
    /**
     * @var S3Client
     */
    private S3Client $client;

    /**
     * @var string
     */
    private string $bucket;

    public function __construct()
    {
        $this->setBucket(config('services.aws.bucket'));
        $this->setClient(new S3Client(
            [
                'credentials' => [
                    'key' => config('services.aws.access_key_id'),
                    'secret' => config('services.aws.secret_access_key')
                ],
                'region' => config('services.aws.default_region'),
                'version' => '2006-03-01',
            ]
        ));
    }

    /**
     * @param string $fileName
     * @param string $content
     * @param array $meta
     * @param string $privacy
     * @return string file url
     */
    public function upload(string $fileName, mixed $content, array $meta = [], string $privacy = 'public-read'): string
    {
        return $this->getClient()->upload($this->getBucket(), $fileName, $content, $privacy, [
            'Metadata' => $meta
        ])->toArray()['ObjectURL'];
    }

    /**
     * @param string $fileName
     * @param string|null $newFilename
     * @param array $meta
     * @param string $privacy
     * @return string file url
     */
    public function uploadFile(string $fileName, string $newFilename = null, array $meta = [], string $privacy = 'public-read'): string
    {
        if (!$newFilename) {
            $newFilename = basename($fileName);
        }

        if (!isset($meta['contentType'])) {
            // Detect Mime Type
            $mimeTypeHandler = finfo_open(FILEINFO_MIME_TYPE);
            $meta['contentType'] = finfo_file($mimeTypeHandler, $fileName);
            finfo_close($mimeTypeHandler);
        }

        return $this->upload($newFilename, file_get_contents($fileName), $meta, $privacy);
    }

    public function uploadFileTest($fileName, $newFilename = null, array $meta = [], $privacy = 'public-read', $content = null): string
    {
        if (!$newFilename) {
            $newFilename = basename($fileName);
        }

        if (!isset($meta['contentType'])) {
            // Detect Mime Type
            $mimeTypeHandler = finfo_open(FILEINFO_MIME_TYPE);
            $meta['contentType'] = finfo_file($mimeTypeHandler, $fileName);
            finfo_close($mimeTypeHandler);
        }

        return $this->upload($newFilename, $content, $meta, $privacy);
    }

    /**
     * Getter of client
     *
     * @return S3Client
     */
    protected function getClient(): S3Client
    {
        return $this->client;
    }

    /**
     * Setter of client
     *
     * @param S3Client $client
     *
     * @return $this
     */
    private function setClient(S3Client $client): self
    {
        $this->client = $client;

        return $this;
    }

    /**
     * Getter of bucket
     *
     * @return string
     */
    protected function getBucket(): string
    {
        return $this->bucket;
    }

    /**
     * Setter of bucket
     *
     * @param string $bucket
     *
     * @return $this
     */
    private function setBucket(string $bucket): self
    {
        $this->bucket = $bucket;

        return $this;
    }
}
