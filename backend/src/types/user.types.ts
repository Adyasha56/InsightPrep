// Identity decoded from a JWT — deliberately minimal, since the middleware
// verifies the token without a database round trip on every request.
export interface AuthTokenPayload {
  id: string;
}

// User shape returned to clients. Never includes the password hash.
export interface PublicUser {
  id: string;
  email: string;
  name?: string;
}
