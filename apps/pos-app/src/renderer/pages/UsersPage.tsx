import { useEffect, useMemo, useState } from "react";
import { ALL_BRANCH_ROLES } from "@pos/shared";
import { useAuthStore } from "../state/auth";

/**
 * Users & Branches (manager back-office).
 *
 * Assign which outlets each cashier may operate. The rule (shared with the
 * checkout outlet picker and the backend sync guard):
 *   • managers / admins / owners → every branch, always (not editable here)
 *   • a cashier WITH branches selected → scoped to exactly those
 *   • a cashier with NONE selected → unrestricted (all branches)
 *
 * Online-only: assignments are written to the backend and pulled down to every
 * device on the next sync, so a cashier's outlet picker updates everywhere.
 */
type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  branch_ids: string[];
};
type Outlet = { id: string; name: string; code: string; status?: string };

const ROLE_ALL = new Set<string>(ALL_BRANCH_ROLES);

export default function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const isManager = !!me && ROLE_ALL.has(me.role);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const [u, s] = await Promise.all([
        window.pos.listUsersAdmin(),
        window.pos.listStores(),
      ]);
      if (u?.ok && Array.isArray(u.data)) {
        setUsers(u.data);
        setDraft(
          Object.fromEntries(u.data.map((x: AdminUser) => [x.id, [...(x.branch_ids ?? [])]])),
        );
      } else {
        setMsg(u?.error ?? "Could not load users — the backend may be offline.");
      }
      if (s?.ok && Array.isArray(s.data)) setOutlets(s.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isManager) void load().catch(() => {});
  }, [isManager]);

  function toggle(userId: string, outletId: string) {
    setDraft((d) => {
      const cur = new Set(d[userId] ?? []);
      if (cur.has(outletId)) cur.delete(outletId);
      else cur.add(outletId);
      return { ...d, [userId]: [...cur] };
    });
  }

  function dirty(u: AdminUser): boolean {
    const a = [...(u.branch_ids ?? [])].sort().join(",");
    const b = [...(draft[u.id] ?? [])].sort().join(",");
    return a !== b;
  }

  async function save(u: AdminUser) {
    setSavingId(u.id);
    setMsg(null);
    try {
      const branch_ids = draft[u.id] ?? [];
      const r = await window.pos.setUserBranches({ id: u.id, branch_ids });
      if (r?.ok) {
        setMsg(`Saved branch access for ${u.name}.`);
        await load();
      } else {
        setMsg(r?.error ?? "Could not save — the backend may be offline.");
      }
    } finally {
      setSavingId(null);
    }
  }

  const activeOutlets = useMemo(
    () => outlets.filter((o) => o.status !== "inactive"),
    [outlets],
  );

  if (!isManager) {
    return (
      <main style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 4px" }}>Users &amp; Branches</h1>
        <div className="panel elev" style={{ marginTop: 12 }}>
          <strong>Managers only</strong>
          <p className="muted" style={{ marginTop: 6 }}>
            Branch assignment is restricted to managers. Sign in with a manager
            account to manage which outlets each cashier can use.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px" }}>Users &amp; Branches</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Choose which outlets each cashier may operate at checkout. Tick one or
        more branches to restrict a cashier to them. Leave all unticked for full
        access. Managers, admins and owners always see every branch.
      </p>

      {msg && (
        <div className="panel" style={{ marginTop: 12 }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div className="panel elev" style={{ marginTop: 12 }}>
          <span className="muted">Loading users…</span>
        </div>
      ) : outlets.length === 0 ? (
        <div className="panel elev" style={{ marginTop: 12 }}>
          <span className="muted">
            No outlets exist yet. Create branches on the <strong>Stores</strong>{" "}
            page first, then assign users here.
          </span>
        </div>
      ) : (
        <div className="col" style={{ gap: 12, marginTop: 12 }}>
          {users.map((u) => {
            const unrestricted = ROLE_ALL.has(u.role);
            const selected = new Set(draft[u.id] ?? []);
            return (
              <div key={u.id} className="panel elev">
                <div
                  className="row"
                  style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}
                >
                  <div>
                    <strong>{u.name}</strong>{" "}
                    <span className="muted" style={{ fontSize: 12 }}>· {u.email}</span>
                    <div>
                      <span className={`badge ${unrestricted ? "online" : "info"}`}>
                        {prettyRole(u.role)}
                      </span>
                    </div>
                  </div>
                  {!unrestricted && (
                    <button
                      className="primary"
                      disabled={savingId === u.id || !dirty(u)}
                      onClick={() => void save(u)}
                    >
                      {savingId === u.id ? "Saving…" : dirty(u) ? "Save access" : "Saved"}
                    </button>
                  )}
                </div>

                {unrestricted ? (
                  <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                    Full access — this role can use every branch.
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        marginTop: 10,
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                        gap: 6,
                      }}
                    >
                      {activeOutlets.map((o) => (
                        <label
                          key={o.id}
                          className="row"
                          style={{ gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(o.id)}
                            onChange={() => toggle(u.id, o.id)}
                          />
                          <span>{o.name} <span className="muted">({o.code})</span></span>
                        </label>
                      ))}
                    </div>
                    <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                      {selected.size === 0
                        ? "No branches selected → this cashier can use ALL branches."
                        : `Restricted to ${selected.size} branch${selected.size === 1 ? "" : "es"}.`}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {users.length === 0 && (
            <div className="panel elev">
              <span className="muted">No users found. Users appear here after they sign in online at least once.</span>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function prettyRole(role: string): string {
  if (role === "manager") return "Manager";
  if (role === "cashier") return "Cashier";
  if (role === "admin") return "Admin";
  if (role === "owner") return "Owner";
  return role;
}
