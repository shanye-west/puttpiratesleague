import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type { CourseDoc } from "../types";

/**
 * One-time list of every course (for the league "Set up match" course picker).
 * Courses are static; a plain getDocs (cache-or-server) is enough and holds no
 * listener. Sorted by name.
 */
export function useCourses(enabled = true): { courses: CourseDoc[]; loading: boolean; error: string | null } {
  const [courses, setCourses] = useState<CourseDoc[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    getDocs(collection(db, "courses"))
      .then((snap) => {
        if (cancelled) return;
        setCourses(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as CourseDoc))
            .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
        );
      })
      .catch((err) => {
        console.error("Courses fetch error:", err);
        if (!cancelled) setError("Unable to load courses.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  return { courses, loading, error };
}
