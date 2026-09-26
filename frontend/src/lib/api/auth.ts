import { apiRequest } from "./client";
import { PublicUser } from "@/types/auth";

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export function register(input: RegisterInput): Promise<{ user: PublicUser }> {
  return apiRequest("/auth/register", { method: "POST", body: input });
}

export function login(input: LoginInput): Promise<{ user: PublicUser }> {
  return apiRequest("/auth/login", { method: "POST", body: input });
}

export function logout(): Promise<{ loggedOut: boolean }> {
  return apiRequest("/auth/logout", { method: "POST" });
}

export function getCurrentUser(): Promise<{ user: PublicUser }> {
  return apiRequest("/auth/me");
}
