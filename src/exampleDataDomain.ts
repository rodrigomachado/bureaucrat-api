import { log } from 'console'
import * as sql3 from './db/sqlite3.promises'

// This data domain should be useful for development: an easy and disposable
// database to rapidly get the app running in a new dev env. It should also be
// useful for testing and complete (exemplify all the features that a
// Data Domain cam present).
//
// In the context of the Bureaucrat app, data sources are manageable CRUD
// interfaces (or CRUD like), such as a SQL database, a REST API, a
// GraphQL API, or anything mappable in some way to the DataSource
// interface (yet to be defined).


/**
 * Creates and populates the Authorization Data Domain example database.
 * It only creates and populates tables if they're absent.
 */
export async function populateDB(db: sql3.Database): Promise<void> {
  const tables = await db.listAllTables()
  const createTable = async (
    name: string, fn: (db: sql3.Database) => Promise<void>,
  ) => {
    if (tables.includes(name)) return
    await fn(db)
    log(`Example Data Domain table created: ${name}`)
  }

  await createTable('users', createUsers)
  await createTable('features', createFeatures)

  log(`Tables: ${await db.listAllTables()}`)
}

async function createUsers(db: sql3.Database): Promise<void> {
  await db.run(`
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      middle_name TEXT,
      last_name TEXT,
      birth_date TEXT
    )
  `)

  const addUser = async (
    firstName: string, middleName: string, lastName: string, birthDate: string
  ) => (
    await db.run(`
      INSERT INTO user (first_name, middle_name, last_name, birth_date)
      VALUES (?, ?, ?, ?)
    `, [firstName, middleName, lastName, birthDate])
  )
  await addUser('Douglas', 'Noël', 'Adams', '1767-07-11')
  await addUser('John', 'Marwood', 'Cleese', '1939-10-27')
  await addUser('Rowan', 'Sebastian', 'Atkinson', '1955-01-06')
  await addUser('Isaac', '', 'Asimov', '1920-01-02')
  await addUser('Mary', 'Wollstonecraft', 'Shelley', '1797-08-30')
}

async function createFeatures(db: sql3.Database): Promise<void> {
  await db.run(`
    CREATE TABLE feature (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      path TEXT
    )
  `)

  const addFeature = async (name: string, path: string) => (
    await db.run(`
      INSERT INTO feature (name, path)
      VALUES (?,?)
    `, [name, path])
  )
  await addFeature('CreateUser', 'user')
  await addFeature('ReadUser', 'user')
  await addFeature('UpdateUser', 'user')
  await addFeature('DeleteUser', 'user')
}
