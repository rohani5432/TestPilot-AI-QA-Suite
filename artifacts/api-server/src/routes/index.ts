import { Router, type IRouter } from "express";
import healthRouter from "./health";
import testpilotRouter from "./testpilot";

const router: IRouter = Router();

router.use(healthRouter);
router.use(testpilotRouter);

export default router;
