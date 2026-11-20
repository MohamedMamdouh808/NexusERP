import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../fixtures/app';

describe('perf context count', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const built = await createTestApp();
    app = built.app;
  });
  afterAll(async () => {
    await app.close();
  });

  it('auth/me uses at most 2 context queries', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'perf.owner@nexusperf.test', password: 'Performance#019' })
      .expect(200);
    const cookie = (loginRes.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    console.log('ME_QUERY_COUNT=' + me.headers['x-query-count']);
    expect(Number(me.headers['x-query-count'])).toBeLessThanOrEqual(2);
  });
});
