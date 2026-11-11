import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * Detail item shape shared by every 400 VALIDATION_ERROR envelope below.
 */
interface ValidationDetail {
  field: string;
  message: string;
}

function validationDetails(body: { details?: unknown }): ValidationDetail[] {
  return Array.isArray(body.details) ? (body.details as ValidationDetail[]) : [];
}

/**
 * T020: Contract test for POST /api/v1/memberships validation.
 * Validates 400 naming the field for missing/invalid password and empty/unknown roleIds.
 */
describe('T020: POST /api/v1/memberships contract validation', () => {
  let app: INestApplication;
  let actorCookie: string;

  beforeAll(async () => {
    const { app: testApp } = await createTestApp();
    app = testApp;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedTestDatabase();

    // Register actor with Administrator role
    const registerEmail = `actor-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: registerEmail, password: 'Password1234' })
      .expect(201);
    // Register issues no cookies by design - only login does.
    actorCookie = await loginForCookies(app, registerEmail, 'Password1234');
  });

  it('400 VALIDATION_ERROR when password is missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({ email: 'new@example.com', name: 'New', roleIds: ['dummy'] })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(validationDetails(response.body).some((d) => d.field === 'password')).toBe(true);
  });

  it('400 VALIDATION_ERROR when password is too short', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({ email: 'new@example.com', name: 'New', password: 'short', roleIds: ['dummy'] })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(validationDetails(response.body).some((d) => d.field === 'password')).toBe(true);
  });

  it('400 VALIDATION_ERROR when roleIds is empty', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({ email: 'new@example.com', name: 'New', password: 'Password1234', roleIds: [] })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(validationDetails(response.body).some((d) => d.field === 'roleIds')).toBe(true);
  });

  it('400 VALIDATION_ERROR when roleIds references unknown id', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({ email: 'new@example.com', name: 'New', password: 'Password1234', roleIds: ['00000000-0000-0000-0000-000000000000'] })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(validationDetails(response.body).some((d) => d.field === 'roleIds')).toBe(true);
  });
});
