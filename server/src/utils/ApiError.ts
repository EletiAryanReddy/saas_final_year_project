export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  static badRequest = (m = 'Bad request', c?: string) => new ApiError(400, m, c);
  static unauthorized = (m = 'Unauthorized', c?: string) => new ApiError(401, m, c);
  static forbidden = (m = 'Forbidden', c?: string) => new ApiError(403, m, c);
  static notFound = (m = 'Not found') => new ApiError(404, m);
  static conflict = (m = 'Conflict', c?: string) => new ApiError(409, m, c);
}
