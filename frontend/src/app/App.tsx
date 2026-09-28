import { Suspense, lazy } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Header from "../components/layout/Header";
import HomePage from "../pages/HomePage";
const ImmersiveRoomPage = lazy(() => import("../pages/ImmersiveRoomPage"));
export default function App() {
  const { pathname } = useLocation();
  const inGame = pathname === "/practice" || pathname.startsWith("/room/");
  return (
    <>
      {!inGame && <Header />}
      <Suspense
        fallback={
          <div className="page-loading">
            <span className="spinner" />
            테이블로 이동하고 있어요.
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/join" element={<HomePage join />} />
          <Route path="/room/:roomId" element={<ImmersiveRoomPage />} />
          <Route path="/practice" element={<ImmersiveRoomPage practice />} />
          <Route
            path="*"
            element={
              <main className="page-loading">
                존재하지 않는 테이블이에요. <a href="/">홈으로 이동</a>
              </main>
            }
          />
        </Routes>
      </Suspense>
    </>
  );
}
