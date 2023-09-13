import * as sqlite3 from 'sqlite3'

/**
 * Result for `Database.run(…)`.
 */
type RunResults = {
  /** The last generated ID in the run execution. */
  lastID: number,
  /** The number of rows affected by the run execution. */
  changes: number,
}

/**
 * SQLite3 Database Wrapper.
 * Mainly promisifies the original database class from SQLite3.
 */
export class Database {
  private inner: sqlite3.Database

  static async connect(filename: string): Promise<Database> {
    return new Promise((res, rej) => {
      let db: sqlite3.Database
      db = new sqlite3.Database(filename, err => {
        if (err) return rej(err)
        res(new Database(db))
      })
    })
  }

  private constructor(db: sqlite3.Database) {
    this.inner = db
  }

  async listAllTables(): Promise<string[]> {
    const tables: any[] = await this.all('SELECT name FROM sqlite_master WHERE type=\'table\'')
    return tables.map(x => x.name)
  }


  async all(sql: string, params?: any): Promise<unknown[]> {
    return new Promise((res, rej) => {
      this.inner.all(sql, params, (err, rows) => {
        if (err) return rej(err)
        res(rows)
      })
    })
  }

  async run(sql: string, params?: any): Promise<RunResults> {
    return new Promise((res, rej) => {
      this.inner.run(sql, params, function (err) {
        if (err) return rej(err)
        res({
          lastID: this.lastID,
          changes: this.changes,
        })
      })
    })
  }
}
