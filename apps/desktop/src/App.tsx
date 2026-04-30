import { Routes, Route } from 'react-router-dom';
import LoginPage from './routes/LoginPage';
import ProtectedRoute from './routes/ProtectedRoute';
import AdminRoute from './routes/AdminRoute';
import AdminRoot from './routes/AdminRoot';
import StaffRoot from './staff/App';

export default function App() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
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
