import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import request from 'supertest';

describe('Auth API', () => {
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
    it('creates user and organization', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `reg-${Date.now()}@example.com`, password: 'TestPassword123' });

      expect(response.statusCode).toBe(200);
      const body = response.body;
      expect(body.user).toMatchObject({ id: expect.any(String), email: expect.any(String) });
      expect(body.organization).toMatchObject({ id: expect.any(String) });
      expect(body.membership).toMatchObject({ roleKey: 'administrator' });
      expect(body.session).toMatchObject({ id: expect.any(String) });
      expect(body.csrfToken).toBeDefined();
    });

    it('returns 400 for short password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'short@example.com', password: 'short' });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .body({ email: 'not-an-email', password: 'ValidPassword123' });
      expect(response.statusCode).toBe(400);
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

    it('returns 400 for wrong password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .body({ email, password: 'WrongPassword123' });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .body({ email: 'nonexistent@example.com', password: 'AnyPassword123' });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('Protected routes without session', () => {
    it('returns 403 for POST /api/v1/auth/logout', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/logout');
      expect(response.statusCode).toBe(403);
    });

    it('returns 403 for GET /api/v1/auth/me', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/me');
      expect(response.statusCode).toBe(403);
    });

    it('returns 403 for GET /api/v1/auth/organizations', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/organizations');
      expect(response.statusCode).toBe(403);
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
