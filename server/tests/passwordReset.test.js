import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/index.js';
import { requestPasswordReset } from '../src/services/auth.service.js';
import { SEED_CREDENTIALS, seedDatabase } from '../src/seed/seedData.js';

let mongo;
const app = createApp();
const api = () => request(app);
const tokenFrom = (link) => new URL(link).searchParams.get('token');
const login = (email, password) => api().post('/api/auth/login').send({ email, password });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri('password-reset'));
  await seedDatabase();
}, 120000);

afterAll(async () => {
  await disconnectDb();
  if (mongo) await mongo.stop();
});

describe('forgot password', () => {
  it('answers the same way whether or not the email has an account', async () => {
    const known = await api().post('/api/auth/password/forgot').send({ email: SEED_CREDENTIALS.owner2.email });
    const unknown = await api().post('/api/auth/password/forgot').send({ email: 'nobody@goodpanda.test' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(known.body.token).toBeUndefined();
    expect(JSON.stringify(known.body)).not.toMatch(/reset-password\?token=/);
  });

  it('stores only a hash of the token, never the token itself', async () => {
    const { email } = SEED_CREDENTIALS.hubOperator;
    const { link } = await requestPasswordReset(email);
    const token = tokenFrom(link);
    expect(token).toMatch(/^[a-f\d]{64}$/);

    const stored = await User.findOne({ email }).select('+resetTokenHash +resetTokenExpiresAt');
    expect(stored.resetTokenHash).not.toBe(token);
    expect(stored.resetTokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(stored.resetTokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * 60 * 1000);

    // The reset fields never leave the server.
    const session = await login(email, SEED_CREDENTIALS.hubOperator.password);
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${session.body.token}`);
    expect(JSON.stringify(me.body)).not.toMatch(/resetToken|resetRequested/);
  });

  it('sends at most one link per minute for the same account', async () => {
    const { email } = SEED_CREDENTIALS.owner1;
    expect((await requestPasswordReset(email)).link).toBeTruthy();
    expect((await requestPasswordReset(email)).link).toBeNull();
  });

  it('ignores deactivated accounts', async () => {
    const user = await User.create({
      name: 'Inactive',
      email: 'inactive@goodpanda.test',
      passwordHash: 'x',
      phone: '+8801700000000',
      role: 'customer',
      isActive: false,
    });
    expect((await requestPasswordReset(user.email)).link).toBeNull();
  });
});

describe('reset password', () => {
  it('sets the new password once, then the link stops working and old logins are signed out', async () => {
    const { email, password } = SEED_CREDENTIALS.customer;
    const before = await login(email, password);
    expect(before.status).toBe(200);
    const oldToken = before.body.token;

    // Login tokens carry whole seconds; make sure the reset happens in a later second.
    await new Promise((r) => setTimeout(r, 1100));

    const token = tokenFrom((await requestPasswordReset(email)).link);
    const reset = await api().post('/api/auth/password/reset').send({ token, password: 'brand-new-pass' });
    expect(reset.status).toBe(200);

    expect((await login(email, password)).status).toBe(401);
    const after = await login(email, 'brand-new-pass');
    expect(after.status).toBe(200);

    // Every device that was logged in before the reset is signed out.
    const oldSession = await api().get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(oldSession.status).toBe(401);
    const newSession = await api().get('/api/auth/me').set('Authorization', `Bearer ${after.body.token}`);
    expect(newSession.status).toBe(200);

    // The same link can't be used twice.
    const again = await api().post('/api/auth/password/reset').send({ token, password: 'another-pass' });
    expect(again.status).toBe(400);
    expect(again.body.error.message).toMatch(/invalid or has expired/i);
  });

  it('refuses expired, unknown or malformed links and too-short passwords', async () => {
    const { email } = SEED_CREDENTIALS.admin;
    const token = tokenFrom((await requestPasswordReset(email)).link);

    expect((await api().post('/api/auth/password/reset').send({ token, password: '123' })).status).toBe(400);
    expect((await api().post('/api/auth/password/reset').send({ token: 'not-a-token', password: 'long-enough' })).status).toBe(400);
    const unknown = crypto.randomBytes(32).toString('hex');
    expect((await api().post('/api/auth/password/reset').send({ token: unknown, password: 'long-enough' })).status).toBe(400);

    await User.updateOne({ email }, { resetTokenExpiresAt: new Date(Date.now() - 1000) });
    const expired = await api().post('/api/auth/password/reset').send({ token, password: 'long-enough' });
    expect(expired.status).toBe(400);
    // The admin's password is unchanged.
    expect((await login(email, SEED_CREDENTIALS.admin.password)).status).toBe(200);
  });
});
