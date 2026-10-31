import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import HomePage from "../pages/HomePage";
import PracticePage from "../pages/PracticePage";

// Pages that sign in to Firebase load on demand, so the home page and the offline
// practice mode never start a Firebase connection.
const JoinPage = lazy(() => import("../pages/JoinPage"));
const RoomPage = lazy(() => import("../pages/RoomPage"));
const TeacherNewPage = lazy(() => import("../pages/TeacherNewPage"));

export default function App() {
  return (
    <Suspense
      fallback={
        <main className="page-loading">
          <span className="spinner" /> 불러오는 중이에요.
        </main>
      }
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/teacher/new" element={<TeacherNewPage />} />
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
  );
}
