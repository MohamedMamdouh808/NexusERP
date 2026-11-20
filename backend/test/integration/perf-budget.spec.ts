import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../fixtures/app';

describe('perf budget', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const built = await createTestApp();
    app = built.app;
  });
  afterAll(async () => {
    await app.close();
  });

  it('auth/me stays within the context budget', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'perf.owner@nexusperf.test', password: 'Performance#019' })
      .expect(200);
    const cookie = (loginRes.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(Number(res.headers['x-query-count'])).toBeLessThanOrEqual(2);
  });
});
