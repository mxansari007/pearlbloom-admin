import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import ProductEditPage from "./pages/ProductEditPage";
import CollectionsPage from "./pages/CollectionsPage";
import HomepagePage from "./pages/HomepagePage";
import SettingsPage from "./pages/SettingsPage";

import ChatsPage from "./pages/ChatsPage";
import ChatDetailPage from "./pages/ChatDetailPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products"
          element={
            <ProtectedRoute>
              <ProductsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products/:id"
          element={
            <ProtectedRoute>
              <ProductEditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collections"
          element={
            <ProtectedRoute>
              <CollectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/homepage"
          element={
            <ProtectedRoute>
              <HomepagePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        <Route path="/chats" element={
          <ProtectedRoute>
            <ChatsPage />
          </ProtectedRoute>}
        />
        <Route path="/chats/:chatId" element={
          <ProtectedRoute>
            <ChatDetailPage />
          </ProtectedRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
