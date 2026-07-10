import { buildApp } from './app.js'

const app = buildApp()

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`)
  await app.close()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })

app.listen(
  { port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' },
  (err, address) => {
    if (err) { console.error(err); process.exit(1) }
    console.log(`Server listening at ${address}`)
  }
)
