import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validate.middleware";
import { createKitRequestSchema } from "../validators/kit.validator";
import { createKit, generateKit, getKit } from "../controllers/kit.controller";

const router = Router();

router.use(requireAuth);
router.post("/", validateRequest({ body: createKitRequestSchema }), createKit);
router.get("/:kitId", getKit);
router.post("/:kitId/generate", generateKit);

export default router;
