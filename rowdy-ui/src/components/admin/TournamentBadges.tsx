import { Badge } from "../ui/badge";
import type { TournamentDoc } from "../../types";

/** active / test / archived chips, shared by every admin view of a tournament. */
export default function TournamentBadges({ tournament }: { tournament: TournamentDoc }) {
  return (
    <>
      {tournament.active && <Badge variant="success">active</Badge>}
      {tournament.test && <Badge variant="warning">test</Badge>}
      {tournament.archived && <Badge variant="muted">archived</Badge>}
      {tournament.openPublicEdits && <Badge variant="info">public edits</Badge>}
    </>
  );
}
