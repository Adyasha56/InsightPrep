import { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";

// Aggregates all versioned API routes. Later phases (kits, generation,
// practice) register their routers here.
const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);

export default router;
