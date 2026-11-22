import { buildApp } from './app.js'
import { scheduleEventsRetention } from './utils/retention.js'

const app = buildApp()

// Opt-in analytics retention: does nothing (no timer, no deletes) unless
// EVENTS_RETENTION_DAYS is an integer >= 30. Deliberately here and not in
// buildApp(), so tests and in-memory apps never run it.
const retentionTimer = scheduleEventsRetention(app.db, process.env.EVENTS_RETENTION_DAYS, app.log)

const shutdown = async (signal: string) => {
  if (retentionTimer) clearInterval(retentionTimer)
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
