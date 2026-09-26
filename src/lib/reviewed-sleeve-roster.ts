import roster from "./reviewed-sleeve-roster.json";

/**
 * Reviewed sleeve packets that may rank. Idea metadata cannot add a row.
 * The rows live in reviewed-sleeve-roster.json so other systems can read the
 * roster without parsing code (Dustin Awe Capital V2 reads the file from
 * GitHub, read-only); a row still changes only through a reviewed commit.
 */
export const REVIEWED_SLEEVE_ROSTER = roster;
