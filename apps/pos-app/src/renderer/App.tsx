import { useEffect } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import POSPage from "./pages/POSPage";
import ProductsPage from "./pages/ProductsPage";
import AddProductPage from "./pages/AddProductPage";
import CustomersPage from "./pages/CustomersPage";
import PromotionsPage from "./pages/PromotionsPage";
import InventoryPage from "./pages/InventoryPage";
import StoresPage from "./pages/StoresPage";
import UsersPage from "./pages/UsersPage";
import AnalyticsPage from "./pages/AnalyticsPage";
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

/** App shell for the standalone offline-first POS terminal. */
export default function App() {
  const user = useAuthStore((s) => s.user);
  const isManager = !!user && ["manager", "admin", "owner"].includes(user.role);
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
        <strong>CounterFlow POS</strong>
        <span className="muted">Standalone terminal · v0.4.0</span>
        <SyncStatusBadge />
        <nav className="nav">
          {user && (
            <>
              <NavLink to="/products" className={navClass}>Catalog</NavLink>
              <NavLink to="/add-product" className={navClass}>Add Product</NavLink>
              <NavLink to="/pos" className={navClass}>Checkout</NavLink>
              <NavLink to="/transactions" className={navClass}>Dashboard</NavLink>
              <NavLink to="/analytics" className={navClass}>Analytics</NavLink>
              <NavLink to="/customers" className={navClass}>Customers</NavLink>
              <NavLink to="/promotions" className={navClass}>Promotions</NavLink>
              <NavLink to="/inventory" className={navClass}>Inventory</NavLink>
              <NavLink to="/stores" className={navClass}>Stores</NavLink>
              {isManager && <NavLink to="/users" className={navClass}>Users</NavLink>}
              <NavLink to="/orders" className={navClass}>Orders</NavLink>
              <NavLink to="/offline-trades" className={navClass}>Offline Orders</NavLink>
              <NavLink to="/returns" className={navClass}>Returns</NavLink>
              <NavLink to="/bulk" className={navClass}>Bulk Upload</NavLink>
              <NavLink to="/closing" className={navClass}>EOD</NavLink>
              <NavLink to="/pending" className={navClass}>Pending Sync</NavLink>
              <NavLink to="/sync" className={navClass}>Sync</NavLink>
              <NavLink to="/conflicts" className={navClass}>Conflicts</NavLink>
              <NavLink to="/settings" className={navClass}>Settings</NavLink>
            </>
          )}
        </nav>
        {user && <span className="muted">{user.name} · {prettyRole(user.role)}</span>}
      </header>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/add-product" element={<AddProductPage />} />
        <Route path="/pos" element={<POSPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/promotions" element={<PromotionsPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/stores" element={<StoresPage />} />
        <Route path="/users" element={<UsersPage />} />
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

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "active" : "";
}

function prettyRole(role: string): string {
  if (role === "manager") return "Manager";
  if (role === "cashier") return "Cashier";
  return role;
}
