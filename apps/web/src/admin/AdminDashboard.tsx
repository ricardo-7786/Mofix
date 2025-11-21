// apps/web/src/admin/AdminDashboard.tsx
import * as React from 'react';
import {
  Box, Container, Paper, Typography, Stack,
  Button, LinearProgress, List, ListItem, ListItemText, Divider
} from '@mui/material';

const API_BASE = 'https://api-yqpwamvbqq-du.a.run.app';

type RoutesResp = { ok: boolean; routes: { method: string; path: string | string[] }[] };
type LimitsResp = {
  upload_mb: number;
  uploads_per_day: number;
  bytes_per_month: number;
  raw_ttl_days: number;
  results_ttl_days: number;
  gcs_bucket?: string;
};

export default function AdminDashboard() {
  const [loading, setLoading] = React.useState(false);
  const [health, setHealth] = React.useState<string | null>(null);
  const [limits, setLimits] = React.useState<LimitsResp | null>(null);
  const [routes, setRoutes] = React.useState<RoutesResp['routes']>([]);
  const [storageInfo, setStorageInfo] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/health`);
      const text = await r.text();
      setHealth(`${r.status} ${text.trim()}`);
    } catch (e: any) {
      setError(e?.message || 'health failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchLimits = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/limits`);
      const j = await r.json();
      setLimits(j);
    } catch (e: any) {
      setError(e?.message || 'limits failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoutes = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/routes`);
      const j: RoutesResp = await r.json();
      setRoutes(j.routes || []);
    } catch (e: any) {
      setError(e?.message || 'routes failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchStorageDebug = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/debug/storage`);
      const j = await r.json();
      setStorageInfo(j);
    } catch (e: any) {
      setError(e?.message || 'debug/storage failed');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    // 첫 로드 때 기본 정보들 가져오기
    fetchHealth();
    fetchLimits();
    fetchRoutes();
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#E5E7EB', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>
          MoFix Admin Dashboard
        </Typography>
        <Typography variant="body2" sx={{ mb: 3, color: '#9CA3AF' }}>
          Backend status, limits, routes, and storage debug.
        </Typography>

        {loading && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress />
          </Box>
        )}
        {error && (
          <Typography sx={{ mb: 2, color: '#f97373' }}>
            Error: {error}
          </Typography>
        )}

        <Stack spacing={2}>
          <Paper sx={{ p: 2, bgcolor: '#020617', border: '1px solid #1E293B', borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Health</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={fetchHealth}>Check /health</Button>
            </Stack>
            <Typography variant="body2" sx={{ mt: 1, color: '#E5E7EB' }}>
              {health ?? 'No data yet.'}
            </Typography>
          </Paper>

          <Paper sx={{ p: 2, bgcolor: '#020617', border: '1px solid #1E293B', borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Limits</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={fetchLimits}>Refresh /limits</Button>
            </Stack>
            {limits ? (
              <Box sx={{ mt: 1, fontSize: 14 }}>
                <div>upload_mb: {limits.upload_mb}</div>
                <div>uploads_per_day: {limits.uploads_per_day}</div>
                <div>bytes_per_month: {limits.bytes_per_month}</div>
                <div>raw_ttl_days: {limits.raw_ttl_days}</div>
                <div>results_ttl_days: {limits.results_ttl_days}</div>
                <div>gcs_bucket: {limits.gcs_bucket ?? '-'}</div>
              </Box>
            ) : (
              <Typography variant="body2" sx={{ mt: 1, color: '#9CA3AF' }}>No limits data.</Typography>
            )}
          </Paper>

          <Paper sx={{ p: 2, bgcolor: '#020617', border: '1px solid #1E293B', borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Routes</Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Button size="small" variant="outlined" onClick={fetchRoutes}>Refresh /routes</Button>
            </Stack>
            <List dense>
              {routes.map((r, i) => (
                <React.Fragment key={i}>
                  <ListItem>
                    <ListItemText
                      primary={`${r.method}`}
                      secondary={Array.isArray(r.path) ? r.path.join(', ') : r.path}
                      primaryTypographyProps={{ sx: { fontSize: 13, fontWeight: 700, color: '#BFDBFE' } }}
                      secondaryTypographyProps={{ sx: { fontSize: 12, color: '#9CA3AF' } }}
                    />
                  </ListItem>
                  {i < routes.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          </Paper>

          <Paper sx={{ p: 2, bgcolor: '#020617', border: '1px solid #1E293B', borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Storage Debug</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={fetchStorageDebug}>Call /debug/storage</Button>
            </Stack>
            {storageInfo && (
              <Box sx={{ mt: 1, fontSize: 13 }}>
                <div>usedBucket: {storageInfo.usedBucket}</div>
                <div>total files under results/: {storageInfo.total}</div>
                <pre style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
                  {JSON.stringify(storageInfo.files, null, 2)}
                </pre>
              </Box>
            )}
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}
