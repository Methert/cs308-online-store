// Used for expected errors whose message may be shown to the user.
// Example: throw new AppError(409, 'Email is already registered');
// The errorHandler catches it and responds with { error: message }.
class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

module.exports = { AppError };
