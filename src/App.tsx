import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Offers from './pages/Offers';
import Channels from './pages/Channels';
import History from './pages/History';
import Settings from './pages/Settings';
import PublicPage from './pages/PublicPage';
import Layout from './components/Layout';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLogin = () => setIsLoggedIn(true);
  const handleLogout = () => setIsLoggedIn(false);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public page — no auth required */}
        <Route path="/u/:username" element={<PublicPage />} />

        {/* Auth */}
        <Route
          path="/login"
          element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />}
        />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            isLoggedIn ? (
              <Layout onLogout={handleLogout}>
                <Dashboard />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/offers"
          element={
            isLoggedIn ? (
              <Layout onLogout={handleLogout}>
                <Offers />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/channels"
          element={
            isLoggedIn ? (
              <Layout onLogout={handleLogout}>
                <Channels />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/history"
          element={
            isLoggedIn ? (
              <Layout onLogout={handleLogout}>
                <History />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/settings"
          element={
            isLoggedIn ? (
              <Layout onLogout={handleLogout}>
                <Settings />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to={isLoggedIn ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
