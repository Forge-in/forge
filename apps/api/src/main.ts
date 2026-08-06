import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 4000 keeps the API clear of the Next.js dashboards (3000/3001) so
  // `pnpm dev` can run every app at once.
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
