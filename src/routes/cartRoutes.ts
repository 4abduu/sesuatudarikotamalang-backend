import express from "express";
import { requireAuth } from "../middleware/authMiddleware";
import cartController from "../controllers/cartController";

const router = express.Router();
router.use(requireAuth);
router.get("/", cartController.listCart);
router.post("/items", cartController.addCartItem);
router.patch("/items/:id", cartController.updateCartItem);
router.delete("/items/:id", cartController.deleteCartItem);
router.delete("/", cartController.clearCart);
export default router;
