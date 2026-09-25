import { Router } from "express";
import healthRoutes from "./health.routes";

// Aggregates all versioned API routes. Later phases (auth, kits,
// generation, practice) register their routers here.
const router = Router();

router.use("/health", healthRoutes);

export default router;
