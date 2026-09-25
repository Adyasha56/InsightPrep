import { Router } from "express";
import { register, login, logout, getCurrentUser } from "../controllers/auth.controller";
import { validateRequest } from "../middleware/validate.middleware";
import { registerSchema, loginSchema } from "../validators/auth.validator";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", validateRequest({ body: registerSchema }), register);
router.post("/login", validateRequest({ body: loginSchema }), login);
router.post("/logout", logout);
router.get("/me", requireAuth, getCurrentUser);

export default router;
