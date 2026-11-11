import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { ApiError, errorMessage, requestApi } from '../utils/api'
import { useAdminAuth } from '../context/AdminAuthProvider'
import PageFooter from '../components/PageFooter'
import StatCard from '../components/StatCard'
import UserTable from '../components/UserTable'
import type { OverviewResponse } from '../utils/types'
import { formatDate, formatNumber, formatTime } from '../utils/format'
import type { AdminLayoutOutletContext } from '../components/AdminLayout'

function RegistrationChart({ months }: { months: OverviewResponse['registrations'] }) {
  if (months.length === 0) {
    return <div className="empty-chart">Registration history will appear here.</div>
  }

  const maximum = Math.max(1, ...months.map((item) => Number(item.users || 0)))

  return months.map((item) => {
    const value = Number(item.users || 0)
    const height = value ? Math.max(8, Math.round((value / maximum) * 100)) : 2
    return (
      <div className="chart-month" key={item.month}>
        <span className="chart-value">{formatNumber(value)}</span>
        <div className="chart-rail">
          <div className="chart-bar" style={{ height: `${height}%` }} />
        </div>
        <span className="chart-label">{item.month.split(' ')[0]}</span>
      </div>
    )
  })
}

export default function OverviewPage() {
  const { refreshKey, setRefreshing } = useOutletContext<AdminLayoutOutletContext>()
  const { clearSession } = useAdminAuth()
  const navigate = useNavigate()

  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [updatedAt, setUpdatedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setRefreshing(true)
    setError('')

    async function loadOverview(): Promise<void> {
      try {
        const data = await requestApi<OverviewResponse>('/admin/overview')
        if (active) {
          setOverview(data)
          setUpdatedAt(data.generated_at)
        }
      } catch (requestError) {
        if (active && requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) {
          clearSession()
          navigate('/login', {
            replace: true,
            state: {
              message:
                requestError.status === 401
                  ? 'Your session expired. Sign in again.'
                  : 'This account is not authorized. Add its email to ADMIN_EMAILS in the backend environment.',
            },
          })
        } else if (active) {
          setError(errorMessage(requestError))
        }
      } finally {
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void loadOverview()
    return () => {
      active = false
      setRefreshing(false)
    }
  }, [clearSession, navigate, refreshKey, setRefreshing])

  if (loading && !overview) {
    return (
      <section className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PLATFORM HEALTH</p>
            <h1>Overview</h1>
            <p className="page-subtitle">Loading account and service metrics…</p>
          </div>
        </div>
        {error && (
          <div className="alert-banner" role="alert">
            {error}
          </div>
        )}
      </section>
    )
  }

  const stats = overview?.stats

  return (
    <section className="page-content">
      {/* Header */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">PLATFORM HEALTH</p>
          <h1>Overview</h1>
          <p className="page-subtitle">A live snapshot of FaithStream Studio accounts and service activity.</p>
        </div>
        <span className="updated-label">{formatTime(updatedAt)}</span>
      </div>

      {error && (
        <div className="alert-banner" role="alert">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard label="Total accounts" value={stats?.total_users} meta="All registered users" icon="♙" />
        <StatCard
          label="Verified accounts"
          value={stats?.verified_users}
          meta={`${formatNumber(stats?.unverified_users)} awaiting verification`}
          icon="✓"
        />
        <StatCard label="New users · 30 days" value={stats?.new_users_30_days} meta="Accounts created in the last 30 days" icon="↗" />
        <StatCard
          label="Active users · 30 days"
          value={stats?.active_users_30_days}
          meta="Authenticated API activity in the last 30 days"
          icon="●"
        />
      </div>

      {/* Dashboard Grid: Chart & Licenses Summary */}
      <div className="dashboard-grid">
        <section className="panel registrations-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ACCOUNT GROWTH</p>
              <h2>New registrations</h2>
            </div>
            <span className="panel-range">LAST 6 MONTHS</span>
          </div>
          <div className="registration-chart">
            <RegistrationChart months={overview?.registrations || []} />
          </div>
        </section>

        <section className="panel subscription-summary">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PRODUCT ACCESS</p>
              <h2>Licenses</h2>
            </div>
            <span className="subscription-icon">◇</span>
          </div>
          <div className="not-configured">
            <span className="not-configured-dot" />
            <strong>Free launch period</strong>
            <p>FaithStream Studio is free for at least the first three months. A one-time license is planned afterward.</p>
            <Link className="text-button" to="/licenses">
              View license details <span>→</span>
            </Link>
          </div>
        </section>
      </div>

      {/* User Directory Panel */}
      <section className="panel users-panel">
        <div className="panel-heading users-panel-heading">
          <div>
            <p className="eyebrow">ACCOUNT DIRECTORY</p>
            <h2>Recently joined</h2>
          </div>
          <Link className="text-button" to="/users">
            View all users <span>→</span>
          </Link>
        </div>
        <UserTable users={overview?.recent_users || []} compact emptyMessage="No accounts have registered yet." />
      </section>

      <PageFooter>Private operational data · {formatDate(updatedAt)}</PageFooter>
    </section>
  )
}