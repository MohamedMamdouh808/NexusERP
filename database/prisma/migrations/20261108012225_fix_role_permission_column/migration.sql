-- Rename column from "permission" to "permissionId" to match Prisma schema
ALTER TABLE "role_permissions" RENAME COLUMN "permission" TO "permissionId";
