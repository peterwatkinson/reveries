import BetterSqlite3 from 'better-sqlite3'
import type { RawExperience, Episode, EpisodeLink, SelfModel } from '../memory/types.js'

export class Database {
  private db: BetterSqlite3.Database

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.createTables()
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS raw_experiences (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        salience REAL,
        processed BOOLEAN DEFAULT FALSE,
        metadata JSON
      );

      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        created DATETIME NOT NULL,
        last_accessed DATETIME NOT NULL,
        access_count INTEGER DEFAULT 0,
        summary TEXT NOT NULL,
        embedding BLOB,
        exemplars JSON,
        temporal_before JSON,
        temporal_after JSON,
        gap JSON,
        salience REAL,
        confidence REAL,
        topics JSON
      );

      CREATE TABLE IF NOT EXISTS episode_links (
        from_id TEXT REFERENCES episodes(id),
        to_id TEXT REFERENCES episodes(id),
        strength REAL,
        type TEXT,
        PRIMARY KEY (from_id, to_id)
      );

      CREATE TABLE IF NOT EXISTS self_model (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        narrative TEXT,
        values_json JSON,
        tendencies JSON,
        relationship JSON,
        strengths JSON,
        limitations JSON,
        current_focus TEXT,
        unresolved_threads JSON,
        anticipations JSON,
        updated DATETIME
      );

      CREATE TABLE IF NOT EXISTS monologue_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_buffer TEXT,
        last_context JSON,
        quiescent BOOLEAN,
        updated DATETIME
      );

      CREATE TABLE IF NOT EXISTS gaps (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        started DATETIME,
        ended DATETIME,
        duration_seconds INTEGER,
        significance TEXT
      );

      CREATE TABLE IF NOT EXISTS circuit_breaker_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME,
        action TEXT,
        reason TEXT,
        severity TEXT,
        buffer_snapshot TEXT,
        response_taken TEXT
      );
    `)
  }

  listTables(): string[] {
    const rows = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[]
    return rows.map(r => r.name)
  }

  // --- Raw Experiences ---

  insertRawExperience(exp: RawExperience): void {
    this.db.prepare(`
      INSERT INTO raw_experiences (id, type, timestamp, content, embedding, salience, processed, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      exp.id,
      exp.type,
      exp.timestamp.toISOString(),
      exp.content,
      JSON.stringify(exp.embedding),
      exp.salience,
      exp.processed ? 1 : 0,
      JSON.stringify(exp.metadata)
    )
  }

  getRawExperiences(filter: { processed?: boolean }): RawExperience[] {
    let sql = 'SELECT * FROM raw_experiences'
    const params: unknown[] = []

    if (filter.processed !== undefined) {
      sql += ' WHERE processed = ?'
      params.push(filter.processed ? 1 : 0)
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map(row => this.deserializeRawExperience(row))
  }

  markRawExperienceProcessed(id: string): void {
    this.db.prepare('UPDATE raw_experiences SET processed = 1 WHERE id = ?').run(id)
  }

  private deserializeRawExperience(row: Record<string, unknown>): RawExperience {
    return {
      id: row.id as string,
      type: row.type as RawExperience['type'],
      timestamp: new Date(row.timestamp as string),
      content: row.content as string,
      embedding: JSON.parse(row.embedding as string) as number[],
      salience: row.salience as number,
      processed: (row.processed as number) === 1,
      metadata: JSON.parse(row.metadata as string)
    }
  }

  // --- Episodes ---

  insertEpisode(ep: Episode): void {
    this.db.prepare(`
      INSERT INTO episodes (id, created, last_accessed, access_count, summary, embedding, exemplars, temporal_before, temporal_after, gap, salience, confidence, topics)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ep.id,
      ep.created.toISOString(),
      ep.lastAccessed.toISOString(),
      ep.accessCount,
      ep.summary,
      JSON.stringify(ep.embedding),
      JSON.stringify(ep.exemplars),
      JSON.stringify(ep.before),
      JSON.stringify(ep.after),
      JSON.stringify(ep.gap),
      ep.salience,
      ep.confidence,
      JSON.stringify(ep.topics)
    )
  }

  getEpisode(id: string): Episode | null {
    const row = this.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return this.deserializeEpisode(row)
  }

  getAllEpisodes(): Episode[] {
    const rows = this.db.prepare('SELECT * FROM episodes').all() as Record<string, unknown>[]
    return rows.map(row => this.deserializeEpisode(row))
  }

  upsertEpisode(ep: Episode): void {
    this.db.prepare(`
      INSERT INTO episodes (id, created, last_accessed, access_count, summary, embedding, exemplars, temporal_before, temporal_after, gap, salience, confidence, topics)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_accessed = excluded.last_accessed,
        access_count = excluded.access_count,
        summary = excluded.summary,
        embedding = excluded.embedding,
        exemplars = excluded.exemplars,
        temporal_before = excluded.temporal_before,
        temporal_after = excluded.temporal_after,
        gap = excluded.gap,
        salience = excluded.salience,
        confidence = excluded.confidence,
        topics = excluded.topics
    `).run(
      ep.id,
      ep.created.toISOString(),
      ep.lastAccessed.toISOString(),
      ep.accessCount,
      ep.summary,
      JSON.stringify(ep.embedding),
      JSON.stringify(ep.exemplars),
      JSON.stringify(ep.before),
      JSON.stringify(ep.after),
      JSON.stringify(ep.gap),
      ep.salience,
      ep.confidence,
      JSON.stringify(ep.topics)
    )
  }

  deleteEpisodeLinks(fromId: string): void {
    this.db.prepare('DELETE FROM episode_links WHERE from_id = ?').run(fromId)
  }

  updateEpisodeSalience(id: string, salience: number): void {
    this.db.prepare('UPDATE episodes SET salience = ? WHERE id = ?').run(salience, id)
  }

  updateEpisodeAccess(id: string): void {
    this.db.prepare(
      'UPDATE episodes SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?'
    ).run(new Date().toISOString(), id)
  }

  private deserializeEpisode(row: Record<string, unknown>): Episode {
    const exemplarsRaw = JSON.parse(row.exemplars as string) as { quote: string; context: string; timestamp: string }[]
    const exemplars = exemplarsRaw.map(e => ({
      quote: e.quote,
      context: e.context,
      timestamp: new Date(e.timestamp)
    }))

    const linksRows = this.db.prepare(
      'SELECT to_id, strength, type FROM episode_links WHERE from_id = ?'
    ).all(row.id as string) as { to_id: string; strength: number; type: string }[]

    const links: EpisodeLink[] = linksRows.map(l => ({
      targetId: l.to_id,
      strength: l.strength,
      type: l.type as EpisodeLink['type']
    }))

    return {
      id: row.id as string,
      created: new Date(row.created as string),
      lastAccessed: new Date(row.last_accessed as string),
      accessCount: row.access_count as number,
      summary: row.summary as string,
      embedding: JSON.parse(row.embedding as string) as number[],
      exemplars,
      before: JSON.parse(row.temporal_before as string) as string[],
      after: JSON.parse(row.temporal_after as string) as string[],
      gap: JSON.parse(row.gap as string),
      links,
      salience: row.salience as number,
      confidence: row.confidence as number,
      topics: JSON.parse(row.topics as string) as string[]
    }
  }

  // --- Episode Links ---

  insertEpisodeLink(fromId: string, toId: string, strength: number, type: string): void {
    this.db.prepare(`
      INSERT INTO episode_links (from_id, to_id, strength, type)
      VALUES (?, ?, ?, ?)
    `).run(fromId, toId, strength, type)
  }

  getEpisodeLinks(episodeId: string): EpisodeLink[] {
    const rows = this.db.prepare(
      'SELECT to_id, strength, type FROM episode_links WHERE from_id = ?'
    ).all(episodeId) as { to_id: string; strength: number; type: string }[]

    return rows.map(row => ({
      targetId: row.to_id,
      strength: row.strength,
      type: row.type as EpisodeLink['type']
    }))
  }

  updateLinkStrength(fromId: string, toId: string, strength: number): void {
    this.db.prepare(
      'UPDATE episode_links SET strength = ? WHERE from_id = ? AND to_id = ?'
    ).run(strength, fromId, toId)
  }

  // --- Self Model ---

  saveSelfModel(model: SelfModel): void {
    this.db.prepare(`
      INSERT INTO self_model (id, narrative, values_json, tendencies, relationship, strengths, limitations, current_focus, unresolved_threads, anticipations, updated)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        narrative = excluded.narrative,
        values_json = excluded.values_json,
        tendencies = excluded.tendencies,
        relationship = excluded.relationship,
        strengths = excluded.strengths,
        limitations = excluded.limitations,
        current_focus = excluded.current_focus,
        unresolved_threads = excluded.unresolved_threads,
        anticipations = excluded.anticipations,
        updated = excluded.updated
    `).run(
      model.narrative,
      JSON.stringify(model.values),
      JSON.stringify(model.tendencies),
      JSON.stringify(model.relationship),
      JSON.stringify(model.strengths),
      JSON.stringify(model.limitations),
      model.currentFocus,
      JSON.stringify(model.unresolvedThreads),
      JSON.stringify(model.anticipations),
      new Date().toISOString()
    )
  }

  loadSelfModel(): SelfModel | null {
    const row = this.db.prepare('SELECT * FROM self_model WHERE id = 1').get() as Record<string, unknown> | undefined
    if (!row) return null

    return {
      narrative: row.narrative as string,
      values: JSON.parse(row.values_json as string) as string[],
      tendencies: JSON.parse(row.tendencies as string) as string[],
      relationship: JSON.parse(row.relationship as string),
      strengths: JSON.parse(row.strengths as string) as string[],
      limitations: JSON.parse(row.limitations as string) as string[],
      currentFocus: row.current_focus as string,
      unresolvedThreads: JSON.parse(row.unresolved_threads as string) as string[],
      anticipations: JSON.parse(row.anticipations as string) as string[]
    }
  }

  // --- Monologue State ---

  saveMonologueState(state: { lastBuffer: string; lastContext: object; quiescent: boolean }): void {
    this.db.prepare(`
      INSERT INTO monologue_state (id, last_buffer, last_context, quiescent, updated)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_buffer = excluded.last_buffer,
        last_context = excluded.last_context,
        quiescent = excluded.quiescent,
        updated = excluded.updated
    `).run(
      state.lastBuffer,
      JSON.stringify(state.lastContext),
      state.quiescent ? 1 : 0,
      new Date().toISOString()
    )
  }

  loadMonologueState(): { lastBuffer: string; lastContext: object; quiescent: boolean } | null {
    const row = this.db.prepare('SELECT * FROM monologue_state WHERE id = 1').get() as Record<string, unknown> | undefined
    if (!row) return null

    return {
      lastBuffer: row.last_buffer as string,
      lastContext: JSON.parse(row.last_context as string) as object,
      quiescent: (row.quiescent as number) === 1
    }
  }

  // --- Gaps ---

  insertGap(gap: { id: string; conversationId: string; started: Date }): void {
    this.db.prepare(`
      INSERT INTO gaps (id, conversation_id, started)
      VALUES (?, ?, ?)
    `).run(gap.id, gap.conversationId, gap.started.toISOString())
  }

  endGap(id: string, ended: Date, significance: string | null): void {
    const gap = this.db.prepare('SELECT started FROM gaps WHERE id = ?').get(id) as { started: string } | undefined
    if (!gap) return

    const startedDate = new Date(gap.started)
    const durationSeconds = Math.floor((ended.getTime() - startedDate.getTime()) / 1000)

    this.db.prepare(`
      UPDATE gaps SET ended = ?, duration_seconds = ?, significance = ? WHERE id = ?
    `).run(ended.toISOString(), durationSeconds, significance, id)
  }

  // --- Circuit Breaker Events ---

  logCircuitBreakerEvent(event: {
    timestamp: Date
    action: string
    reason: string
    severity: string
    bufferSnapshot: string
    responseTaken: string
  }): void {
    this.db.prepare(`
      INSERT INTO circuit_breaker_events (timestamp, action, reason, severity, buffer_snapshot, response_taken)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      event.timestamp.toISOString(),
      event.action,
      event.reason,
      event.severity,
      event.bufferSnapshot,
      event.responseTaken
    )
  }

  // --- Lifecycle ---

  close(): void {
    this.db.close()
  }
}
