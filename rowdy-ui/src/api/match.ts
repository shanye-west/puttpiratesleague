/**
 * Player-callable match endpoints (not admin-gated). Mirrors
 * functions/src/callables/matchSetupOps.ts.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import type {
  CreateCourseRequest,
  CreateCourseResult,
  SetupMatchCardRequest,
  SetupMatchCardResult,
} from "./adminContracts";

function call<Req, Res>(name: string) {
  return async (data: Req): Promise<Res> =>
    (await httpsCallable<Req, Res>(functions, name)(data)).data;
}

export const matchApi = {
  /** League: a participant (or admin) sets the course + course handicaps before scoring. */
  setupMatchCard: call<SetupMatchCardRequest, SetupMatchCardResult>("setupMatchCard"),
  /** League: any linked player adds a course (or new tees for one) so it can be picked. */
  createCourse: call<CreateCourseRequest, CreateCourseResult>("createCourse"),
};
