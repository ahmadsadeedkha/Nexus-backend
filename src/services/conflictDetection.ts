import { Types } from "mongoose";
import { Meeting, IMeeting } from "../models/Meeting";

interface ConflictCheckParams {
  participantIds: Types.ObjectId[] | string[];
  startTime: Date;
  endTime: Date;
  /** Exclude this meeting from the check (used when re-validating on accept) */
  excludeMeetingId?: string;
}

/**
 * Finds meetings that overlap the given time range for any of the given
 * participants. Only 'pending' and 'accepted' meetings block a slot —
 * rejected/cancelled meetings never conflict.
 *
 * Overlap rule: existing.start < new.end AND existing.end > new.start
 */
export async function findConflictingMeetings({
  participantIds,
  startTime,
  endTime,
  excludeMeetingId,
}: ConflictCheckParams): Promise<IMeeting[]> {
  const query: Record<string, unknown> = {
    $or: [
      { organizer: { $in: participantIds } },
      { participants: { $in: participantIds } },
    ],
    status: { $in: ["pending", "accepted"] },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };

  if (excludeMeetingId) {
    query._id = { $ne: excludeMeetingId };
  }

  return Meeting.find(query).populate(
    "organizer participants",
    "name email role",
  );
}

export async function hasConflict(
  params: ConflictCheckParams,
): Promise<boolean> {
  const conflicts = await findConflictingMeetings(params);
  return conflicts.length > 0;
}
