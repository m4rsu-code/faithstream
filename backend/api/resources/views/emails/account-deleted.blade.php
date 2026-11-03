<x-mail::message>
<div style="margin-bottom: 22px; color: #a96e43; font-size: 12px; font-weight: 700; letter-spacing: 2px;">FAITHSTREAM</div>

# Account deletion confirmed

Hello {{ $recipientName }},

This email confirms that an administrator approved your request and your FaithStream account was permanently deleted on **{{ $deletedAt }}**.

<x-mail::panel>
Your account profile, profile photo, and cloud-synced presentations associated with this account have been deleted. Files stored locally on your computer are not affected.
</x-mail::panel>

You’re receiving this confirmation at the Gmail address registered to your FaithStream account. If you did not request this deletion, contact the FaithStream team by replying to this email.

Regards,  
**FaithStream Support**
</x-mail::message>
