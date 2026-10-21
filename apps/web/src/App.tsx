import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import BookingsAdminApp from "./admin/BookingsAdminApp";
import ResourcesAdminApp from "./admin/ResourcesAdminApp";
import OperationLogsAdminApp from "./admin/OperationLogsAdminApp";
import OutboxAdminApp from "./admin/OutboxAdminApp";
import UsersAdminApp from "./admin/UsersAdminApp";
import AuthApp from "./auth/AuthApp";
import MyBookingsApp from "./bookings/MyBookingsApp";
import HomeApp from "./index/HomeApp";
import ResourceBrowseApp from "./resources/ResourceBrowseApp";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeApp />} />
        <Route path="/auth" element={<AuthApp />} />
        <Route path="/bookings" element={<MyBookingsApp />} />
        <Route path="/admin/bookings" element={<BookingsAdminApp />} />
        <Route path="/admin/resources" element={<ResourcesAdminApp />} />
        <Route
          path="/admin/operation-logs"
          element={<OperationLogsAdminApp />}
        />
        <Route path="/admin/outbox" element={<OutboxAdminApp />} />
        <Route path="/admin/users" element={<UsersAdminApp />} />
        <Route path="/resources" element={<ResourceBrowseApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
