import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ENV } from './lib/env';
import { isAllowedHost } from './lib/hostname-guard';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { ToastProvider } from './context/ToastContext';
import AdminLayout from './components/AdminLayout';
import RequirePermission from './components/RequirePermission';
import Login from './pages/Login';
import MfaEnroll from './pages/MfaEnroll';
import MfaChallenge from './pages/MfaChallenge';
import Unauthorized from './pages/Unauthorized';
import Dashboard from './pages/Dashboard';
import AdminsList from './pages/admins/AdminsList';
import InviteAdmin from './pages/admins/InviteAdmin';
import RolesList from './pages/roles/RolesList';
import AuditList from './pages/audit/AuditList';
import UsersList from './pages/users/UsersList';
import UserDetail from './pages/users/UserDetail';
import PromotionsList from './pages/operation/PromotionsList';
import PromotionDetail from './pages/operation/PromotionDetail';
import SendsList from './pages/operation/SendsList';

function Gate() {
  const { phase } = useAdminAuth();
  if (phase === 'resolving') {
    return <div className="grid min-h-screen place-items-center text-sm text-ink-secondary">Carregando...</div>;
  }
  if (phase === 'anon') return <Login />;
  if (phase === 'needs_mfa_enroll') return <MfaEnroll />;
  if (phase === 'needs_mfa_challenge') return <MfaChallenge />;
  if (phase === 'not_admin') return <Unauthorized variant="no-access" />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<RequirePermission permission="dashboard.read"><Dashboard /></RequirePermission>} />
          <Route path="/admins" element={<RequirePermission permission="admins.read"><AdminsList /></RequirePermission>} />
          <Route path="/admins/invite" element={<RequirePermission permission="admins.manage"><InviteAdmin /></RequirePermission>} />
          <Route path="/roles" element={<RequirePermission permission="roles.read"><RolesList /></RequirePermission>} />
          <Route path="/audit" element={<RequirePermission permission="audit.read"><AuditList /></RequirePermission>} />
          <Route path="/users" element={<RequirePermission permission="users.read"><UsersList /></RequirePermission>} />
          <Route path="/users/:id" element={<RequirePermission permission="users.read"><UserDetail /></RequirePermission>} />
          <Route path="/promotions" element={<RequirePermission permission="promotions.read"><PromotionsList /></RequirePermission>} />
          <Route path="/promotions/:id" element={<RequirePermission permission="promotions.read"><PromotionDetail /></RequirePermission>} />
          <Route path="/sends" element={<RequirePermission permission="sends.read"><SendsList /></RequirePermission>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  if (!isAllowedHost(window.location.hostname, ENV.isProd, ENV.adminHostname)) {
    return <Unauthorized variant="wrong-host" />;
  }
  return (
    <ToastProvider>
      <AdminAuthProvider>
        <Gate />
      </AdminAuthProvider>
    </ToastProvider>
  );
}
