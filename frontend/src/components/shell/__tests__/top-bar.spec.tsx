import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import request from 'supertest';

describe('Top bar API', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates user, organization, membership in one transaction', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `reg-test-${Date.now()}@example.com`, password: 'TestPassword123' });

      console.log('Register status:', response.statusCode);
      expect(response.statusCode).toBe(200);
      const body = response.body;
      expect(body.user).toMatchObject({ id: expect.any(String), email: expect.any(String) });
      expect(body.organization).toMatchObject({ id: expect.any(String), name: expect.any(String) });
      expect(body.membership).toMatchObject({ roleKey: 'administrator', isActive: true });
      expect(body.session).toMatchObject({ id: expect.any(String) });
      expect(body.csrfToken).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const email = 'login-test@example.com';
    const password = 'LoginPassword123';

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password });
    });

    it('logs in with correct credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password });

      expect(response.statusCode).toBe(200);
      const body = response.body;
      expect(body.user).toMatchObject({ id: expect.any(String), email });
      expect(body.membership).toMatchObject({ roleKey: 'administrator' });
      expect(body.session).toMatchObject({ id: expect.any(String) });
      expect(body.sessionToken).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('returns 403 without session cookie', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/logout');
      console.log('Logout status:', response.statusCode);
      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 without session cookie', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/me');
      console.log('Me status:', response.statusCode);
      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/auth/organizations', () => {
    it('returns 401 without session cookie', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/organizations');
      console.log('Orgs status:', response.statusCode);
      expect(response.statusCode).toBe(401);
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
