import { NavLink } from 'react-router-dom';
import FaithStreamLogo from '../../../desktop/src/assets/img/Logo.png';
import type { AuthUser } from '../utils/types';
import { initials } from '../utils/format';

interface SidebarProps {
  user: AuthUser;
  onLogout: () => void;
  deletionRequestCount?: number;
}

export default function Sidebar({ user, onLogout, deletionRequestCount = 0 }: SidebarProps) {
  return (
    <aside className="sidebar">
      <NavLink className="brand-lockup sidebar-brand" to="/overview" aria-label="FaithStream Admin overview">
        <img className="brand-logo" src={FaithStreamLogo} alt="FaithStream" />
        <span className="sidebar-brand-meta">
          <span className="sidebar-brand-name">FaithStream</span>
          <small>ADMIN</small>
        </span>
      </NavLink>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Admin sections">
        <NavLink className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} to="/overview"><span className="nav-icon" aria-hidden="true">◫</span>Overview</NavLink>
        <NavLink className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} to="/users"><span className="nav-icon" aria-hidden="true">♙</span>Users{deletionRequestCount > 0 && <span className="nav-alert-count" aria-label={`${deletionRequestCount} deletion requests pending`}>{deletionRequestCount > 99 ? '99+' : deletionRequestCount}</span>}</NavLink>
        <NavLink className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} to="/subscriptions"><span className="nav-icon" aria-hidden="true">◇</span>Subscriptions<span className="nav-soon">SETUP</span></NavLink>
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-note"><span className="note-icon">i</span><div><strong>Billing isn’t connected</strong><p>Subscription records will appear here once plans launch.</p></div></div>
      <div className="sidebar-profile">
        <span className="profile-avatar">{initials(user.name).charAt(0)}</span>
        <span className="profile-text"><strong>{user.name || 'Administrator'}</strong><small>{user.email_address}</small></span>
        <button className="logout-button" type="button" aria-label="Sign out" title="Sign out" onClick={onLogout}>↗</button>
      </div>
    </aside>
  );
}
