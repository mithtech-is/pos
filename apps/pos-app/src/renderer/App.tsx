import { useEffect } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import POSPage from "./pages/POSPage";
import ProductsPage from "./pages/ProductsPage";
import OrdersPage from "./pages/OrdersPage";
import PendingOrdersPage from "./pages/PendingOrdersPage";
import SyncPage from "./pages/SyncPage";
import ConflictsPage from "./pages/ConflictsPage";
import SettingsPage from "./pages/SettingsPage";
import CashClosingPage from "./pages/CashClosingPage";
import ReturnsPage from "./pages/ReturnsPage";
import BulkOrderPage from "./pages/BulkOrderPage";
import TransactionsPage from "./pages/TransactionsPage";
import OfflineTradesPage from "./pages/OfflineTradesPage";
import SyncStatusBadge from "./components/SyncStatusBadge";
import { useAuthStore } from "./state/auth";
import { useThemeStore } from "./state/theme";

/**
 * App shell — Polemarch unlisted-shares dealer POS.
 *
 * The underlying offline-first machinery (SQLite + sync queue + idempotency
 * keys) is the same as it was when this app was a school-uniform POS — the
 * concepts are just relabelled in the UI:
 *
 *   schools/products → company listings (issuer + ISIN)
 *   orders           → trades
 *   cart             → trade ticket
 *   returns          → trade reversals
 *   bulk order       → bulk trade upload
 *   cash closing     → end-of-day reconciliation
 *   cashier/manager  → dealer / compliance officer
 *
 * Routes use the new domain names; the legacy URLs (/pos, /products, etc.)
 * are kept so deep links and the existing IPC code keep working.
 */
export default function App() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateTheme();
  }, [hydrateTheme]);

  if (!user && location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="layout">
      <header className="topbar">
        <strong>Polemarch</strong>
        <span className="muted">Unlisted Shares · v0.3.0</span>
        <SyncStatusBadge />
        <nav className="nav">
          {user && (
            <>
              <NavLink to="/products" className={({ isActive }) => (isActive ? "active" : "")}>Listings</NavLink>
              <NavLink to="/pos" className={({ isActive }) => (isActive ? "active" : "")}>Trade Ticket</NavLink>
              <NavLink to="/transactions" className={({ isActive }) => (isActive ? "active" : "")}>Dashboard</NavLink>
              <NavLink to="/orders" className={({ isActive }) => (isActive ? "active" : "")}>Trades</NavLink>
              <NavLink to="/offline-trades" className={({ isActive }) => (isActive ? "active" : "")}>Offline Trades</NavLink>
              <NavLink to="/returns" className={({ isActive }) => (isActive ? "active" : "")}>Reversals</NavLink>
              <NavLink to="/bulk" className={({ isActive }) => (isActive ? "active" : "")}>Bulk Upload</NavLink>
              <NavLink to="/closing" className={({ isActive }) => (isActive ? "active" : "")}>EOD</NavLink>
              <NavLink to="/pending" className={({ isActive }) => (isActive ? "active" : "")}>Pending Sync</NavLink>
              <NavLink to="/sync" className={({ isActive }) => (isActive ? "active" : "")}>Sync</NavLink>
              <NavLink to="/conflicts" className={({ isActive }) => (isActive ? "active" : "")}>Conflicts</NavLink>
              <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>Settings</NavLink>
            </>
          )}
        </nav>
        {user && <span className="muted">{user.name} · {prettyRole(user.role)}</span>}
      </header>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/pos" element={<POSPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/offline-trades" element={<OfflineTradesPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/bulk" element={<BulkOrderPage />} />
        <Route path="/closing" element={<CashClosingPage />} />
        <Route path="/pending" element={<PendingOrdersPage />} />
        <Route path="/sync" element={<SyncPage />} />
        <Route path="/conflicts" element={<ConflictsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to={user ? "/pos" : "/login"} replace />} />
      </Routes>
    </div>
  );
}

function prettyRole(role: string): string {
  if (role === "manager") return "Compliance Officer";
  if (role === "cashier") return "Dealer";
  return role;
}
