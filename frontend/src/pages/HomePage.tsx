import { Link } from "react-router-dom";
import { ArrowRight, Bot, Clock3, KeyRound, MessagesSquare, Presentation, ShieldCheck, Users, VenetianMask } from "lucide-react";
import { lastRoom } from "../features/room/roomStorage";

export default function HomePage() {
  const previous = lastRoom();
  return (
    <main className="home">
      <section className="hero">
        <span className="eyebrow">WHOSE SIDE? · 역할 추리형 토론 수업</span>
        <h1>
          내 생각 대신
          <br />
          <span>역할로 먼저</span> 말해 보세요.
        </h1>
        <p className="lead">
          학생은 비밀 역할을 맡아 사회 문제에 대해 말하고, 질문하고, 반론해요. 그리고 숨은 <strong>역할 전환자</strong>가 누구인지 추리해요.
        </p>
        <div className="entry-cards">
          <Link to="/teacher/new" className="entry-card teacher">
            <Presentation size={28} aria-hidden />
            <strong>선생님</strong>
            <span>주제를 고르고 게임 방을 만들어요</span>
            <ArrowRight size={18} aria-hidden />
          </Link>
          <Link to="/join" className="entry-card student">
            <KeyRound size={28} aria-hidden />
            <strong>학생</strong>
            <span>방 코드나 QR로 입장해요</span>
            <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
        <Link to="/practice" className="practice-link" data-testid="practice-link">
          <Bot size={18} aria-hidden /> 서버 없이 혼자 연습해 보기 <ArrowRight size={16} aria-hidden />
        </Link>
        {previous && (
          <Link to={`/room/${previous.roomId}`} className="button ghost">
            진행 중인 게임으로 돌아가기 <ArrowRight size={16} />
          </Link>
        )}
      </section>
      <section className="facts">
        <div>
          <Users size={20} aria-hidden />
          <strong>6~8명</strong>
          <span>한 게임 · 역할 전환자 1~2명</span>
        </div>
        <div>
          <Clock3 size={20} aria-hidden />
          <strong>약 15분</strong>
          <span>단계별 시간은 선생님이 조절</span>
        </div>
        <div>
          <MessagesSquare size={20} aria-hidden />
          <strong>채팅만으로</strong>
          <span>음성·영상 없이 진행</span>
        </div>
        <div>
          <ShieldCheck size={20} aria-hidden />
          <strong>공개 전 점검</strong>
          <span>욕설·인신공격은 보내기 전에 수정 안내</span>
        </div>
      </section>
      <section className="flow">
        <h2>한 판의 흐름</h2>
        <ol>
          <li>
            <strong>역할 고르기</strong> 맡고 싶은 역할을 1·2순위로 골라요. 내 실제 생각을 밝히는 게 아니에요.
          </li>
          <li>
            <strong>비밀 역할</strong> 대부분은 고른 역할을, 역할 전환자는 고르지 않은 역할을 받아요.
          </li>
          <li>
            <strong>입장 발표 → 사건 → 반론</strong> 역할의 입장에서 말하고 질문·답변·반론을 주고받아요.
          </li>
          <li>
            <strong>투표와 공개</strong> <VenetianMask size={15} aria-hidden /> 역할 전환자를 추리해 투표하면 정체와 결과가 공개돼요.
          </li>
        </ol>
      </section>
      <footer>
        <span>팀 브릿지 · TECH FOR IMPACT 2026</span>
        <span>익명 세션으로 참여하며, 회원가입이 필요 없어요.</span>
      </footer>
    </main>
  );
}
