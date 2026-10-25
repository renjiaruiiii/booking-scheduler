import type { ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import BookingsAdminApp from "./admin/BookingsAdminApp";
import ResourcesAdminApp from "./admin/ResourcesAdminApp";
import OperationLogsAdminApp from "./admin/OperationLogsAdminApp";
import OutboxAdminApp from "./admin/OutboxAdminApp";
import UsersAdminApp from "./admin/UsersAdminApp";
import AuthApp from "./auth/AuthApp";
import MyBookingsApp from "./bookings/MyBookingsApp";
import HomeApp from "./index/HomeApp";
import ResourceBrowseApp from "./resources/ResourceBrowseApp";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = sessionStorage.getItem("accessToken");
  const location = useLocation();
  if (token) return children;
  const next = `${location.pathname}${location.search}`;
  return <Navigate to={`/auth?next=${encodeURIComponent(next)}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeApp />} />
        <Route path="/auth" element={<AuthApp />} />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <MyBookingsApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/bookings"
          element={
            <ProtectedRoute>
              <BookingsAdminApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/resources"
          element={
            <ProtectedRoute>
              <ResourcesAdminApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/operation-logs"
          element={
            <ProtectedRoute>
              <OperationLogsAdminApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/outbox"
          element={
            <ProtectedRoute>
              <OutboxAdminApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <UsersAdminApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resources"
          element={
            <ProtectedRoute>
              <ResourceBrowseApp />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
