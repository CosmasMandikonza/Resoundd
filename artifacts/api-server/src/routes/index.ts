import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze";
import authRouter from "./auth";
import savedAnalysesRouter from "./saved-analyses";
import enrichRouter from "./enrich";
import featuredRouter from "./featured";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);
router.use(authRouter);
router.use(savedAnalysesRouter);
router.use(enrichRouter);
router.use(featuredRouter);

export default router;
