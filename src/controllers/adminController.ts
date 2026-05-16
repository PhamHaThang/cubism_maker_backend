import { Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Level } from "../models/Level.js";
import { Favorite } from "../models/Favorite.js";

const escapeRegex = (text: string): string => {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

const normalizePage = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
};

const parseLevelStatus = (value: unknown): "public" | "private" | null => {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    if (value === "public" || value === "private") {
        return value;
    }
    if (value === "publish") return "public";
    return null;
};

export const listUsers = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const pageNum = normalizePage(req.query.page, 1);
        const limitNum = Math.min(50, normalizePage(req.query.limit, 12));
        const search = String(req.query.search || "").trim();

        const filter: Record<string, unknown> = {};
        if (search) {
            const regex = new RegExp(escapeRegex(search), "i");
            filter.$or = [{ username: regex }, { email: regex }];
        }

        const [users, total] = await Promise.all([
            User.find(filter)
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .select("username email isAdmin isBanned createdAt")
                .lean(),
            User.countDocuments(filter),
        ]);

        res.json({
            users,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("ListUsers error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const getUserDetail = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const user = await User.findById(req.params.userId)
            .select("username email isAdmin isBanned createdAt")
            .lean();

        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const [
            totalLevels,
            publicLevels,
            pendingLevels,
            rejectedLevels,
            favorites,
        ] = await Promise.all([
            Level.countDocuments({ author: user._id }),
            Level.countDocuments({ author: user._id, status: "public" }),
            Level.countDocuments({ author: user._id, reviewStatus: "pending" }),
            Level.countDocuments({
                author: user._id,
                reviewStatus: "rejected",
            }),
            Favorite.countDocuments({ user: user._id }),
        ]);

        res.json({
            user,
            stats: {
                totalLevels,
                publicLevels,
                pendingLevels,
                rejectedLevels,
                favorites,
            },
        });
    } catch (error) {
        console.error("GetUserDetail error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const updateUserStatus = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const { isBanned } = req.body;
        if (typeof isBanned !== "boolean") {
            res.status(400).json({ message: "isBanned must be boolean" });
            return;
        }

        const targetId = String(req.params.userId || "");
        if (req.userId === targetId && isBanned) {
            res.status(400).json({ message: "Cannot ban your own account" });
            return;
        }

        const user = await User.findById(targetId);
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        if (user.isAdmin && isBanned) {
            res.status(400).json({ message: "Cannot ban an admin account" });
            return;
        }

        user.isBanned = isBanned;
        await user.save();

        res.json({
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin,
                isBanned: user.isBanned,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error("UpdateUserStatus error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const deleteUser = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const targetId = String(req.params.userId || "");
        if (req.userId === targetId) {
            res.status(400).json({ message: "Cannot delete your own account" });
            return;
        }

        const user = await User.findById(targetId);
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        if (user.isAdmin) {
            res.status(400).json({ message: "Cannot delete an admin account" });
            return;
        }

        const authoredLevels = await Level.find({ author: user._id })
            .select("_id")
            .lean();
        const levelIds = authoredLevels.map((level) => level._id);

        if (levelIds.length > 0) {
            await Favorite.deleteMany({ level: { $in: levelIds } });
        }
        await Favorite.deleteMany({ user: user._id });
        await Level.deleteMany({ author: user._id });
        await User.deleteOne({ _id: user._id });

        res.json({ message: "User deleted" });
    } catch (error) {
        console.error("DeleteUser error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const listReviewLevels = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const pageNum = normalizePage(req.query.page, 1);
        const limitNum = Math.min(50, normalizePage(req.query.limit, 12));
        const status = String(req.query.status || "pending").trim();
        const search = String(req.query.search || "").trim();

        const adminUsers = await User.find({ isAdmin: true })
            .select("_id")
            .lean();
        const adminIds = adminUsers.map((admin) => admin._id);

        const filter: Record<string, unknown> = {
            author: { $nin: adminIds },
        };

        if (status === "all") {
            filter.reviewStatus = {
                $in: ["pending", "approved", "rejected"],
            };
        } else if (status === "approved") {
            filter.reviewStatus = { $in: ["approved"] };
        } else if (["pending", "rejected"].includes(status)) {
            filter.reviewStatus = status;
        } else {
            res.status(400).json({ message: "Invalid review status" });
            return;
        }

        if (search) {
            const regex = new RegExp(escapeRegex(search), "i");
            filter.$or = [{ "meta.name": regex }, { code: regex }];
        }

        const [levels, total] = await Promise.all([
            Level.find(filter)
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate("author", "username isAdmin")
                .lean(),
            Level.countDocuments(filter),
        ]);

        res.json({
            levels,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("ListReviewLevels error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const reviewLevel = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const reviewStatus = String(req.body.reviewStatus || "").trim();
        if (!["approved", "rejected"].includes(reviewStatus)) {
            res.status(400).json({
                message: "reviewStatus must be approved or rejected",
            });
            return;
        }

        const level = await Level.findById(req.params.levelId);
        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        level.reviewStatus = reviewStatus as "approved" | "rejected";
        level.reviewedAt = new Date();
        level.reviewedBy = req.userId;
        await level.save();

        const populatedLevel = await Level.findById(level._id)
            .populate("author", "username isAdmin")
            .lean();

        res.json({ level: populatedLevel });
    } catch (error) {
        console.error("ReviewLevel error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const listAllLevels = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const pageNum = normalizePage(req.query.page, 1);
        const limitNum = Math.min(50, normalizePage(req.query.limit, 12));
        const search = String(req.query.search || "").trim();
        const status = String(req.query.status || "all").trim();
        const reviewStatus = String(req.query.reviewStatus || "all").trim();
        const difficulty = String(req.query.difficulty || "all").trim();
        const isMainMenu = String(req.query.isMainMenu || "all").trim();

        const filter: Record<string, unknown> = {};

        if (search) {
            const regex = new RegExp(escapeRegex(search), "i");
            filter.$or = [{ "meta.name": regex }, { code: regex }];
        }

        if (status !== "all") {
            const parsedStatus = parseLevelStatus(status);
            if (!parsedStatus) {
                res.status(400).json({
                    message: "status must be public or private",
                });
                return;
            }
            filter.status = parsedStatus;
        }

        if (reviewStatus !== "all") {
            const allowed = ["approved", "pending", "rejected"];
            if (!allowed.includes(reviewStatus)) {
                res.status(400).json({
                    message:
                        "reviewStatus must be approved, pending, or rejected",
                });
                return;
            }
            filter.reviewStatus = reviewStatus;
        }

        if (difficulty !== "all") {
            filter["meta.difficulty"] = difficulty;
        }

        if (isMainMenu !== "all") {
            filter.isMainMenu = isMainMenu === "true";
        }

        const [levels, total] = await Promise.all([
            Level.find(filter)
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate("author", "username isAdmin")
                .lean(),
            Level.countDocuments(filter),
        ]);

        res.json({
            levels,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("ListAllLevels error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const deleteLevelAdmin = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const level = await Level.findById(req.params.levelId);
        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        await Favorite.deleteMany({ level: level._id });
        await level.deleteOne();
        res.json({ message: "Level deleted" });
    } catch (error) {
        console.error("DeleteLevelAdmin error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const updateLevelAdmin = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const level = await Level.findById(req.params.levelId);
        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        const {
            name,
            difficulty,
            timeLimitSeconds,
            status,
            reviewStatus,
        } = req.body;

        if (status !== undefined) {
            const parsedStatus = parseLevelStatus(status);
            if (!parsedStatus) {
                res.status(400).json({
                    message: "status must be public or private",
                });
                return;
            }
            level.status = parsedStatus;
        }

        if (reviewStatus !== undefined) {
            const allowed = ["approved", "pending", "rejected"];
            if (!allowed.includes(String(reviewStatus))) {
                res.status(400).json({
                    message:
                        "reviewStatus must be approved, pending, or rejected",
                });
                return;
            }
            const nextReviewStatus = String(reviewStatus) as
                | "approved"
                | "pending"
                | "rejected";
            level.reviewStatus = nextReviewStatus;
            if (nextReviewStatus === "pending") {
                level.reviewedAt = undefined;
                level.reviewedBy = undefined;
            } else {
                level.reviewedAt = new Date();
                level.reviewedBy = req.userId;
            }
        }

        if (name !== undefined) {
            level.meta.name = String(name).trim() || level.meta.name;
        }

        if (difficulty !== undefined) {
            level.meta.difficulty = String(difficulty) as any;
        }

        if (timeLimitSeconds !== undefined) {
            const parsedTimeSeconds = Number(timeLimitSeconds);
            if (
                Number.isNaN(parsedTimeSeconds) ||
                parsedTimeSeconds < 0 ||
                !Number.isFinite(parsedTimeSeconds)
            ) {
                res.status(400).json({
                    message: "timeLimitSeconds must be a non-negative number",
                });
                return;
            }
            level.meta.timeLimitSeconds = Math.floor(parsedTimeSeconds);
        }

        await level.save();

        const populatedLevel = await Level.findById(level._id)
            .populate("author", "username isAdmin")
            .lean();

        res.json({ level: populatedLevel });
    } catch (error) {
        console.error("UpdateLevelAdmin error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
