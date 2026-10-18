#!/bin/sh
# Container entrypoint (T033): apply migrations, then serve.
#
# T033 requires the image itself to "run migrations before serving". Running them
# here rather than as a separate compose step means the guarantee holds for every
# consumer of the image, including a hosting platform that runs only this image.
#
# A failed migration must be a failed container, not a half-migrated service that
# then serves traffic, so `set -e` matters here: a non-zero exit from the Prisma
# CLI aborts before the server is started.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "entrypoint: applying database migrations"
  npx prisma migrate deploy
fi

echo "entrypoint: starting the API"
exec node dist/main.js