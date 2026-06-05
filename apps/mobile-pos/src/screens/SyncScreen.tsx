import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Badge, Button, Muted, Panel, Row, Stat, Title, styles, ScreenScroll } from "../components/ui";
import { syncQueue } from "../db/repositories";
import { getSyncState, onSyncState, pauseSyncWorker, tick } from "../sync";

export default function SyncScreen() {
  const [state, setState] = useState(getSyncState());
  const [stats, setStats] = useState<Record<string, number>>({
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    conflict: 0,
  });

  useEffect(() => {
    const unsub = onSyncState(setState);
    const refresh = async () => setStats(await syncQueue.stats());
    refresh();
    const h = setInterval(refresh, 2000);
    return () => {
      unsub();
      clearInterval(h);
    };
  }, []);

  return (
    <ScreenScroll>
      <Title style={{ marginBottom: 12 }}>📡 Sync</Title>

      <Panel elev style={{ marginBottom: 12 }}>
        <Row style={{ marginBottom: 12 }}>
          <Badge variant={state.online ? "online" : "offline"}>
            {state.online ? "Online" : "Offline"}
          </Badge>
          {state.in_progress && <Badge variant="info">Syncing…</Badge>}
          {state.paused && <Badge variant="offline">Paused</Badge>}
        </Row>
        <Muted>Last pull: {state.last_pull_at ?? "—"}</Muted>
        <Muted>Last push: {state.last_push_at ?? "—"}</Muted>
        <View style={{ height: 12 }} />
        <Row gap={8}>
          <Button variant="primary" style={{ flex: 1 }} onPress={() => tick()}>
            Sync now
          </Button>
          <Button
            variant="ghost"
            style={{ flex: 1 }}
            onPress={() => pauseSyncWorker(!state.paused)}
          >
            {state.paused ? "Resume" : "Pause"}
          </Button>
        </Row>
      </Panel>

      <Panel elev>
        <Title style={{ fontSize: 16, marginBottom: 8 }}>📦 Queue</Title>
        <Row gap={8}>
          <Stat label="Pending" value={stats.pending} tone="warning" />
          <Stat label="Syncing" value={stats.syncing} tone="info" />
        </Row>
        <View style={{ height: 8 }} />
        <Row gap={8}>
          <Stat label="Synced" value={stats.synced} tone="success" />
          <Stat label="Failed" value={stats.failed} tone="danger" />
        </Row>
        <View style={{ height: 8 }} />
        <Stat label="Conflicts" value={stats.conflict} tone="danger" />
      </Panel>
    </ScreenScroll>
  );
}
