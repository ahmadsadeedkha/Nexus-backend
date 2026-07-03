import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Meeting } from "../models/Meeting";
import { findConflictingMeetings } from "../services/conflictDetection";
import { AuthRequest } from "../middleware/authMiddleware";

export const scheduleMeeting = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizerId = req.userId!;
    const {
      title,
      description,
      participants,
      startTime,
      endTime,
      location,
      meetingLink,
    } = req.body;

    if (
      !title ||
      !Array.isArray(participants) ||
      participants.length === 0 ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        status: "fail",
        message:
          "title, participants (array), startTime and endTime are required",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res
        .status(400)
        .json({ status: "fail", message: "Invalid date format" });
    }

    if (end <= start) {
      return res
        .status(400)
        .json({ status: "fail", message: "endTime must be after startTime" });
    }

    // Everyone involved (organizer + invitees) must be free for this slot
    const everyoneInvolved = [organizerId, ...participants];

    const conflicts = await findConflictingMeetings({
      participantIds: everyoneInvolved,
      startTime: start,
      endTime: end,
    });

    if (conflicts.length > 0) {
      return res.status(409).json({
        status: "fail",
        message:
          "One or more participants have a conflicting meeting at this time",
        conflicts: conflicts.map((c) => ({
          id: c.id,
          title: c.title,
          startTime: c.startTime,
          endTime: c.endTime,
        })),
      });
    }

    const meeting = await Meeting.create({
      title,
      description,
      organizer: organizerId,
      participants,
      startTime: start,
      endTime: end,
      location,
      meetingLink,
      status: "pending",
    });

    res.status(201).json({ status: "success", data: meeting });
  } catch (err) {
    next(err);
  }
};

/**
 * Shared handler for accept/reject — only an invited participant can respond,
 * and only while the meeting is still pending.
 */
const respondToMeeting =
  (targetStatus: "accepted" | "rejected") =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const userId = req.userId!;

      if (!Types.ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ status: "fail", message: "Invalid meeting id" });
      }

      const meeting = await Meeting.findById(id);

      if (!meeting) {
        return res
          .status(404)
          .json({ status: "fail", message: "Meeting not found" });
      }

      const isParticipant = meeting.participants.some(
        (p) => p.toString() === userId,
      );

      if (!isParticipant) {
        return res.status(403).json({
          status: "fail",
          message: "Only invited participants can respond to this meeting",
        });
      }

      if (meeting.status !== "pending") {
        return res.status(400).json({
          status: "fail",
          message: `Meeting has already been ${meeting.status}`,
        });
      }

      // Re-check conflicts at accept-time in case something else got booked
      // for this user since the invite was sent.
      if (targetStatus === "accepted") {
        const conflicts = await findConflictingMeetings({
          participantIds: [userId],
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          excludeMeetingId: meeting.id,
        });

        const blockingConflicts = conflicts.filter(
          (c) => c.status === "accepted",
        );

        if (blockingConflicts.length > 0) {
          return res.status(409).json({
            status: "fail",
            message:
              "You have an accepted meeting that conflicts with this time slot",
          });
        }
      }

      meeting.status = targetStatus;
      await meeting.save();

      res.status(200).json({ status: "success", data: meeting });
    } catch (err) {
      next(err);
    }
  };

export const acceptMeeting = respondToMeeting("accepted");
export const rejectMeeting = respondToMeeting("rejected");

export const cancelMeeting = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ status: "fail", message: "Invalid meeting id" });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res
        .status(404)
        .json({ status: "fail", message: "Meeting not found" });
    }

    if (meeting.organizer.toString() !== userId) {
      return res.status(403).json({
        status: "fail",
        message: "Only the organizer can cancel this meeting",
      });
    }

    meeting.status = "cancelled";
    await meeting.save();

    res.status(200).json({ status: "success", data: meeting });
  } catch (err) {
    next(err);
  }
};

export const getMyMeetings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.userId!;
    const { status, from, to } = req.query;

    const query: Record<string, unknown> = {
      $or: [{ organizer: userId }, { participants: userId }],
    };

    if (status) {
      query.status = status;
    }

    if (from || to) {
      query.startTime = {
        ...(from ? { $gte: new Date(from as string) } : {}),
        ...(to ? { $lte: new Date(to as string) } : {}),
      };
    }

    const meetings = await Meeting.find(query)
      .sort({ startTime: 1 })
      .populate("organizer participants", "name email role");

    res
      .status(200)
      .json({ status: "success", results: meetings.length, data: meetings });
  } catch (err) {
    next(err);
  }
};

export const getMeetingById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = req.params.id as string;

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ status: "fail", message: "Invalid meeting id" });
    }

    const meeting = await Meeting.findById(id).populate(
      "organizer participants",
      "name email role",
    );

    if (!meeting) {
      return res
        .status(404)
        .json({ status: "fail", message: "Meeting not found" });
    }

    res.status(200).json({ status: "success", data: meeting });
  } catch (err) {
    next(err);
  }
};

/**
 * Returns meetings already shaped for calendar libraries like FullCalendar
 * or react-big-calendar — { id, title, start, end, ... }.
 * Only pending/accepted meetings are included (rejected/cancelled are hidden).
 */
export const getCalendarFeed = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.userId!;
    const { from, to } = req.query;

    const query: Record<string, unknown> = {
      $or: [{ organizer: userId }, { participants: userId }],
      status: { $in: ["pending", "accepted"] },
    };

    if (from || to) {
      query.startTime = {
        ...(from ? { $gte: new Date(from as string) } : {}),
        ...(to ? { $lte: new Date(to as string) } : {}),
      };
    }

    const meetings = await Meeting.find(query).populate(
      "organizer participants",
      "name email role",
    );

    const events = meetings.map((m) => ({
      id: m.id,
      title: m.title,
      start: m.startTime,
      end: m.endTime,
      status: m.status,
      allDay: false,
      extendedProps: {
        description: m.description,
        location: m.location,
        meetingLink: m.meetingLink,
        organizer: m.organizer,
        participants: m.participants,
      },
    }));

    res
      .status(200)
      .json({ status: "success", results: events.length, data: events });
  } catch (err) {
    next(err);
  }
};
