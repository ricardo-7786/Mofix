// apps/web/src/components/PreviewOnceDialog.tsx
import * as React from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, LinearProgress, Chip, IconButton, Stack, Backdrop
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

type PreviewOnceDialogProps = {
  open: boolean;
  onClose: () => void;       // user clicks close or trial expires
  previewUrl: string;        // iframe URL (e.g., /preview/<id>/)
  seconds?: number;          // default 10s
  previewKey: string;        // unique key per resultId/projectId for 1-time rule
};

const LS_PREFIX = "preview_used:";

export function isPreviewUsed(previewKey: string) {
  try { return localStorage.getItem(LS_PREFIX + previewKey) === "1"; } catch { return false; }
}
export function setPreviewUsed(previewKey: string) {
  try { localStorage.setItem(LS_PREFIX + previewKey, "1"); } catch {}
}

export default function PreviewOnceDialog({
  open,
  onClose,
  previewUrl,
  seconds = 10,
  previewKey,
}: PreviewOnceDialogProps) {
  const [left, setLeft] = React.useState(seconds);

  // countdown + auto close
  React.useEffect(() => {
    if (!open) return;
    setLeft(seconds);
    const tick = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(tick);
          setPreviewUsed(previewKey); // mark used on expiry
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [open, seconds, previewKey, onClose]);

  const progress = Math.round(((seconds - left) / seconds) * 100);

  const handleManualClose = () => {
    // Treat manual close as used (keep or remove per policy)
    setPreviewUsed(previewKey);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleManualClose}
      fullWidth
      maxWidth="lg"
      // Dim background only; App.tsx handles blur
      slots={{ backdrop: Backdrop }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(0,0,0,0.45)",
          },
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        Preview (10s trial)
        <Chip label={`${left}s`} size="small" />
        <Box sx={{ flex: 1 }} />
        <IconButton aria-label="close" onClick={handleManualClose}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <LinearProgress variant="determinate" value={progress} sx={{ height: 4 }} />

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ height: 600 }}>
          <iframe
            src={previewUrl}
            title="MoFix Preview"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%" }} spacing={2}>
          <Typography variant="body2" color="text.secondary">
            ⏰ One-time preview per result. The trial ends automatically after 10 seconds.
          </Typography>
          <Button onClick={handleManualClose}>Close</Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
