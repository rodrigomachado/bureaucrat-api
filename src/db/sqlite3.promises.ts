import * as sqlite3 from 'sqlite3'

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

  async all(sql: string): Promise<unknown[]> {
    return new Promise((res, rej) => {
      this.inner.all(sql, (err, rows) => {
        if (err) return rej(err)
        res(rows)
      })
    })
  }

  async run(sql: string, params?: any): Promise<void> {
    return new Promise((res, rej) => {
      this.inner.run(sql, params, err => {
        if (err) return rej(err)
        res()
      })
    })
  }
}
