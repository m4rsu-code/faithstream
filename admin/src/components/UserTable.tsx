import type { DirectoryUser } from '../utils/types';
import { formatDate, initials } from '../utils/format';

interface UserTableProps {
  users: DirectoryUser[];
  compact?: boolean;
  emptyMessage: string;
}

export default function UserTable({ users, compact = false, emptyMessage }: UserTableProps) {
  if (users.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <table className={compact ? 'mini-table' : 'user-table'}>
      <thead>
        <tr>
          <th>User</th>
          {!compact && <th>Role</th>}
          <th>Email</th>
          <th>Activity</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>
              <div className="user-cell">
                <span>{initials(user.name)}</span>
                <span><strong>{user.name}{user.protected_account && <span className="admin-account-badge">ADMIN</span>}</strong><small>{user.email_address}</small></span>
              </div>
            </td>
            {!compact && <td>{user.role || 'Member'}</td>}
            <td><span className={`status-pill ${user.email_verified ? '' : 'unverified'}`}>{user.email_verified ? 'Verified' : 'Unverified'}</span>{user.deletion_requested_at && <small className="deletion-request-indicator">Deletion requested</small>}</td>
            <td>
              {user.last_activity_at ? (
                <span className={`activity-pill ${Date.now() - new Date(user.last_activity_at).valueOf() <= 30 * 24 * 60 * 60 * 1000 ? '' : 'inactive'}`} title={`Last API activity: ${formatDate(user.last_activity_at)}`}>
                  {Date.now() - new Date(user.last_activity_at).valueOf() <= 30 * 24 * 60 * 60 * 1000 ? 'Active · 30d' : 'No recent activity'}
                </span>
              ) : <span className="activity-pill inactive" title="No authenticated API activity recorded">Never used</span>}
              {user.last_activity_at && <small className="activity-date">{formatDate(user.last_activity_at)}</small>}
            </td>
            <td>{formatDate(user.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
