<?php

namespace Tests\Support;

use Dompdf\Dompdf;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xls;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use ZipArchive;

/**
 * P194.03 — des fichiers RÉELS, un par format qu'une route de téléversement annonce, déposés en
 * `UploadedFile` réel : `finfo` lit leur contenu, comme il lira celui de l'utilisateur.
 *
 * `UploadedFile::fake()->create($nom, …)` et `createWithContent($nom, …)` rendent le type passé,
 * ou celui que DÉDUIT L'EXTENSION du nom : leur contenu n'est jamais lu. Un test qui ne dépose que
 * des faux fichiers juge donc le nom, pas ce que `mimes:` et `mimetypes:` verront en production —
 * c'est ainsi que sont passés inaperçus le fichier de moins de 1 Kio (P194.01), le conteneur MP4
 * de la note vocale (P194.02) et l'OFX 2 (P157.05).
 *
 * Chaque fichier est produit avec ce que le dépôt a déjà (dompdf, PhpSpreadsheet, GD, `ZipArchive`)
 * ou écrit octet par octet. Le type client est laissé nul : rien ne vient du nom.
 */
final class FichiersReels
{
    public static function pdf(string $nom = 'piece.pdf'): UploadedFile
    {
        $dompdf = new Dompdf;
        $dompdf->loadHtml('<p>Pièce justificative</p>');
        $dompdf->render();

        return self::fichier((string) $dompdf->output(), $nom);
    }

    public static function png(string $nom = 'piece.png'): UploadedFile
    {
        return self::image(fn ($image, string $chemin) => imagepng($image, $chemin), $nom);
    }

    public static function jpeg(string $nom = 'piece.jpg'): UploadedFile
    {
        return self::image(fn ($image, string $chemin) => imagejpeg($image, $chemin), $nom);
    }

    public static function webp(string $nom = 'piece.webp'): UploadedFile
    {
        return self::image(fn ($image, string $chemin) => imagewebp($image, $chemin), $nom);
    }

    /** Une photo de téléphone réduite à sa boîte `ftyp` : `finfo` y lit `image/heic`. */
    public static function heic(string $nom = 'piece.heic'): UploadedFile
    {
        return self::fichier(pack('N', 24).'ftypheic'.pack('N', 0).'mif1heic'.str_repeat("\x00", 64), $nom);
    }

    public static function texte(string $nom = 'note.txt'): UploadedFile
    {
        return self::fichier("Note de visite : la porte du fond ferme mal.\n", $nom);
    }

    public static function csv(string $nom = 'releve.csv'): UploadedFile
    {
        return self::fichier("nom,montant,date\nloyer,150000,2026-10-01\ncharges,12000,2026-10-01\n", $nom);
    }

    public static function xlsx(string $nom = 'releve.xlsx'): UploadedFile
    {
        $chemin = self::chemin();
        (new Xlsx(self::classeur()))->save($chemin);

        return new UploadedFile($chemin, $nom, null, null, true);
    }

    public static function xls(string $nom = 'releve.xls'): UploadedFile
    {
        $chemin = self::chemin();
        (new Xls(self::classeur()))->save($chemin);

        return new UploadedFile($chemin, $nom, null, null, true);
    }

    /**
     * Un `.docx` minimal, comme Word l'écrit : `[Content_Types].xml` en tête de l'archive, puis
     * `word/document.xml`. C'est l'ordre que `finfo` lit pour le distinguer d'un ZIP quelconque.
     */
    public static function docx(string $nom = 'bail.docx'): UploadedFile
    {
        $chemin = self::chemin();
        $zip = new ZipArchive;
        $zip->open($chemin, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>'
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            .'<Default Extension="xml" ContentType="application/xml"/>'
            .'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            .'</Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            .'</Relationships>');
        $zip->addFromString('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?>'
            .'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            .'<w:body><w:p><w:r><w:t>Bail</w:t></w:r></w:p></w:body></w:document>');
        $zip->close();

        return new UploadedFile($chemin, $nom, null, null, true);
    }

    /**
     * La première page d'un Ogg Opus : en-tête de page de 27 octets, table d'un segment, puis
     * `OpusHead` à l'octet 28, où `finfo` le cherche pour rendre `audio/ogg`. Décalé de deux
     * octets, le même contenu est lu `application/octet-stream` (mesuré, P194.03).
     */
    public static function ogg(string $nom = 'note.ogg', int $remplissage = 0): UploadedFile
    {
        $opusHead = 'OpusHead'."\x01\x01".pack('v', 312).pack('V', 48000).pack('v', 0)."\x00";
        $page = 'OggS'."\x00\x02".str_repeat("\x00", 8).pack('V', 1).pack('V', 0).pack('V', 0)
            ."\x01".chr(strlen($opusHead)).$opusHead;

        return self::fichier($page.str_repeat("\x00", $remplissage), $nom);
    }

    /** Un conteneur MP4 de marque `M4A ` : `finfo` y lit `audio/x-m4a`. */
    public static function m4a(string $nom = 'note-vocale.m4a'): UploadedFile
    {
        return self::fichier(pack('N', 24).'ftypM4A '.pack('N', 0).'M4A isom'.str_repeat("\x00", 64), $nom);
    }

    /**
     * TCK-2058 (P194.02, ADR-0038 amendement du 2026-10-23) — un VRAI conteneur MP4 audio : une
     * seconde d'AAC à 32 kbit/s produite par `afconvert -f mp4f -d aac` (une seule piste, `hdlr`
     * `soun`), marque majeure posée à `isom`. `finfo` y lit `video/mp4` : il juge la marque `ftyp`,
     * pas la piste.
     */
    public static function mp4Isom(string $nom = 'note-vocale.m4a'): UploadedFile
    {
        return self::fichier((string) file_get_contents(base_path('tests/fixtures/audio/note-vocale-isom.mp4')), $nom);
    }

    private static function classeur(): Spreadsheet
    {
        $classeur = new Spreadsheet;
        $classeur->getActiveSheet()->fromArray([['nom', 'montant'], ['loyer', 150000]]);

        return $classeur;
    }

    /** @param  callable(\GdImage, string): bool  $ecrire */
    private static function image(callable $ecrire, string $nom): UploadedFile
    {
        $image = imagecreatetruecolor(4, 4);
        imagefilledrectangle($image, 0, 0, 1, 3, (int) imagecolorallocate($image, 200, 40, 40));
        $chemin = self::chemin();
        $ecrire($image, $chemin);

        return new UploadedFile($chemin, $nom, null, null, true);
    }

    private static function fichier(string $contenu, string $nom): UploadedFile
    {
        $chemin = self::chemin();
        file_put_contents($chemin, $contenu);

        return new UploadedFile($chemin, $nom, null, null, true);
    }

    private static function chemin(): string
    {
        return (string) tempnam(sys_get_temp_dir(), 'p19403');
    }
}
