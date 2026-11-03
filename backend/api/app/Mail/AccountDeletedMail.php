<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AccountDeletedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $recipientName,
        public readonly string $deletedAt,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your FaithStream account has been deleted',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.account-deleted',
            with: [
                'recipientName' => $this->recipientName,
                'deletedAt' => $this->deletedAt,
            ],
        );
    }
}
