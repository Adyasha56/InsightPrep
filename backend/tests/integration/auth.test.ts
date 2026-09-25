import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createApp } from "../../src/app";
import { User } from "../../src/models/user.model";
import { startTestMongod, TestMongod } from "../helpers/testMongod";

const TEST_PORT = 27418;
const app = createApp();

describe("auth flow", () => {
  let mongod: TestMongod;

  beforeAll(async () => {
    mongod = await startTestMongod(TEST_PORT);
    await mongoose.connect(`mongodb://127.0.0.1:${TEST_PORT}/insightprep_test`);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  it("registers a new user, hashes the password, and sets a session cookie", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "jane@example.com", password: "password123", name: "Jane" });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("jane@example.com");
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeDefined();

    const stored = await User.findOne({ email: "jane@example.com" }).select("+passwordHash");
    expect(stored?.passwordHash).not.toBe("password123");
  });

  it("rejects duplicate registration", async () => {
    await request(app).post("/api/auth/register").send({ email: "dup@example.com", password: "password123" });
    const res = await request(app).post("/api/auth/register").send({ email: "dup@example.com", password: "password123" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_IN_USE");
  });

  it("rejects registration with an invalid payload", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with correct credentials and accesses the protected route", async () => {
    await request(app).post("/api/auth/register").send({ email: "login@example.com", password: "password123" });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({ email: "login@example.com", password: "password123" });
    expect(loginRes.status).toBe(200);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe("login@example.com");
  });

  it("rejects login with the wrong password", async () => {
    await request(app).post("/api/auth/register").send({ email: "wrong@example.com", password: "password123" });
    const res = await request(app).post("/api/auth/login").send({ email: "wrong@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects login for an unknown email with the same error as a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects protected route access without a token", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("rejects an invalid token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_INVALID");
  });

  it("rejects an expired token", async () => {
    const expiredToken = jwt.sign({}, process.env.JWT_SECRET as string, {
      subject: "507f1f77bcf86cd799439011",
      expiresIn: -10,
    });

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("logs out and clears the session so the protected route becomes unreachable", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "logout@example.com", password: "password123" });

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(401);
  });
});
