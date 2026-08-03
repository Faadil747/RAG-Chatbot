import { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wraps an async Express handler so rejected promises are forwarded to
 * `next()` and handled by the global error middleware, instead of being
 * swallowed as unhandled rejections.
 */
export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
