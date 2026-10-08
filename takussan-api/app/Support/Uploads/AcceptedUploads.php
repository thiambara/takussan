<?php

namespace App\Support\Uploads;

/**
 * TCK-601 — les types de fichier qu'une route d'upload accepte, écrits une fois.
 *
 * Avant ce ticket, trois routes de KYC ne validaient que `file|max` : un `.html` ou un `.svg`
 * restait ce qu'il était une fois stocké sous `hashName()`, et un fichier vide passait. Chaque
 * liste va par paire — extensions (`mimes:`, devinées du contenu) ET types (`mimetypes:`) — et
 * `min:1` (Ko) refuse le fichier vide. La taille maximale reste propre à chaque requête.
 *
 * `DOCUMENTS` est la liste que le front annonce déjà (`DOCUMENT_MIME_ACCEPT`,
 * `takussan-web/src/lib/queries/documents.ts`), plus `heic`/`heif` : une photo de téléphone.
 */
final class AcceptedUploads
{
    public const KYC_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'];

    public const KYC_MIMETYPES = [
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
    ];

    public const DOCUMENT_EXTENSIONS = [
        'pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv',
    ];

    public const DOCUMENT_MIMETYPES = [
        'application/pdf',
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'text/csv', 'application/csv',
    ];

    /** @return list<string> */
    public static function kyc(int $maxKilobytes): array
    {
        return self::rules(self::KYC_EXTENSIONS, self::KYC_MIMETYPES, $maxKilobytes);
    }

    /** @return list<string> */
    public static function document(int $maxKilobytes): array
    {
        return self::rules(self::DOCUMENT_EXTENSIONS, self::DOCUMENT_MIMETYPES, $maxKilobytes);
    }

    /**
     * @param  list<string>  $extensions
     * @param  list<string>  $mimetypes
     * @return list<string>
     */
    private static function rules(array $extensions, array $mimetypes, int $maxKilobytes): array
    {
        return [
            'mimes:'.implode(',', $extensions),
            'mimetypes:'.implode(',', $mimetypes),
            'min:1',
            'max:'.$maxKilobytes,
        ];
    }
}
