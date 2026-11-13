import { useEffect, useState } from "react";
import { subscribeTeacherStorage } from "./teacherStorage";

export function useTeacherStorage<T>(key: string, load: (key: string) => T) {
  const [value, setValue] = useState(() => load(key));
  useEffect(() => {
    const refresh = () => {
      const next = load(key);
      setValue((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    refresh();
    return subscribeTeacherStorage(refresh);
  }, [key, load]);
  return [value, setValue] as const;
}
