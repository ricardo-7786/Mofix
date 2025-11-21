// apps/web/src/pages/dashboard.tsx
import * as React from "react";
import { Button, Box, Typography } from "@mui/material";
import VerifyButton from "../components/VerifyButton";
import PricingModal from "../components/PricingModal";

export default function DashboardPage() {
  const [openPricing, setOpenPricing] = React.useState(false);

  return (
    <Box sx={{ p: 6 }}>
      <Typography variant="h5" fontWeight="bold" mb={3}>
        Migration Dashboard
      </Typography>

      {/* 기존 버튼 */}
      <VerifyButton />

      {/* 플랜 보기 버튼 */}
      <Button
        variant="contained"
        sx={{
          mt: 4,
          fontWeight: 700,
          borderRadius: 2,
          background: "linear-gradient(180deg,#7C4DFF 0%,#5F3BFF 100%)",
          textTransform: "none",
        }}
        onClick={() => setOpenPricing(true)}
      >
        View Pricing Plans
      </Button>

      {/* 가격표 모달 */}
      <PricingModal
        open={openPricing}
        onClose={() => setOpenPricing(false)}
        showLocal
      />
    </Box>
  );
}
