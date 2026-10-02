import {
  createTextOrMarkdownSource,
  listSourcesForWorkspace,
  bulkDeleteSourcesForWorkspace,
  deleteSourceForWorkspace,
  getSourceForWorkspace,
} from "../services/source.services.js";
import { ValidationError } from "../types/app-error.js";
import { workspaceIdParamSchema } from "../validators/workspace.validator.js";
import { getZodFieldErrors } from "../utils/zod-error.js";
import {
  createSourceSchema,
  listSourcesQuerySchema,
  sourceIdParamSchema,
  bulkDeleteSourcesSchema,
} from "../validators/source.validators.js";
import type { Request, Response } from "express";

function parseWorkspaceId(params: Request["params"]) {
  const parsed = workspaceIdParamSchema.safeParse(params);

  if (!parsed.success) {
    throw new ValidationError(
      "Invalid workspace id",
      getZodFieldErrors(parsed.error),
    );
  }

  return parsed.data;
}

function parseListQuery(query: Request["query"]) {
  const parsed = listSourcesQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw new ValidationError(
      "Invalid query parameters",
      getZodFieldErrors(parsed.error),
    );
  }

  return parsed.data;
}

function parseSourceParams(params: Request["params"]) {
  const parsed = sourceIdParamSchema.safeParse(params);

  if (!parsed.success) {
    throw new ValidationError(
      "Invalid source id",
      getZodFieldErrors(parsed.error),
    );
  }

  return parsed.data;
}

export async function listSources(req: Request, res: Response) {
  const { workspaceId } = parseWorkspaceId(req.params);
  const filters = parseListQuery(req.query);
  const sources = await listSourcesForWorkspace(
    workspaceId,
    req.session.user.id,
    filters,
  );
  res.json(sources);
}

function parseCreateBody(body: unknown) {
  const parsed = createSourceSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(
      "Validation failed",
      getZodFieldErrors(parsed.error),
    );
  }

  return parsed.data;
}

export async function createSource(req: Request, res: Response) {
  const { workspaceId } = parseWorkspaceId(req.params);
  const input = parseCreateBody(req.body);
  const source = await createTextOrMarkdownSource(
    workspaceId,
    req.session.user.id,
    input,
  );
  res.status(201).json(source);
}

function parseBulkDeleteBody(body: unknown) {
  const parsed = bulkDeleteSourcesSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(
      "Validation failed",
      getZodFieldErrors(parsed.error),
    );
  }

  return parsed.data;
}

export async function getSource(req: Request, res: Response) {
  const { workspaceId, sourceId } = parseSourceParams(req.params);
  const source = await getSourceForWorkspace(
    workspaceId,
    sourceId,
    req.session.user.id,
  );
  res.json(source);
}

export async function deleteSource(req: Request, res: Response) {
  const { workspaceId, sourceId } = parseSourceParams(req.params);
  await deleteSourceForWorkspace(workspaceId, sourceId, req.session.user.id);
  res.status(204).send();
}

export async function bulkDeleteSources(req: Request, res: Response) {
  const { workspaceId } = parseWorkspaceId(req.params);
  const input = parseBulkDeleteBody(req.body);
  await bulkDeleteSourcesForWorkspace(
    workspaceId,
    req.session.user.id,
    input.sourceIds,
  );
  res.status(204).send();
}
