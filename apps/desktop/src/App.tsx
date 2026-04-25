import { Routes, Route } from 'react-router-dom';
import LoginPage from './routes/LoginPage';
import ProtectedRoute from './routes/ProtectedRoute';
import AdminRoot from './routes/AdminRoot';
import StaffRoot from './staff/App';

export default function App() {
  return (
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
            <AdminRoot />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
