// apps/web/src/client/pages/docs.tsx
import * as React from "react";
import { Box, Container, Typography, Divider, Button } from "@mui/material";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";

export default function DocsPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "linear-gradient(180deg, #0b0f1f 0%, #131935 40%, #1a1445 100%)",
        color: "#E6EAF7",
        py: 8,
      }}
    >
      <Container maxWidth="md">
        <Typography variant="h3" sx={{ fontWeight: 900, mb: 2 }}>
          MoFix Documentation
        </Typography>
        <Typography variant="h6" sx={{ color: "#A7B1C8", mb: 6 }}>
          Learn how MoFix helps you migrate and optimize your projects effortlessly.
        </Typography>

        <Divider sx={{ borderColor: "rgba(255,255,255,.1)", mb: 6 }} />

        <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
          ⚙️ How It Works
        </Typography>
        <Typography sx={{ mb: 4, lineHeight: 1.8 }}>
          MoFix analyzes your uploaded project, detects its framework and structure,
          and automatically generates a migration plan optimized for your environment.
          You can preview the results instantly, or download the converted project
          as a ZIP file ready for deployment.
        </Typography>

        <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
          🧭 Step-by-Step Guide
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mb: 4 }}>
          <Step icon={<CloudUploadIcon />} title="1. Upload your ZIP file">
            Drag & drop or click to upload your project archive.
          </Step>
          <Step icon={<CheckCircleRoundedIcon />} title="2. Auto-generate Plan">
            MoFix inspects your framework, dependencies, and config automatically.
          </Step>
          <Step icon={<ArticleRoundedIcon />} title="3. Apply Changes">
            Confirm and apply the suggested migration plan.
          </Step>
          <Step icon={<VisibilityRoundedIcon />} title="4. Preview (10s Trial)">
            Test your converted project live with a limited-time preview.
          </Step>
          <Step icon={<DownloadRoundedIcon />} title="5. Download">
            Export your fully optimized project as a ZIP file.
          </Step>
        </Box>

        <Divider sx={{ borderColor: "rgba(255,255,255,.1)", mb: 6 }} />

        <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
          💡 Tips & Notes
        </Typography>
        <Typography sx={{ lineHeight: 1.8, mb: 3 }}>
          • The preview is one-time per project result. <br />
          • Larger projects may take a bit longer to apply. <br />
          • You can upgrade your plan anytime for unlimited previews and downloads.
        </Typography>

        <Button
          variant="contained"
          href="/"
          sx={{
            mt: 2,
            background: "linear-gradient(180deg,#7C4DFF 0%,#5F3BFF 100%)",
            fontWeight: 800,
            textTransform: "none",
            borderRadius: 2,
            px: 4,
            py: 1.5,
            boxShadow: "0 8px 30px rgba(124,77,255,.45)",
          }}
        >
          Back to MoFix
        </Button>
      </Container>
    </Box>
  );
}

function Step({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Box sx={{ color: "#7C4DFF" }}>{icon}</Box>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: "#A7B1C8" }}>
          {children}
        </Typography>
      </Box>
    </Box>
  );
}
