import { ArrowLeft, House } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

/** Keep an exit available on setup, live games, and full-screen practice steps. */
export default function PageNavigation() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname === "/") return null;

  const back = () => {
    // A direct link or QR entry has no previous page inside this app.
    if (typeof window.history.state?.idx === "number" && window.history.state.idx > 0) navigate(-1);
    else navigate("/");
  };

  return (
    <nav className="page-navigation" aria-label="페이지 이동">
      <button type="button" className="button ghost small" onClick={back}>
        <ArrowLeft size={16} aria-hidden /> 뒤로가기
      </button>
      <Link to="/" className="button ghost small">
        <House size={16} aria-hidden /> 처음으로
      </Link>
    </nav>
  );
}
