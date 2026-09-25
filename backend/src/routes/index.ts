import { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";
import researchRoutes from "./research.routes";
import kitRoutes from "./kit.routes";

// Aggregates all versioned API routes. Later phases (practice, regeneration)
// register their routers here.
const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/research", researchRoutes);
router.use("/kits", kitRoutes);

export default router;
