import { useCallback, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type { CourseDoc } from "../types";

function byName(a: CourseDoc, b: CourseDoc): number {
  return (a.name ?? a.id).localeCompare(b.name ?? b.id) || (a.tees ?? "").localeCompare(b.tees ?? "");
}

/**
 * One-time list of every course (for the league "Set up match" course picker).
 * Courses change rarely; a plain getDocs (cache-or-server) is enough and holds
 * no listener. Sorted by name, then tees. `addCourse` slots a course the
 * viewer just created into the list without a refetch.
 */
export function useCourses(enabled = true): {
  courses: CourseDoc[];
  loading: boolean;
  error: string | null;
  addCourse: (course: CourseDoc) => void;
} {
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
            .sort(byName)
        );
      })
      .catch((err) => {
        console.error("Courses fetch error:", err);
        if (!cancelled) setError("Unable to load courses.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  const addCourse = useCallback((course: CourseDoc) => {
    setCourses((prev) => [...prev.filter((c) => c.id !== course.id), course].sort(byName));
  }, []);

  return { courses, loading, error, addCourse };
}
