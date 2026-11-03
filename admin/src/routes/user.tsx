import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ApiError, errorMessage, requestApi } from '../utils/api';
import { useAdminAuth } from '../context/AdminAuthProvider';
import type { AdminLayoutOutletContext } from '../components/AdminLayout';
import PageFooter from '../components/PageFooter';
import UserTable from '../components/UserTable';
import type { AccountActionResponse, DeletionRequest, DeletionRequestsResponse, UsersResponse } from '../utils/types';
import { formatNumber } from '../utils/format';

export default function UsersPage() {
  const { refreshKey, setRefreshing } = useOutletContext<AdminLayoutOutletContext>();
  const { clearSession } = useAdminAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [noticeIsWarning, setNoticeIsWarning] = useState(false);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);

  useEffect(() => {
    let active = true;
    setError('');
    setLoading(true);
    setRefreshing(true);

    const timer = window.setTimeout(() => {
      async function loadUsers(): Promise<void> {
        try {
          const query = new URLSearchParams({ page: String(searchPage), ...(search ? { search } : {}) });
          const [result, deletionResult] = await Promise.all([
            requestApi<UsersResponse>(`/admin/users?${query.toString()}`),
            requestApi<DeletionRequestsResponse>('/admin/deletion-requests'),
          ]);
          if (active) {
            setData(result);
            setDeletionRequests(deletionResult.requests);
          }
        } catch (requestError) {
          if (active && requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) {
            clearSession();
            navigate('/login', {
              replace: true,
              state: { message: requestError.status === 401 ? 'Your session expired. Sign in again.' : 'This account is not authorized. Add its email to ADMIN_EMAILS in the backend environment.' },
            });
          } else if (active) {
            setError(errorMessage(requestError));
          }
        } finally {
          if (active) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      }

      void loadUsers();
    }, search ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
      setRefreshing(false);
    };
  }, [clearSession, navigate, refreshKey, reloadKey, search, searchPage, setRefreshing]);

  async function decideDeletionRequest(deletionRequest: DeletionRequest, decision: 'approve' | 'reject'): Promise<void> {
    const confirmation = decision === 'approve'
      ? `Approve permanent deletion for ${deletionRequest.name}? Their cloud-synced presentations and profile photo will also be deleted.`
      : `Reject the deletion request from ${deletionRequest.name}? Their account will remain active.`;
    if (!window.confirm(confirmation)) {
      return;
    }

    setError('');
    setNotice('');
    setNoticeIsWarning(false);
    setPendingUserId(deletionRequest.id);
    try {
      const result = await requestApi<AccountActionResponse>(`/admin/deletion-requests/${deletionRequest.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision }),
      });
      setNotice(result.message);
      setNoticeIsWarning(result.notification_sent === false);
      setSearchPage(1);
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingUserId(null);
    }
  }

  const pagination = data?.pagination || { current_page: 1, last_page: 1, total: 0, per_page: 10 };
  const start = pagination.total ? ((pagination.current_page - 1) * pagination.per_page) + 1 : 0;
  const end = Math.min(pagination.current_page * pagination.per_page, pagination.total);

  return (
    <section className="page-content">
      <div className="page-heading"><div><p className="eyebrow">ACCOUNT DIRECTORY</p><h1>Users</h1><p className="page-subtitle">Review account details, email verification, and deletion requests.</p></div><span className="total-pill">{formatNumber(pagination.total + (data?.admin_account ? 1 : 0))} accounts</span></div>
      {error && <div className="alert-banner" role="alert">{error}</div>}
      {notice && <div className={noticeIsWarning ? 'warning-banner' : 'success-banner'} role="status">{notice}</div>}
      <section className="panel deletion-requests-panel">
        <div className="panel-heading"><div><p className="eyebrow">ACCOUNT REQUESTS</p><h2>Deletion requests</h2></div><span className="request-count-pill">{formatNumber(deletionRequests.length)} pending</span></div>
        {deletionRequests.length === 0 ? <p className="no-deletion-requests">No account deletion requests are waiting for review.</p> : <div className="deletion-request-list">
          {deletionRequests.map((deletionRequest) => <article className="deletion-request-row" key={deletionRequest.id}>
            <div className="deletion-request-person"><span className="request-avatar">{deletionRequest.name.trim().slice(0, 1).toUpperCase() || '?'}</span><div><strong>{deletionRequest.name}</strong><small>{deletionRequest.email_address}</small></div></div>
            <span className="request-date">Requested {deletionRequest.requested_at ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(deletionRequest.requested_at)) : 'recently'}</span>
            <div className="deletion-request-actions"><button type="button" className="table-action danger" disabled={pendingUserId !== null} onClick={() => void decideDeletionRequest(deletionRequest, 'approve')}>{pendingUserId === deletionRequest.id ? 'Processing…' : 'Approve delete'}</button><button type="button" className="table-action" disabled={pendingUserId !== null} onClick={() => void decideDeletionRequest(deletionRequest, 'reject')}>{pendingUserId === deletionRequest.id ? 'Processing…' : 'Reject'}</button></div>
          </article>)}
        </div>}
      </section>
      <section className="panel directory-panel">
        {data?.admin_account && <div className="pinned-admin-account"><div className="pinned-admin-heading"><strong>Administrator account</strong><span>PINNED</span></div><div className="pinned-admin-details"><span className="request-avatar">{data.admin_account.name.trim().slice(0, 1).toUpperCase() || 'A'}</span><div className="pinned-admin-user"><strong>{data.admin_account.name}</strong><small>{data.admin_account.email_address}</small></div><span className="admin-account-badge">ADMIN</span></div></div>}
        <div className="directory-toolbar"><div className="directory-controls"><label className="search-field"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search name or email" autoComplete="off" value={search} onChange={(event) => { setSearch(event.target.value); setSearchPage(1); }} /><kbd>↵</kbd></label></div><span className="page-summary">{loading ? 'Loading users…' : `Showing ${formatNumber(start)}–${formatNumber(end)} of ${formatNumber(pagination.total)} users`}</span></div>
        <div id="users-table"><UserTable users={data?.users || []} emptyMessage={search ? 'No users match that search.' : 'No accounts have registered yet.'} /></div>
        <div className="pagination"><span>Page {pagination.current_page} of {pagination.last_page}</span><div><button type="button" aria-label="Previous page" disabled={loading || pagination.current_page <= 1} onClick={() => setSearchPage(pagination.current_page - 1)}>←</button><button type="button" aria-label="Next page" disabled={loading || pagination.current_page >= pagination.last_page} onClick={() => setSearchPage(pagination.current_page + 1)}>→</button></div></div>
      </section>
      <PageFooter>Activity reflects authenticated API use in the last 30 days.</PageFooter>
    </section>
  );
}
