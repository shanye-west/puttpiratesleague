import { useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getPlayerName as getPlayerNameFromLookup,
  getPlayerShortName as getPlayerShortNameFromLookup,
  getPlayerFirstNameLastInitial as getPlayerPublicNameFromLookup,
} from "../../utils/playerHelpers";
import type { PlayerDoc } from "../../types";

/** Name formatters: logged-out (public) viewers see "First L." instead of full last names. */
export function useLeagueNames(players: Record<string, PlayerDoc>) {
  const { user } = useAuth();
  return useMemo(
    () => ({
      nameOf: (pid: string) => (user ? getPlayerNameFromLookup(pid, players) : getPlayerPublicNameFromLookup(pid, players)),
      shortNameOf: (pid: string) => (user ? getPlayerShortNameFromLookup(pid, players) : getPlayerPublicNameFromLookup(pid, players)),
    }),
    [user, players]
  );
}
