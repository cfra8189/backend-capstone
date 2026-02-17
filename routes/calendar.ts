import express from "express";
import { CalendarEvent, Project } from "../shared/models/mongoose";

const router = express.Router();

// GET all events for a user (merged with project dates)
router.get("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        // 1. Fetch CalendarEvents
        const events = await CalendarEvent.find({ userId: req.user._id });

        // 2. Fetch Projects with dates
        const projects = await Project.find({ userId: req.user._id });

        // 3. Convert project dates to "Milestone" events for the UI
        const projectMilestones = projects.flatMap(p => {
            const milestones = [];
            if (p.startDate) milestones.push({
                _id: `proj-${p._id}-start`,
                title: `${p.title} (Start)`,
                date: p.startDate,
                type: "milestone",
                status: "pending",
                projectId: p._id
            });
            if (p.deadline) milestones.push({
                _id: `proj-${p._id}-deadline`,
                title: `${p.title} (Deadline)`,
                date: p.deadline,
                type: "deadline",
                status: "pending",
                projectId: p._id
            });
            if (p.releaseDate) milestones.push({
                _id: `proj-${p._id}-release`,
                title: `${p.title} (Release)`,
                date: p.releaseDate,
                type: "milestone",
                status: "pending",
                projectId: p._id
            });
            if (p.registrationDate) milestones.push({
                _id: `proj-${p._id}-reg`,
                title: `${p.title} (Registration)`,
                date: p.registrationDate,
                type: "milestone",
                status: "completed",
                projectId: p._id
            });
            return milestones;
        });

        res.json({ events, milestones: projectMilestones });
    } catch (error) {
        console.error("Error fetching calendar:", error);
        res.status(500).json({ message: "Failed to fetch calendar" });
    }
});

// POST create event
router.post("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const event = new CalendarEvent({
            ...req.body,
            userId: req.user._id
        });
        await event.save();
        res.json(event);
    } catch (error) {
        res.status(500).json({ message: "Failed to create event" });
    }
});

// PUT update event
router.put("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
        const event = await CalendarEvent.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            req.body,
            { new: true }
        );
        if (!event) return res.status(404).json({ message: "Event not found" });
        res.json(event);
    } catch (error) {
        res.status(500).json({ message: "Failed to update event" });
    }
});

// DELETE event
router.delete("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
        await CalendarEvent.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        res.json({ message: "Deleted" });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete event" });
    }
});

export default router;
