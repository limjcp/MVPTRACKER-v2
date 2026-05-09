import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoginPage from './routes/LoginPage';
import ProtectedRoute from './routes/ProtectedRoute';
import AdminRoute from './routes/AdminRoute';
import AdminRoot from './routes/AdminRoot';
import StaffRoot from './staff/App';
import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';

export default function App() {
  useEffect(() => {
    if (!isTauri()) return;
    void getVersion()
      .then((v) => {
        document.title = `MVPTime v${v}`;
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <Toaster position="bottom-left" theme="dark" closeButton />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <StaffRoot />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminRoot />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}
