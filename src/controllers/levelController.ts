import { Request, Response } from "express";
import { Level } from "../models/Level.js";
import { Favorite } from "../models/Favorite.js";
import { AuthRequest } from "../middleware/auth.js";

const generateCode = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

const generateId = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    for (let i = 0; i < 16; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
};

const getCodeParam = (req: Request): string => {
    const rawCode = req.params.code;
    const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    return String(code || "").toUpperCase();
};

export const getLevels = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            page = 1,
            limit = 12,
            difficulty,
            search,
            sort = "newest",
        } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);

        const filter: Record<string, unknown> = {};
        if (difficulty && difficulty !== "all")
            filter["meta.difficulty"] = difficulty;
        if (search) filter["meta.name"] = { $regex: search, $options: "i" };

        let sortObj: Record<string, 1 | -1> = { publishedAt: -1 };
        if (sort === "popular") sortObj = { downloads: -1 };
        if (sort === "favorites") sortObj = { favorites: -1 };
        if (sort === "oldest") sortObj = { publishedAt: 1 };

        const [levels, total] = await Promise.all([
            Level.find(filter)
                .sort(sortObj)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate("author", "username")
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
        console.error("GetLevels error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const getLevelByCode = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const level = await Level.findOne({
            code: getCodeParam(req),
        }).populate("author", "username");

        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        res.json({ level });
    } catch (error) {
        console.error("GetLevelByCode error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const createLevel = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        // Accept both full meta payload and simplified {name, description, difficulty, blueprint}
        let meta = req.body.meta;
        let grid = req.body.grid;
        let pieces = req.body.pieces;
        const thumbnailData = req.body.thumbnailData;

        // Simplified payload from browser editor
        if (!meta && req.body.name) {
            const {
                name,
                description,
                difficulty = "medium",
                timeSeconds = 0,
                blueprint,
            } = req.body;
            if (!blueprint?.grid || !blueprint?.pieces) {
                res.status(400).json({
                    message: "blueprint.grid and blueprint.pieces are required",
                });
                return;
            }

            const parsedTimeSeconds = Number(timeSeconds);
            if (
                Number.isNaN(parsedTimeSeconds) ||
                parsedTimeSeconds < 0 ||
                !Number.isFinite(parsedTimeSeconds)
            ) {
                res.status(400).json({
                    message: "timeSeconds must be a non-negative number",
                });
                return;
            }

            grid = blueprint.grid;
            pieces = blueprint.pieces;
            meta = {
                name,
                description: description || "",
                difficulty,
                timeLimitSeconds: Math.floor(parsedTimeSeconds),
                author: (req as any).username || "Anonymous",
                angle: 180,
                miniatureType: 0,
            };
        }

        if (!meta || !grid || !pieces) {
            res.status(400).json({
                message: "name/blueprint or meta/grid/pieces are required",
            });
            return;
        }

        // Generate unique code
        let code = generateCode();
        let attempts = 0;
        while (await Level.findOne({ code })) {
            code = generateCode();
            attempts++;
            if (attempts > 100) {
                res.status(500).json({
                    message: "Failed to generate unique code",
                });
                return;
            }
        }

        const now = new Date();
        const created = now.toLocaleString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        });

        const level = await Level.create({
            code,
            meta: {
                ...meta,
                id: generateId(),
                puzzleFormatVersion: 1,
                created,
                miniatureType: meta.miniatureType ?? 0,
                timeLimitSeconds: Math.max(0, Number(meta.timeLimitSeconds ?? 0)),
            },
            grid,
            pieces,
            author: req.userId,
            thumbnailData,
        });

        await level.populate("author", "username");
        res.status(201).json({ level, code });
    } catch (error) {
        console.error("CreateLevel error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const updateLevel = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const level = await Level.findOne({ code: getCodeParam(req) });

        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        if (level.author.toString() !== req.userId) {
            res.status(403).json({ message: "Not authorized" });
            return;
        }

        const { meta, grid, pieces, thumbnailData } = req.body;
        if (meta && Object.prototype.hasOwnProperty.call(meta, "timeLimitSeconds")) {
            const parsedTimeSeconds = Number(meta.timeLimitSeconds);
            if (
                Number.isNaN(parsedTimeSeconds) ||
                parsedTimeSeconds < 0 ||
                !Number.isFinite(parsedTimeSeconds)
            ) {
                res.status(400).json({
                    message: "meta.timeLimitSeconds must be a non-negative number",
                });
                return;
            }
            meta.timeLimitSeconds = Math.floor(parsedTimeSeconds);
        }

        if (meta) Object.assign(level.meta, meta);
        if (grid) level.grid = grid;
        if (pieces) level.pieces = pieces;
        if (thumbnailData) level.thumbnailData = thumbnailData;

        await level.save();
        res.json({ level });
    } catch (error) {
        console.error("UpdateLevel error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const deleteLevel = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const level = await Level.findOne({ code: getCodeParam(req) });

        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        if (level.author.toString() !== req.userId) {
            res.status(403).json({ message: "Not authorized" });
            return;
        }

        // Also remove associated favorites
        await Favorite.deleteMany({ level: level._id });
        await level.deleteOne();
        res.json({ message: "Level deleted" });
    } catch (error) {
        console.error("DeleteLevel error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const getUserLevels = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const levels = await Level.find({ author: req.params.userId })
            .sort({ publishedAt: -1 })
            .populate("author", "username")
            .lean();

        res.json({ levels });
    } catch (error) {
        console.error("GetUserLevels error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const downloadLevel = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const level = await Level.findOneAndUpdate(
            { code: getCodeParam(req) },
            { $inc: { downloads: 1 } },
            { new: true },
        );

        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        const cubismData = {
            meta: level.meta,
            grid: level.grid,
            pieces: level.pieces,
        };

        res.setHeader("Content-Type", "application/json");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${level.meta.name}.cube"`,
        );
        res.json(cubismData);
    } catch (error) {
        console.error("DownloadLevel error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
