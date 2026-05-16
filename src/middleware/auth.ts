import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export interface AuthRequest extends Request {
    userId?: string;
    username?: string;
    userIsAdmin?: boolean;
}

export const auth = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            res.status(401).json({ message: "Authentication required" });
            return;
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "default-secret",
        ) as { userId: string; username?: string };
        const user = await User.findById(decoded.userId).select(
            "username isAdmin isBanned",
        );
        if (!user) {
            res.status(401).json({ message: "Authentication required" });
            return;
        }
        if (user.isBanned) {
            res.status(403).json({ message: "Account is banned" });
            return;
        }
        req.userId = user._id.toString();
        req.username = user.username;
        req.userIsAdmin = Boolean(user.isAdmin);
        next();
    } catch (error) {
        res.status(401).json({ message: "Invalid or expired token" });
    }
};

export const optionalAuth = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET || "default-secret",
            ) as { userId: string; username?: string };
            const user = await User.findById(decoded.userId).select(
                "username isAdmin isBanned",
            );
            if (!user) {
                next();
                return;
            }
            if (user.isBanned) {
                res.status(403).json({ message: "Account is banned" });
                return;
            }
            req.userId = user._id.toString();
            req.username = user.username;
            req.userIsAdmin = Boolean(user.isAdmin);
        }
        next();
    } catch {
        next();
    }
};

export const adminOnly = (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): void => {
    if (!req.userIsAdmin) {
        res.status(403).json({ message: "Admin access required" });
        return;
    }
    next();
};
