/**
 * Player-callable course creation (Putt Pirates league).
 *
 * There is no fixed course list: each month's opponents agree on a course and
 * tees, so any linked player can add a course (or a new set of tees for an
 * existing course — each `courses/{id}` doc is one course+tees combination)
 * straight from the match setup panel. Once created it is selectable by
 * everyone. Courses are written whole through the same validator the admin
 * `upsertCourse` uses, so the 18-hole invariants always hold.
 *
 * Editing/deleting stays admin-only (`courseOps.ts`).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requirePlayer } from "../helpers/adminAuth.js";
import { courseKey, validateCourseInput } from "../helpers/adminValidation.js";

function db() {
  return getFirestore();
}

/**
 * Data payload: name, tees?, par, rating, slope, holes[18] (see CreateCourseRequest).
 * Rejects an exact duplicate name+tees so the list doesn't fill with copies.
 */
export const createCourse = onCall(async (request) => {
  const { playerId } = await requirePlayer(request, "createCourse", { maxCalls: 10, windowSeconds: 60 });

  const validation = validateCourseInput(request.data ?? {});
  if (!validation.ok || !validation.course) {
    throw new HttpsError("invalid-argument", validation.errors.join("; "));
  }
  const course = validation.course;

  const key = courseKey(course.name, course.tees);
  const existing = await db().collection("courses").get();
  const dupe = existing.docs.find((d) => courseKey(d.data().name, d.data().tees) === key);
  if (dupe) {
    throw new HttpsError(
      "already-exists",
      `${course.name}${course.tees ? ` (${course.tees})` : ""} is already in the list — pick it from the dropdown.`
    );
  }

  const ref = db().collection("courses").doc();
  await ref.set({
    ...course,
    _createdBy: playerId,
    _createdAt: FieldValue.serverTimestamp(),
  });

  return { success: true, courseId: ref.id, created: true };
});
