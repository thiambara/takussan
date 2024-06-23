<?php

namespace App\Services;

use Illuminate\Support\Arr;
use SendGrid;
use SendGrid\Mail\From;
use SendGrid\Mail\Mail;
use SendGrid\Mail\PlainTextContent;
use SendGrid\Mail\Subject;
use SendGrid\Mail\To;
use SendGrid\Mail\TypeException;
use Throwable;

class EmailService
{
    private SendGrid $_sendGrid;

    public function __construct()
    {
        $this->_sendGrid = new SendGrid(config('services.email.sendgrid_api_key'));
    }

    /**
     * @throws TypeException
     */
    private function getEmail(string $subject, array|string $to): Mail
    {
            if(!is_array($to)) $to = [$to];
            $from = new From(config('services.email.sendgrid_from_email'));
            $to = Arr::map($to, fn ($item) => new To($item));
            $subject = new Subject($subject);
            return  new Mail($from, $to, $subject);
    }


    public function send(string $subject, mixed $content, array|string $to, string $contentType = 'view'): ?SendGrid\Response
    {
        try {
            if($contentType == 'view'){
                $html = view($content['view'], $content['data'])->render();
                $content = new SendGrid\Mail\HtmlContent($html);
            }elseif($contentType == 'html'){
                $content = new SendGrid\Mail\HtmlContent($contentType);
            }else{
                $content = new PlainTextContent($content);
            }
            $email = $this->getEmail($subject, $to);
            $email->addContent($content);
            return $this->_sendGrid->send($email);
        }catch (Throwable $e){}
        return null;
    }

}
