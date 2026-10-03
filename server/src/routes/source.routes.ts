import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import {
  createSource,
  listSources,
  bulkDeleteSources,
  getSource,
  deleteSource,
  importWebsite,
} from "../controllers/source.controller.js";

export const sourceRoutes = Router({ mergeParams: true });

sourceRoutes.get("/", asyncHandler(listSources));
sourceRoutes.post("/", asyncHandler(createSource));
sourceRoutes.post("/bulk-delete", asyncHandler(bulkDeleteSources));
sourceRoutes.get("/:sourceId", asyncHandler(getSource));
sourceRoutes.delete("/:sourceId", asyncHandler(deleteSource));
sourceRoutes.post("/import/website", asyncHandler(importWebsite));
