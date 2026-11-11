<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
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
        $tooManyAttempts = static fn (array $headers) => response()->json([
            'message' => 'Too many sign-in attempts. Please wait a moment and try again.',
        ], 429, $headers);

        // Per email + IP, so one address behind a shared network cannot be brute forced.
        RateLimiter::for('login', static fn (Request $request): Limit => Limit::perMinute(5)
            ->by(Str::lower(trim((string) $request->input('email_address', ''))).'|'.$request->ip())
            ->response(static fn (Request $request, array $headers) => $tooManyAttempts($headers)));

        // Per email across every IP, so rotating proxies cannot grind one account.
        RateLimiter::for('login-account', static fn (Request $request): Limit => Limit::perMinutes(10, 20)
            ->by(Str::lower(trim((string) $request->input('email_address', ''))))
            ->response(static fn (Request $request, array $headers) => $tooManyAttempts($headers)));

        VerifyEmail::toMailUsing(static function (User $notifiable, string $verificationUrl): MailMessage {
            return (new MailMessage)
                ->subject('Verify your FaithStream Studio email')
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
