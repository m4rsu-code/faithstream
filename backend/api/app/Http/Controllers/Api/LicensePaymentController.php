<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\LicensePaymentStatusMail;
use App\Models\LicensePaymentRequest;
use App\Models\User;
use App\Models\UserLicense;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class LicensePaymentController extends Controller
{
    public function options(): JsonResponse
    {
        $configured = $this->salesConfigured();

        return response()->json([
            'sales_enabled' => $configured,
            'free_notice' => config('license.free_notice'),
            'price' => (int) config('license.price'),
            'currency' => config('license.currency'),
            'payment_methods' => $configured ? config('license.payment_methods', []) : [],
        ])->header('Cache-Control', 'no-store');
    }

    public function submit(Request $request): JsonResponse
    {
        if (! $this->salesConfigured()) {
            return response()->json([
                'message' => 'FaithStream Studio is currently free during its launch period. Payment submissions are not open yet.',
                'code' => 'LICENSE_SALES_CLOSED',
            ], 403);
        }

        $request->merge(['transaction_reference' => strtoupper(trim((string) $request->input('transaction_reference', '')))]);
        $methods = collect(config('license.payment_methods', []))->pluck('id')->all();
        $validated = $request->validate([
            'payment_method' => ['required', 'string', Rule::in($methods)],
            'payer_name' => ['required', 'string', 'max:120'],
            'transaction_reference' => [
                'required', 'string', 'min:6', 'max:100', 'regex:/^[A-Z0-9-]+$/',
                Rule::unique('license_payment_requests', 'transaction_reference')->where(fn ($query) => $query->where('payment_method', $request->input('payment_method'))),
            ],
            'amount' => ['required', 'integer', Rule::in([(string) config('license.price')])],
            'proof' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ], [
            'transaction_reference.unique' => 'This transaction reference has already been submitted.',
            'amount.in' => 'The submitted amount does not match the displayed license price.',
            'proof.image' => 'Upload a clear image of the payment receipt.',
        ]);

        $user = $request->user();
        if (! $user instanceof User || ! $user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Sign in with your verified FaithStream Studio account before submitting payment proof.'], 403);
        }

        $proofPath = $validated['proof']->store('license-payment-proofs/'.$user->id, 'local');
        if (! $proofPath) {
            return response()->json(['message' => 'The receipt could not be saved. Please try again.'], 500);
        }

        try {
            $paymentRequest = DB::transaction(function () use ($user, $validated, $proofPath): LicensePaymentRequest {
                $lockedUser = User::query()->lockForUpdate()->findOrFail($user->id);
                if (UserLicense::query()->where('user_id', $lockedUser->id)->where('status', 'active')->exists()) {
                    abort(409, 'This account already has an active one-time license.');
                }
                if (LicensePaymentRequest::query()->where('user_id', $lockedUser->id)->where('status', 'pending')->exists()) {
                    abort(409, 'A payment proof for this account is already waiting for review.');
                }

                return LicensePaymentRequest::query()->create([
                    'user_id' => $lockedUser->id,
                    'payment_method' => $validated['payment_method'],
                    'payer_name' => trim($validated['payer_name']),
                    'transaction_reference' => $validated['transaction_reference'],
                    'amount' => (int) config('license.price'),
                    'currency' => config('license.currency'),
                    'proof_path' => $proofPath,
                    'status' => 'pending',
                ]);
            });
        } catch (QueryException $exception) {
            Storage::disk('local')->delete($proofPath);
            if (in_array((string) $exception->getCode(), ['23000', '23505'], true)) {
                return response()->json(['message' => 'This transaction reference was already submitted. Check the reference and try again.'], 409);
            }
            throw $exception;
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($proofPath);
            throw $exception;
        }

        return response()->json([
            'request_id' => $paymentRequest->id,
            'status' => $paymentRequest->status,
            'message' => 'Your payment proof was submitted. Verification may take some time. Your one-time license will activate only after the payment is confirmed.',
        ], 201)->header('Cache-Control', 'no-store');
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['pending', 'approved', 'rejected', 'all'])],
        ]);
        $status = $validated['status'] ?? 'pending';

        $payments = LicensePaymentRequest::query()
            ->with(['user:id,name,email', 'reviewer:id,name,email'])
            ->when($status !== 'all', fn ($query) => $query->where('status', $status))
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('created_at')
            ->paginate(20)
            ->through(fn (LicensePaymentRequest $payment): array => $this->paymentData($payment));

        return response()->json([
            'payments' => $payments->items(),
            'pagination' => [
                'current_page' => $payments->currentPage(),
                'last_page' => $payments->lastPage(),
                'total' => $payments->total(),
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function accountStatus(Request $request): JsonResponse
    {
        $user = $request->user();
        $payment = LicensePaymentRequest::query()->where('user_id', $user->id)->latest('created_at')->first();
        $license = UserLicense::query()->where('user_id', $user->id)->where('status', 'active')->first();

        return response()->json([
            'license_active' => $license !== null,
            'license_activated_at' => $license?->activated_at?->toIso8601String(),
            'payment_request' => $payment ? [
                'id' => $payment->id,
                'status' => $payment->status,
                'payment_method' => $payment->payment_method,
                'submitted_at' => $payment->created_at?->toIso8601String(),
                'reviewed_at' => $payment->reviewed_at?->toIso8601String(),
                'admin_note' => $payment->status === 'rejected' ? $payment->admin_note : null,
            ] : null,
        ])->header('Cache-Control', 'no-store');
    }

    public function count(): JsonResponse
    {
        return response()->json([
            'pending_count' => LicensePaymentRequest::query()->where('status', 'pending')->count(),
        ])->header('Cache-Control', 'no-store');
    }

    public function proof(LicensePaymentRequest $payment): StreamedResponse|JsonResponse
    {
        if (! Storage::disk('local')->exists($payment->proof_path)) {
            return response()->json(['message' => 'Receipt image not found.'], 404);
        }

        return Storage::disk('local')->response(
            $payment->proof_path,
            'payment-receipt-'.$payment->id,
            ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff'],
            'inline',
        );
    }

    public function decide(Request $request, LicensePaymentRequest $payment): JsonResponse
    {
        $validated = $request->validate([
            'decision' => ['required', Rule::in(['approve', 'reject'])],
            'admin_note' => ['required_if:decision,reject', 'nullable', 'string', 'max:500'],
        ]);

        $result = DB::transaction(function () use ($request, $payment, $validated): array {
            $record = LicensePaymentRequest::query()->lockForUpdate()->findOrFail($payment->id);
            if ($record->status !== 'pending') {
                abort(409, 'This payment request has already been reviewed.');
            }

            if ($validated['decision'] === 'approve') {
                if (UserLicense::query()->where('user_id', $record->user_id)->where('status', 'active')->exists()) {
                    abort(409, 'This account already has an active one-time license. Review the payment manually before deciding what to do with this request.');
                }

                UserLicense::query()->create([
                    'user_id' => $record->user_id,
                    'payment_request_id' => $record->id,
                    'status' => 'active',
                    'activated_at' => now(),
                ]);
                $record->status = 'approved';
            } else {
                $record->status = 'rejected';
            }

            $record->reviewed_by = $request->user()->id;
            $record->reviewed_at = now();
            $record->admin_note = isset($validated['admin_note']) ? trim($validated['admin_note']) : null;
            $record->save();

            return [
                'payment' => $this->paymentData($record->fresh(['user:id,name,email', 'reviewer:id,name,email'])),
                'recipient' => $record->user->email,
                'recipient_name' => $record->user->name,
                'decision' => $record->status,
                'admin_note' => $record->admin_note,
            ];
        });

        $notificationSent = false;
        if (in_array(config('mail.default'), ['log', 'array'], true)) {
            Log::warning('FaithStream Studio license status email was not delivered because the configured mailer does not send email.', [
                'payment_request_id' => $payment->id,
                'mailer' => config('mail.default'),
            ]);
        } else {
            try {
                Mail::to($result['recipient'])->send(new LicensePaymentStatusMail(
                    recipientName: $result['recipient_name'],
                    decision: $result['decision'],
                    adminNote: $result['admin_note'],
                ));
                $notificationSent = true;
            } catch (\Throwable $exception) {
                Log::error('FaithStream Studio license payment status email could not be sent.', [
                    'payment_request_id' => $payment->id,
                    'exception_type' => $exception::class,
                ]);
            }
        }

        return response()->json([
            'message' => $validated['decision'] === 'approve'
                ? 'Payment approved and the one-time license was activated for the account.'
                : 'Payment request rejected. The account license was not activated.',
            'payment' => $result['payment'],
            'notification_sent' => $notificationSent,
        ])->header('Cache-Control', 'no-store');
    }

    private function salesConfigured(): bool
    {
        $startsAt = trim((string) config('license.sales_starts_at', ''));
        if (! (bool) config('license.sales_enabled') || (int) config('license.price') <= 0 || count(config('license.payment_methods', [])) === 0 || $startsAt === '') {
            return false;
        }

        try {
            return Carbon::parse($startsAt)->isPast();
        } catch (\Throwable) {
            return false;
        }
    }

    /** @return array<string, mixed> */
    private function paymentData(LicensePaymentRequest $payment): array
    {
        return [
            'id' => $payment->id,
            'name' => $payment->user?->name ?? 'Deleted account',
            'email_address' => $payment->user?->email,
            'payment_method' => $payment->payment_method,
            'payer_name' => $payment->payer_name,
            'transaction_reference' => $payment->transaction_reference,
            'amount' => $payment->amount,
            'currency' => $payment->currency,
            'status' => $payment->status,
            'submitted_at' => $payment->created_at?->toIso8601String(),
            'reviewed_at' => $payment->reviewed_at?->toIso8601String(),
            'reviewed_by' => $payment->reviewer?->name,
            'admin_note' => $payment->admin_note,
        ];
    }
}
