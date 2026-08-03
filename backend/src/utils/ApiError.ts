export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ApiError";
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string): ApiError {
    return new ApiError(400, message);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, message);
  }

  static badGateway(message: string): ApiError {
    return new ApiError(502, message);
  }

  static internal(message: string): ApiError {
    return new ApiError(500, message);
  }
}
