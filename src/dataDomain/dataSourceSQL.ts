import { EntityMeta } from '.'
import { Database } from '../db/sqlite3.promises'

export const DataSource = {
  read: (db: Database, entityType: EntityMeta) => new ReadBuilder(db, entityType)
}

class ReadBuilder {
  private db: Database
  private et: EntityMeta

  constructor(db: Database, entityType: EntityMeta) {
    this.db = db
    this.et = entityType
  }

  async all(): Promise<any[]> {
    // TODO Validate schema of returned data?
    // TODO Use specific projection to fetch entities?
    // TODO Hide table name from UI? (dedicated EntityType#table field?)
    return await this.db.all(`SELECT * FROM ${this.et.code}`)
  }
}
