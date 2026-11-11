<x-mail::message>
<div style="margin-bottom: 22px; color: #a96e43; font-size: 12px; font-weight: 700; letter-spacing: 2px;">FAITHSTREAM STUDIO</div>

@if ($approved)
# Payment verified

Hello {{ $recipientName }},

Your payment was verified by the FaithStream Studio team. The one-time license is now active for the account you used when submitting the receipt.

You can sign in to FaithStream Studio with that account to access your license.
@else
# Payment proof needs attention

Hello {{ $recipientName }},

We could not approve the payment proof you submitted. Your license has not been activated.

@if ($adminNote)
<x-mail::panel>
{{ $adminNote }}
</x-mail::panel>
@endif

Please contact FaithStream Studio Support if you believe this decision is incorrect.
@endif

You’re receiving this message at the email address on your FaithStream Studio account.

Regards,  
**FaithStream Studio Support**
</x-mail::message>
