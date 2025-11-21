import { Button } from "@mui/material";
import { auth } from "../firebase"; // firebase.ts 위치에 따라 경로 조정 (예: ../../firebase 일 수도 있음)

export default function GetTokenButton() {
  const handleClick = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("로그인 후 다시 시도하세요 (익명 로그인도 가능)");
      return;
    }
    const token = await user.getIdToken();
    console.log("🔥 Firebase ID Token:", token);
    alert("콘솔에 ID Token이 출력되었습니다!");
  };

  return (
    <Button
      variant="contained"
      color="primary"
      onClick={handleClick}
      sx={{ mt: 2 }}
    >
      Get ID Token
    </Button>
  );
}
