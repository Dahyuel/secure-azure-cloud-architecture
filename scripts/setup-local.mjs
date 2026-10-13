import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const content = `# Generated local-only credentials; never commit this file.\nPOSTGRES_ADMIN_PASSWORD=${randomBytes(32).toString('hex')}\nPOSTGRES_APP_PASSWORD=${randomBytes(32).toString('hex')}\n`;
try {
  await writeFile(new URL('../.env', import.meta.url), content, { flag: 'wx', mode: 0o600 });
  console.log(
    'Created .env with independent random local credentials. Start Docker Desktop, then run docker compose up --build.',
  );
} catch (error) {
  if (error.code === 'EEXIST')
    console.log(
      'Existing .env preserved. Changing database credentials requires a separate rotation procedure.',
    );
  else throw error;
}
