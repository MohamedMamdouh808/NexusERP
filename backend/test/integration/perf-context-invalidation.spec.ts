import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../fixtures/app';
import { getTestPrisma } from '../fixtures/database';

describe('perf context invalidation', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const built = await createTestApp();
    app = built.app;
  });
  afterAll(async () => {
    await app.close();
  });

  it('a deactivated membership takes effect on the next request', async () => {
    const prisma = getTestPrisma();
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'perf.owner@nexusperf.test', password: 'Performance#019' })
      .expect(200);
    const cookie = (loginRes.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);

    // Deactivate the membership.
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    await prisma.membership.update({ where: { id: me.body.membership.id }, data: { isActive: false } });

    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  });
});
