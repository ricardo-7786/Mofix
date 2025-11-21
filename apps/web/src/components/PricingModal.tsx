// apps/web/src/components/PricingModal.tsx
import * as React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Card, CardContent, Typography, Chip, Divider, Box,
} from '@mui/material';

type Plan = {
  name: string;
  price: string;     // USD price, e.g. "$119"
  perUse: string;    // e.g. "$23.8 / use"
  local?: string;    // optional: "≈ 165,000 KRW"
  desc: string;
  highlight?: boolean;
};

export default function PricingModal({
  open,
  onClose,
  showLocal = false, // USD-only 기본, 로컬 통화 표시하려면 true
}: {
  open: boolean;
  onClose: () => void;
  showLocal?: boolean;
}) {
  const plans: Plan[] = [
    { name: 'Single Pass', price: '$29',  perUse: '$29.0 / use',  local: '≈ 40,000 KRW',   desc: 'One-time usage for quick trials' },
    { name: '5-Pack',      price: '$119', perUse: '$23.8 / use',  local: '≈ 165,000 KRW',  desc: 'Conversion-friendly bundle (~18% off)', highlight: true },
    { name: '10-Pack',     price: '$229', perUse: '$22.9 / use',  local: '≈ 316,000 KRW',  desc: 'Balanced value (~21% off)' },
    { name: '50-Pack',     price: '$999', perUse: '$19.9 / use',  local: '≈ 1,379,000 KRW', desc: 'For teams/heavy users' },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: 'blur(6px)',
            bgcolor: 'rgba(0,0,0,0.45)',
          },
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 800, textAlign: 'center' }}>
        Pricing Plans
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" align="center" sx={{ mb: 3, color: 'text.secondary' }}>
          Choose a plan that fits your workflow. Each pass unlocks a full MoFix migration session.
        </Typography>

        {/* ✅ CSS Grid (Grid 컴포넌트 사용 안 함) */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
          }}
        >
          {plans.map((p) => (
            <Card
              key={p.name}
              sx={{
                borderRadius: 3,
                border: p.highlight ? '2px solid #7C4DFF' : '1px solid rgba(148,163,184,.2)',
                boxShadow: p.highlight ? '0 0 20px rgba(124,77,255,.4)' : '0 4px 20px rgba(0,0,0,.1)',
                bgcolor: 'rgba(255,255,255,0.03)',
                textAlign: 'center',
                p: 2,
              }}
            >
              <CardContent>
                {p.highlight && (
                  <Chip
                    label="Most Popular"
                    size="small"
                    sx={{ mb: 1, bgcolor: '#7C4DFF', color: 'white', fontWeight: 700 }}
                  />
                )}

                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                  {p.name}
                </Typography>

                <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
                  {p.price}
                </Typography>

                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                  {p.perUse}
                </Typography>

                <Divider sx={{ my: 1, borderColor: 'rgba(148,163,184,.2)' }} />

                {showLocal && p.local && (
                  <Typography variant="body2" sx={{ color: '#AFC0E8', mb: 0.5 }}>
                    {p.local}
                  </Typography>
                )}

                <Typography variant="body2" sx={{ color: '#8FA1C4', mb: 2 }}>
                  {p.desc}
                </Typography>

                <Button
                  variant={p.highlight ? 'contained' : 'outlined'}
                  sx={{
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: 2,
                    px: 3,
                    background: p.highlight
                      ? 'linear-gradient(180deg,#7C4DFF 0%,#5F3BFF 100%)'
                      : undefined,
                  }}
                >
                  Select
                </Button>
              </CardContent>
            </Card>
          ))}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">Close</Button>
      </DialogActions>
    </Dialog>
  );
}
