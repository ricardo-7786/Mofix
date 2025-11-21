// apps/web/src/components/ReviewModal.tsx
import * as React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Stack, Typography, IconButton, Button, Rating, TextField
} from '@mui/material';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

// 🔹 App.tsx 에서 쓰는 스낵 타입
export type ReviewSnack = {
  open: boolean;
  msg: string;
  severity?: 'success' | 'info' | 'warning' | 'error';
};

export type ReviewModalProps = {
  open: boolean;
  resultId: string | null;

  /** 닫기(X) */
  onClose: () => void;

  /** Later 전용 핸들러 (있으면 사용, 없으면 onClose 사용) */
  onLater?: () => void;

  /** 제출 버튼 또는 Cmd/Ctrl+Enter */
  onSubmit: () => void;

  /** 제출 진행 중 스피너/비활성 처리 */
  submitting?: boolean;

  /** 상태(부모 보유) 바인딩 */
  rating: number | null;
  setRating: (v: number | null) => void;

  comment: string;
  setComment: (s: string) => void;

  // 🔹 App.tsx 에서 넘기는 setSnack (선택)
  setSnack?: (s: ReviewSnack) => void;
};

export default function ReviewModal({
  open,
  resultId,
  onClose,
  onLater,
  onSubmit,
  submitting = false,
  rating,
  setRating,
  comment,
  setComment,
}: ReviewModalProps) {

  // ⌘/Ctrl + Enter로 제출
  const onReviewKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !submitting) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleLater = () => {
    if (onLater) onLater();
    else onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          bgcolor: 'rgba(14,20,36,.92)',
          backdropFilter: 'blur(8px)',
          color: '#E6EAF7',
          borderRadius: 3,
          border: '1px solid rgba(148,163,184,.18)',
          boxShadow: '0 30px 120px rgba(0,0,0,.60), 0 0 0 1px rgba(124,77,255,.22) inset',
        },
      }}
    >
      {/* 헤더 */}
      <DialogTitle sx={{ pb: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '999px',
              background: 'linear-gradient(180deg,#7C4DFF 0%, #5F3BFF 100%)',
              boxShadow: '0 0 0 1px rgba(124,77,255,.35) inset',
              display: 'grid',
              placeItems: 'center',
              mr: .5,
            }}
          >
            <StarRoundedIcon sx={{ fontSize: 18 }} />
          </Box>

          <Box>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: .2 }}>
              How was your MoFix result?
            </Typography>
            <Typography variant="body2" sx={{ opacity: .75 }}>
              Please leave a short feedback
              {resultId ? ` (${resultId.slice(0, 8)}…)` : ''}.
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }} />
          <IconButton onClick={onClose} size="small" sx={{ color: '#A9B6D9' }} aria-label="close review modal">
            <CloseRoundedIcon />
          </IconButton>
        </Stack>

        {/* 얇은 그라데이션 구분선 */}
        <Box
          sx={{
            mt: 1.5,
            height: 1,
            background: 'linear-gradient(90deg, rgba(124,77,255,.0), rgba(124,77,255,.35), rgba(124,77,255,.0))',
          }}
        />
      </DialogTitle>

      {/* 본문 */}
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={2.25} sx={{ mt: .25 }}>
          <Typography variant="body2" sx={{ opacity: .8, fontWeight: 600 }}>
            Overall rating
          </Typography>

          <Rating
            value={rating}
            onChange={(_e, v) => setRating(v)}
            precision={1}
            size="large"
            sx={{
              '& .MuiRating-iconFilled': { color: '#FFD66B' },
              '& .MuiRating-iconEmpty': { color: 'rgba(255,255,255,.24)' },
              '& .MuiRating-iconHover': { transform: 'scale(1.08)' },
              transition: 'transform .08s ease',
            }}
          />

          <TextField
            label="Optional comment"
            placeholder="What worked well? What could be improved?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={onReviewKeyDown}
            multiline
            minRows={4}
            fullWidth
            variant="outlined"
            InputProps={{
              sx: {
                bgcolor: 'rgba(11,17,29,.7)',
                color: '#E6EAF7',
                borderRadius: 2,
                '& fieldset': { borderColor: 'rgba(148,163,184,.28)' },
                '&:hover fieldset': { borderColor: 'rgba(148,163,184,.45)' },
                '&.Mui-focused fieldset': {
                  borderColor: 'rgba(124,77,255,.65)',
                  boxShadow: '0 0 0 3px rgba(124,77,255,.15)',
                },
              },
            }}
            inputProps={{ maxLength: 1000 }}
          />

          {/* 힌트/카운터 */}
          <Stack direction="row" alignItems="center">
            <Typography variant="caption" sx={{ opacity: .65 }}>
              Press <b>⌘/Ctrl + Enter</b> to submit
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" sx={{ opacity: .55 }}>
              {comment.length}/1000
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>

      {/* 풋터 */}
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleLater} sx={{ color: '#BFD0FF', textTransform: 'none' }}>
          Later
        </Button>

        <Button
          variant="contained"
          disabled={!rating || submitting}
          onClick={onSubmit}
          sx={{
            textTransform: 'none',
            fontWeight: 900,
            borderRadius: 2,
            px: 2.5,
            color: '#fff', // ✅ 텍스트 선명
            background: 'linear-gradient(180deg,#7C4DFF 0%,#5F3BFF 100%)',
            boxShadow: '0 8px 28px rgba(124,77,255,.45), 0 0 0 1px rgba(124,77,255,.35) inset',
            '&:hover': {
              background: 'linear-gradient(180deg,#8758ff 0%,#6644ff 100%)',
            },
            // ✅ 비활성에도 텍스트 흐릿해지지 않게
            '&.Mui-disabled': {
              color: '#F5F6FF',
              opacity: 1,
              background: 'linear-gradient(180deg, rgba(124,77,255,.35) 0%, rgba(95,59,255,.35) 100%)',
              boxShadow: '0 0 0 1px rgba(124,77,255,.25) inset',
            },
          }}
        >
          {submitting ? 'Submitting…' : 'Submit Review'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
