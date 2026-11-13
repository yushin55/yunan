import { lazy, Suspense, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import PageNavigation from "../components/PageNavigation";
import HomePage from "../pages/HomePage";
import PracticePage from "../pages/PracticePage";

// Pages that sign in to Firebase load on demand, so the home page and the offline
// practice mode never start a Firebase connection.
const JoinPage = lazy(() => import("../pages/JoinPage"));
const RoomPage = lazy(() => import("../pages/RoomPage"));
const TeacherNewPage = lazy(() => import("../pages/TeacherNewPage"));
const DebateHistoryPage = lazy(() => import("../pages/DebateHistoryPage"));
const DebateResultPage = lazy(() => import("../pages/DebateResultPage"));
const KakaoCallbackPage = lazy(() => import("../pages/KakaoCallbackPage"));
// Only teachers sign in (Google or Kakao); students join anonymously with a room code.
const TeacherGate = lazy(() => import("../features/auth/TeacherGate"));
const teacherOnly = (page: ReactNode) => <TeacherGate>{page}</TeacherGate>;

export default function App() {
  const { pathname } = useLocation();
  return (
    <div className={`app-shell${pathname !== "/" ? " with-navigation" : ""}`}>
      <PageNavigation />
      <Suspense
        fallback={
          <main className="page-loading">
            <span className="spinner" /> 불러오는 중이에요.
          </main>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/teacher" element={<Navigate to="/teacher/new" replace />} />
          <Route path="/teacher/new" element={teacherOnly(<TeacherNewPage />)} />
          <Route path="/teacher/history" element={teacherOnly(<DebateHistoryPage />)} />
          <Route path="/teacher/history/:key" element={teacherOnly(<DebateResultPage />)} />
          <Route path="/auth/kakao" element={<KakaoCallbackPage />} />
          {/* The local practice engine, with the teacher's account and private records. */}
          <Route path="/teacher/preview" element={teacherOnly(<PracticePage teacherPreview />)} />
          <Route path="/teacher/preview/:phase" element={teacherOnly(<PracticePage teacherPreview />)} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route
            path="*"
            element={
              <main className="page-loading">
                존재하지 않는 페이지예요. <Link to="/">처음으로</Link>
              </main>
            }
          />
        </Routes>
      </Suspense>
    </div>
  );
}
