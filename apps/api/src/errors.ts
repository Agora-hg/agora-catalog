export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}
