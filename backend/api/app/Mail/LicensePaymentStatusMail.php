<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class LicensePaymentStatusMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $recipientName,
        public readonly string $decision,
        public readonly ?string $adminNote,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->decision === 'approved'
                ? 'Your FaithStream Studio one-time license is active'
                : 'Update on your FaithStream Studio payment proof',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.license-payment-status',
            with: [
                'recipientName' => $this->recipientName,
                'approved' => $this->decision === 'approved',
                'adminNote' => $this->adminNote,
            ],
        );
    }
}
