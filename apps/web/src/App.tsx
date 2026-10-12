import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthApp from "./auth/AuthApp";
import HomeApp from "./index/HomeApp";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeApp />} />
        <Route path="/auth" element={<AuthApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
