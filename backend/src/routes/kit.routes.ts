import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validate.middleware";
import {
  createKitRequestSchema,
  recordFlashcardPracticeRequestSchema,
  regenerateKitRequestSchema,
  updateKitRequestSchema,
} from "../validators/kit.validator";
import { createKit, generateKit, getKit, listKits, recordPractice, regenerateKit, updateKit } from "../controllers/kit.controller";

const router = Router();

router.use(requireAuth);
router.post("/", validateRequest({ body: createKitRequestSchema }), createKit);
router.get("/", listKits);
router.get("/:kitId", getKit);
router.post("/:kitId/generate", generateKit);
router.patch("/:kitId", validateRequest({ body: updateKitRequestSchema }), updateKit);
router.post("/:kitId/regenerate", validateRequest({ body: regenerateKitRequestSchema }), regenerateKit);
router.patch(
  "/:kitId/flashcards/:flashcardId/practice",
  validateRequest({ body: recordFlashcardPracticeRequestSchema }),
  recordPractice
);

export default router;
