import * as sql3 from './sqlite3.promises'
import { populateDB } from '../exampleDataDomain'
import { toCamelCaseFields } from '../jsext/objects'

// TODO: Extract from this module an Authorization Example Data Domain.
//
// This data source should be useful for development: an easy and disposable
// database to rapidly get the app running in a new dev env. It should also be
// useful for testing.
//
// In the context of the Bureaucrat app, data sources are manageable CRUD
// interfaces (or CRUD like), such as a SQL database, a REST API, a
// GraphQL API, or anything mappable in some way to the DataSource
// interface (yet to be defined).

export default class Database {
  private _db?: Promise<sql3.Database>

  async users(): Promise<any[]> {
    const db = await this.db()
    const users = await db.all('SELECT * FROM users')
    return users.map(u => toCamelCaseFields(u))
  }

  async features(): Promise<any[]> {
    const db = await this.db()
    const features = await db.all('SELECT * FROM features')
    return features.map(f => toCamelCaseFields(f))
  }

  /**
   * Lazy loads the database connection.
   * It also creates the schema and populates the data.
   */
  private async db(): Promise<sql3.Database> {
    if (this._db) return this._db

    this._db = (async () => {
      const db = await sql3.Database.connect(':memory:')
      await populateDB(db)
      return db
    })()

    return this._db
  }
}
