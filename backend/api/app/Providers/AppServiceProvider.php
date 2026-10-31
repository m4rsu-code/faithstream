<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\Part\DataPart;
use Symfony\Component\Mime\Part\File;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        VerifyEmail::toMailUsing(static function (User $notifiable, string $verificationUrl): MailMessage {
            return (new MailMessage)
                ->subject('Verify your FaithStream email')
                ->view('emails.verify-email', [
                    'name' => $notifiable->name,
                    'verificationUrl' => $verificationUrl,
                ])
                ->text('emails.verify-email-text', [
                    'name' => $notifiable->name,
                    'verificationUrl' => $verificationUrl,
                ])
                ->withSymfonyMessage(static function (Email $message): void {
                    $logo = new DataPart(
                        new File(resource_path('images/faithstream-logo.png')),
                        'faithstream-logo.png',
                        'image/png',
                    );

                    $message->addPart($logo->asInline()->setContentId('faithstream-logo@faithstream.local'));
                });
        });
    }
}
