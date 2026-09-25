import { Router } from "express";
import { researchCompanyEndpoint } from "../controllers/research.controller";
import { validateRequest } from "../middleware/validate.middleware";
import { companyResearchRequestSchema } from "../validators/url.validator";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/company", requireAuth, validateRequest({ body: companyResearchRequestSchema }), researchCompanyEndpoint);

export default router;
