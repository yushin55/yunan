import { Link, useParams } from "react-router-dom";
import { useRoom } from "../features/room/useRoom";
import StudentRoomPage from "./StudentRoomPage";
import TeacherRoomPage from "./TeacherRoomPage";

export default function RoomPage() {
  const { roomId = "" } = useParams();
  const room = useRoom(roomId);
  if (room.status === "loading")
    return (
      <main className="page-loading">
        <span className="spinner" /> 게임에 연결하고 있어요.
      </main>
    );
  if (room.status === "not-member")
    return (
      <main className="page-loading">
        <p>이 기기는 아직 이 게임의 참가자가 아니에요.</p>
        <Link to="/join" className="button primary">
          방 코드로 입장하기
        </Link>
      </main>
    );
  if (room.status === "removed")
    return (
      <main className="page-loading">
        <p>이 게임에서 나오게 되었어요. 궁금한 점은 선생님께 물어봐 주세요.</p>
        <Link to="/" className="button ghost">
          처음으로
        </Link>
      </main>
    );
  if (room.status === "error" || !room.state)
    return (
      <main className="page-loading">
        <p className="error-box">{room.error || "게임을 불러오지 못했어요."}</p>
        <button className="button primary" onClick={() => location.reload()}>
          다시 시도
        </button>
      </main>
    );
  return room.state.viewer === "host" ? <TeacherRoomPage api={room} /> : <StudentRoomPage api={room} />;
}
