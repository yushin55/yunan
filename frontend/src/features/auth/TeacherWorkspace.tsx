import { useEffect, useState, type ReactNode } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { activateTeacherStorage, replaceTeacherRecords, type TeacherRecord } from "../teacher/teacherStorage";

/** Children mount only after this account's private records have loaded. */
export default function TeacherWorkspace({ uid, children }: { uid: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    setPending(0);
    const records = collection(db, "teachers", uid, "records");
    const deactivate = activateTeacherStorage(uid, (key, field, value) => {
      if (!active || auth.currentUser?.uid !== uid) return;
      const ref = doc(records, encodeURIComponent(key));
      setPending((count) => count + 1);
      setError("");
      const data = field === "debate"
        ? { key, debate: value, notes: (value as TeacherRecord["debate"])!.notes }
        : { key, [field]: value };
      // Replace each whole field, so removing a note or rubric correction stays removed.
      const operation = field === "delete" ? deleteDoc(ref) : setDoc(ref,
        JSON.parse(JSON.stringify(data)), { mergeFields: Object.keys(data) });
      void operation.catch(() => {
        if (active) setError("변경 내용을 계정에 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.");
      }).finally(() => { if (active) setPending((count) => count - 1); });
    });
    const unsubscribe = onSnapshot(records, (snapshot) => {
      if (!active || auth.currentUser?.uid !== uid) return;
      replaceTeacherRecords(snapshot.docs.map((record) => record.data() as TeacherRecord));
      setReady(true);
    }, () => {
      if (active) setError("선생님 계정의 기록을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.");
    });
    return () => { active = false; unsubscribe(); deactivate(); };
  }, [uid, attempt]);

  if (!ready) return <main className="page-loading">{error || "내 토론 기록을 불러오는 중이에요."}{error && <button className="button" onClick={() => setAttempt((value) => value + 1)}>다시 시도</button>}</main>;
  return <div className="teacher-workspace">{error ? <p className="teacher-sync error-box" role="alert">{error}</p> : pending > 0 && <p className="teacher-sync muted small" role="status">계정에 저장하는 중이에요…</p>}{children}</div>;
}
