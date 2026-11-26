<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\LicensePaymentStatusMail;
use App\Models\LicenseAdminAction;
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

    public function adminLicenses(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['active', 'revoked', 'all'])],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $status = $validated['status'] ?? 'all';
        $search = trim((string) ($validated['search'] ?? ''));
        $licenses = UserLicense::query()
            ->with(['user:id,name,email', 'activator:id,name,email', 'revoker:id,name,email'])
            ->when($status !== 'all', fn ($query) => $query->where('status', $status))
            ->when($search !== '', function ($query) use ($search): void {
                $query->whereHas('user', fn ($users) => $users->where(function ($users) use ($search): void {
                    $users->whereRaw('LOWER(name) LIKE ?', ['%'.strtolower($search).'%'])
                        ->orWhereRaw('LOWER(email) LIKE ?', ['%'.strtolower($search).'%']);
                }));
            })
            ->orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
            ->orderByDesc('updated_at')
            ->paginate(20);

        return response()->json([
            'licenses' => $licenses->getCollection()->map(fn (UserLicense $license): array => $this->licenseData($license))->all(),
            'pagination' => [
                'current_page' => $licenses->currentPage(),
                'last_page' => $licenses->lastPage(),
                'total' => $licenses->total(),
            ],
            'counts' => [
                'active' => UserLicense::query()->where('status', 'active')->count(),
                'revoked' => UserLicense::query()->where('status', 'revoked')->count(),
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function grantAdminLicense(Request $request): JsonResponse
    {
        $request->merge([
            'email_address' => trim((string) $request->input('email_address', '')),
            'reason' => trim((string) $request->input('reason', '')),
        ]);
        $validated = $request->validate([
            'email_address' => ['required', 'email:rfc', 'max:255'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ]);
        $email = strtolower(trim($validated['email_address']));

        $license = DB::transaction(function () use ($request, $email, $validated): UserLicense {
            $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->lockForUpdate()->firstOrFail();
            if ($this->isProtectedAdmin($user)) {
                abort(403, 'Administrator accounts do not need a license grant.');
            }
            if (! $user->hasVerifiedEmail()) {
                abort(422, 'Verify this account email before granting a license.');
            }

            $license = UserLicense::query()->where('user_id', $user->id)->lockForUpdate()->first();
            if ($license?->status === 'active') {
                abort(409, 'This account already has an active license.');
            }

            $attributes = [
                'payment_request_id' => null,
                'status' => 'active',
                'source' => 'manual',
                'activated_at' => now(),
                'activated_by' => $request->user()->id,
                'activation_note' => trim($validated['reason']),
                'revoked_at' => null,
                'revoked_by' => null,
                'revocation_note' => null,
            ];
            if ($license) {
                $license->fill($attributes)->save();
            } else {
                $license = UserLicense::query()->create(['user_id' => $user->id, ...$attributes]);
            }

            LicenseAdminAction::query()->create([
                'user_id' => $user->id,
                'user_email' => $user->email,
                'admin_id' => $request->user()->id,
                'action' => 'granted',
                'reason' => trim($validated['reason']),
                'created_at' => now(),
            ]);

            return $license->fresh(['user:id,name,email', 'activator:id,name,email', 'revoker:id,name,email']);
        });

        return response()->json([
            'message' => 'One-time license granted.',
            'license' => $this->licenseData($license),
        ], 201)->header('Cache-Control', 'no-store');
    }

    public function revokeAdminLicense(Request $request, UserLicense $license): JsonResponse
    {
        $request->merge(['reason' => trim((string) $request->input('reason', ''))]);
        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ]);

        $license = DB::transaction(function () use ($request, $license, $validated): UserLicense {
            $record = UserLicense::query()->with('user:id,name,email')->lockForUpdate()->findOrFail($license->id);
            if ($record->status !== 'active') {
                abort(409, 'This license is not active.');
            }
            if ($record->user && $this->isProtectedAdmin($record->user)) {
                abort(403, 'Administrator access cannot be changed here.');
            }

            $reason = trim($validated['reason']);
            $record->fill([
                'status' => 'revoked',
                'revoked_at' => now(),
                'revoked_by' => $request->user()->id,
                'revocation_note' => $reason,
            ])->save();
            LicenseAdminAction::query()->create([
                'user_id' => $record->user_id,
                'user_email' => $record->user?->email ?? 'Deleted account',
                'admin_id' => $request->user()->id,
                'action' => 'revoked',
                'reason' => $reason,
                'created_at' => now(),
            ]);

            return $record->fresh(['user:id,name,email', 'activator:id,name,email', 'revoker:id,name,email']);
        });

        return response()->json([
            'message' => 'License revoked. This blocks access only when license enforcement is enabled.',
            'license' => $this->licenseData($license),
        ])->header('Cache-Control', 'no-store');
    }

    public function adminActions(Request $request): JsonResponse
    {
        $actions = LicenseAdminAction::query()
            ->with(['admin:id,name,email'])
            ->orderByDesc('created_at')
            ->paginate(30);

        return response()->json([
            'actions' => $actions->getCollection()->map(static fn (LicenseAdminAction $action): array => [
                'id' => $action->id,
                'user_email' => $action->user_email,
                'admin_name' => $action->admin?->name ?? 'Former administrator',
                'action' => $action->action,
                'reason' => $action->reason,
                'created_at' => $action->created_at?->toIso8601String(),
            ])->all(),
            'pagination' => ['current_page' => $actions->currentPage(), 'last_page' => $actions->lastPage(), 'total' => $actions->total()],
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
                $existingLicense = UserLicense::query()->where('user_id', $record->user_id)->lockForUpdate()->first();
                if ($existingLicense?->status === 'active') {
                    abort(409, 'This account already has an active one-time license. Review the payment manually before deciding what to do with this request.');
                }

                $licenseAttributes = [
                    'payment_request_id' => $record->id,
                    'status' => 'active',
                    'source' => 'payment',
                    'activated_at' => now(),
                    'activated_by' => $request->user()->id,
                    'activation_note' => 'Payment verified against the receiving account.',
                    'revoked_at' => null,
                    'revoked_by' => null,
                    'revocation_note' => null,
                ];
                if ($existingLicense) {
                    $existingLicense->fill($licenseAttributes)->save();
                } else {
                    UserLicense::query()->create(['user_id' => $record->user_id, ...$licenseAttributes]);
                }
                $record->status = 'approved';
            } else {
                $record->status = 'rejected';
            }

            $record->reviewed_by = $request->user()->id;
            $record->reviewed_at = now();
            $record->admin_note = isset($validated['admin_note']) ? trim($validated['admin_note']) : null;
            $record->save();

            LicenseAdminAction::query()->create([
                'user_id' => $record->user_id,
                'user_email' => $record->user->email,
                'admin_id' => $request->user()->id,
                'action' => $record->status === 'approved' ? 'payment_approved' : 'payment_rejected',
                'reason' => $record->status === 'approved'
                    ? 'Payment proof reviewed and verified. Reference: '.$record->transaction_reference
                    : $record->admin_note,
                'created_at' => now(),
            ]);

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

    private function licenseData(UserLicense $license): array
    {
        return [
            'id' => $license->id,
            'user_id' => $license->user_id,
            'name' => $license->user?->name ?? 'Deleted account',
            'email_address' => $license->user?->email,
            'status' => $license->status,
            'source' => $license->source,
            'activated_at' => $license->activated_at?->toIso8601String(),
            'activated_by' => $license->activator?->name,
            'activation_note' => $license->activation_note,
            'revoked_at' => $license->revoked_at?->toIso8601String(),
            'revoked_by' => $license->revoker?->name,
            'revocation_note' => $license->revocation_note,
            'payment_request_id' => $license->payment_request_id,
        ];
    }
}
