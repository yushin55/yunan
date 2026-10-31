import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { lastRoom } from "../features/room/roomStorage";
import type { TablePlayer } from "../components/scene/TableScene";

const TableScene = lazy(() => import("../components/scene/TableScene"));

// Six silent players around the table behind the title.
const SEATED: TablePlayer[] = ["하늘", "도윤", "서연", "지우", "민준", "유나"].map((nickname, i) => ({
  uid: `title-${i}`,
  nickname,
  color: ["#c98d66", "#aaad83", "#a2b3cf", "#86ad98", "#b09bbf", "#d9b263"][i],
}));

/** A game title screen: the table in the dark, the logo, and a short menu to step in. */
export default function HomePage() {
  const previous = lastRoom();
  const narrow = typeof window !== "undefined" && window.innerWidth < 700;
  return (
    <main className="title-screen">
      <div className="title-scene" aria-hidden>
        <Suspense fallback={null}>
          <TableScene players={SEATED} attract quality={narrow ? "low" : "high"} />
        </Suspense>
      </div>
      <div className="title-shade" aria-hidden />

      <div className="title-content">
        <div className="title-logo">
          <span className="title-sup">BRIDGE</span>
          <h1>
            WHOSE <span>SIDE?</span>
          </h1>
          <p className="title-tease">이 테이블의 누군가는, 자기 역할이 아니다.</p>
        </div>

        <nav className="title-menu" aria-label="게임 메뉴">
          {previous && (
            <Link to={`/room/${previous.roomId}`} className="menu-item resume">
              <span className="menu-label">이어하기</span>
              <span className="menu-sub">진행 중인 게임으로</span>
            </Link>
          )}
          <Link to="/teacher/new" className="menu-item primary">
            <span className="menu-label">방 만들기</span>
            <span className="menu-sub">선생님</span>
          </Link>
          <Link to="/join" className="menu-item">
            <span className="menu-label">방 코드로 입장</span>
            <span className="menu-sub">학생</span>
          </Link>
          <Link to="/practice" className="menu-item" data-testid="practice-link">
            <span className="menu-label">혼자 연습하기</span>
            <span className="menu-sub">컴퓨터와 한 판</span>
          </Link>
        </nav>
      </div>

      <footer className="title-footer">
        <span>6–8명 · 약 15분 · 회원가입 없음</span>
        <span>팀 브릿지 · TECH FOR IMPACT 2026</span>
      </footer>
    </main>
  );
}
